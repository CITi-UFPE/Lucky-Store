from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.database import get_db
from app.models.user import User
from app.models.status_history import StatusHistory, EntityType
from app.models.audit_log import AuditLog
from app.schemas.cotacao import (
    CotacaoCreate, CotacaoUpdate, CotacaoResponse,
    CotacaoListResponse, PhaseUpdate,
)
from app.schemas.status_history import StatusHistoryResponse
from app.schemas.audit_log import AuditLogResponse
from app.services.cotacao import CotacaoService
from app.utils.errors import NotFoundException, BusinessLogicException, to_http_exception, erro_http
from app.api.routes.auth import get_current_user_dep
from app.utils.idempotencia import normalizar_chave


class QuoteHistoryResponse(BaseModel):
    quote_id: UUID
    status_history: List[StatusHistoryResponse]
    audit_logs: List[AuditLogResponse]

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.post("", response_model=CotacaoResponse, status_code=status.HTTP_201_CREATED)
def create_quote(
    response: Response,
    data: CotacaoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Cria cotação. Com Idempotency-Key, repetir a chamada não cria outra.

    Continua 201 no reenvio, e não 200: para a tela o resultado é o mesmo
    ("a cotação está criada, aqui está ela"). Quem precisa distinguir lê o
    header Idempotent-Replay.
    """
    chave = normalizar_chave(idempotency_key)
    try:
        cotacao = CotacaoService.create(db, data, current_user.id, idempotency_key=chave)
    except Exception as exc:
        raise erro_http(exc, "criar a cotação")
    if getattr(cotacao, "idempotent_replay", False):
        response.headers["Idempotent-Replay"] = "true"
    return cotacao


@router.get("", response_model=CotacaoListResponse)
def list_quotes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    id_loja: Optional[UUID] = Query(default=None),
    id_vendedor: Optional[UUID] = Query(default=None),
    cliente: Optional[str] = Query(default=None, description="Busca parcial por nome"),
    data_inicio: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    data_fim: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    # Pelo indice: ele vem de uma sequence, entao o maior e o mais recente.
    sort_by: str = Query(default="numero"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    eligible_for_order: Optional[bool] = Query(default=None, description="Se true, retorna apenas cotações fechadas ou caídas"),
    numero_requisicao: Optional[str] = Query(default=None),
    numero: Optional[int] = Query(default=None, ge=1, le=2147483647, description="Índice exato da cotação"),
    busca: Optional[str] = Query(
        default=None,
        description="Procura em indice (exato), Nº de requisicao, cliente e empresa",
    ),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    items, total, pages = CotacaoService.list(
        db, page=page, limit=limit,
        id_loja=id_loja, id_vendedor=id_vendedor, cliente=cliente,
        data_inicio=data_inicio, data_fim=data_fim,
        sort_by=sort_by, sort_dir=sort_dir,
        eligible_for_order=eligible_for_order,
        numero_requisicao=numero_requisicao,
        numero=numero,
        busca=busca,
    )
    return CotacaoListResponse(items=items, total=total, page=page, limit=limit, pages=pages)


@router.get("/{quote_id}", response_model=CotacaoResponse)
def get_quote(
    quote_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    try:
        return CotacaoService.get_by_id(db, quote_id)
    except NotFoundException as exc:
        raise to_http_exception(exc)


@router.put("/{quote_id}", response_model=CotacaoResponse)
@router.put("/{quote_id}/complete", response_model=CotacaoResponse)
def update_quote(
    quote_id: UUID,
    data: CotacaoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    try:
        return CotacaoService.update(db, quote_id, data, current_user.id)
    except NotFoundException as exc:
        raise to_http_exception(exc)
    except Exception as exc:
        raise erro_http(exc, "salvar a cotação")


@router.patch("/{quote_id}/phase", response_model=CotacaoResponse)
def update_phase(
    quote_id: UUID,
    data: PhaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    try:
        return CotacaoService.update_phase(db, quote_id, data, current_user.id)
    except NotFoundException as exc:
        raise to_http_exception(exc)
    except BusinessLogicException as exc:
        raise to_http_exception(exc)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.get("/{quote_id}/history", response_model=QuoteHistoryResponse)
def get_quote_history(
    quote_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    status_history = (
        db.query(StatusHistory)
        .filter(
            StatusHistory.entity_type == EntityType.COTACAO,
            StatusHistory.entity_id == quote_id,
        )
        .order_by(StatusHistory.changed_at.asc())
        .all()
    )
    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "cotacao", AuditLog.entity_id == quote_id)
        .order_by(AuditLog.changed_at.asc())
        .all()
    )
    return QuoteHistoryResponse(
        quote_id=quote_id,
        status_history=[StatusHistoryResponse.model_validate(h) for h in status_history],
        audit_logs=[AuditLogResponse.model_validate(log) for log in audit_logs],
    )


@router.delete("/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quote(
    quote_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    try:
        CotacaoService.soft_delete(db, quote_id, current_user.id)
    except NotFoundException as exc:
        raise to_http_exception(exc)
