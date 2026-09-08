from decimal import Decimal
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from uuid import UUID
from app.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.status_history import StatusHistory, EntityType
from app.models.rma import Rma
from app.models.item_rma import ItemRma
from app.schemas.pedido import (
    FretePagoUpdate,
    PedidoCreate, PedidoUpdate, PedidoResponse,
    PedidoDetailResponse, PedidoListResponse, PedidoListItemResponse,
    StatusChangeRequest, StatusHistoryOut,
    FormaPagamentoOut, FreteCreate, FreteOut, CustoPedidoOut,
)
from app.schemas.produto import ProdutoResponse
from app.models.pedido import Frete
from app.schemas.audit_log import AuditLogResponse
from app.schemas.status_history import StatusHistoryResponse
from app.services.pedido import PedidoService
from app.utils.errors import NotFoundException, BusinessLogicException, to_http_exception, erro_http
from app.api.routes.auth import get_current_user_dep
from app.utils.idempotencia import normalizar_chave
from pydantic import BaseModel


class OrderHistoryResponse(BaseModel):
    order_id: UUID
    status_history: List[StatusHistoryResponse]
    audit_logs: List[AuditLogResponse]


def _total_estornado(db: Session, pedido_id: UUID) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(ItemRma.valor_estornado), 0))
        .join(Rma, ItemRma.id_rma == Rma.id)
        .filter(Rma.id_pedido_origem == pedido_id)
        .scalar()
    )
    return Decimal(str(total))


def _batch_total_estornado(db: Session, pedido_ids: list) -> dict:
    if not pedido_ids:
        return {}
    from sqlalchemy import text as _text
    rows = (
        db.query(Rma.id_pedido_origem, func.coalesce(func.sum(ItemRma.valor_estornado), 0))
        .join(ItemRma, ItemRma.id_rma == Rma.id)
        .filter(Rma.id_pedido_origem.in_(pedido_ids))
        .group_by(Rma.id_pedido_origem)
        .all()
    )
    return {str(pedido_id): Decimal(str(total)) for pedido_id, total in rows}


router = APIRouter(prefix="/pedidos", tags=["pedidos"])


@router.post("", response_model=PedidoResponse, status_code=status.HTTP_201_CREATED)
def create_pedido(
    request: Request,
    response: Response,
    data: PedidoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Cria pedido. Com Idempotency-Key, repetir a chamada nao cria outro.

    A tela manda uma chave por tentativa de salvar. Se a mesma chave voltar — o
    pedido entrou mas a resposta se perdeu, e o vendedor clicou de novo — a
    resposta e o pedido que ja existe, sem consumir outro numero de OS.

    Continua 201 no reenvio, e nao 200: para a tela o resultado e o mesmo
    ("o pedido esta criado, aqui esta ele") e diferenciar so criaria um segundo
    caminho no onSuccess. Quem precisa distinguir le o header Idempotent-Replay.
    """
    chave = normalizar_chave(idempotency_key)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    try:
        pedido = PedidoService.create(
            db, data, current_user.id,
            ip_address=ip, user_agent=ua, idempotency_key=chave,
        )
    except Exception as exc:
        raise erro_http(exc, "criar o pedido")
    if getattr(pedido, "idempotent_replay", False):
        response.headers["Idempotent-Replay"] = "true"
    return pedido


@router.get("", response_model=PedidoListResponse)
def list_pedidos(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=500),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    id_loja: Optional[UUID] = Query(default=None),
    id_vendedor: Optional[UUID] = Query(default=None),
    data_inicio: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    data_fim: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
    sort_by: str = Query(default="data_pedido"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    numero_os: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    items, total, pages = PedidoService.list(
        db, page=page, limit=limit,
        status=status_filter, id_loja=id_loja, id_vendedor=id_vendedor,
        data_inicio=data_inicio, data_fim=data_fim,
        sort_by=sort_by, sort_dir=sort_dir,
        numero_os=numero_os,
    )
    estornado_map = _batch_total_estornado(db, [p.id for p in items])
    items_out = [
        PedidoListItemResponse(
            id=p.id,
            id_cotacao=p.id_cotacao,
            numero_cotacao=getattr(p, "numero_cotacao", None),
            termos_cotacao=getattr(p, "termos_cotacao", None),
            contato_cliente=p.contato_cliente,
            numero_os=p.numero_os,
            data_pedido=p.data_pedido,
            data_entrega=p.data_entrega,
            status=p.status,
            is_rma=p.is_rma,
            is_cancelled=p.is_cancelled,
            is_direct_billing=p.is_direct_billing,
            valor_venda=p.valor_venda,
            parcelas=p.parcelas,
            nome_cliente=p.cliente.nome if p.cliente else None,
            cnpj_cliente=p.cliente.cnpj if p.cliente else None,
            nome_loja=p.loja.nome if p.loja else None,
            nome_vendedor=p.vendedor.nome if p.vendedor else None,
            numero_oc=p.numero_oc,
            numero_nf=p.numero_nf,
            nota_fiscal_fornecedor=p.nota_fiscal_fornecedor,
            observacao=p.observacao,
            fornecedor_principal=p.fornecedor_principal,
            formas_pagamento=[FormaPagamentoOut.model_validate(fp) for fp in (p.formas_pagamento or [])],
            fretes=[FreteOut.model_validate(f) for f in (p.fretes or [])],
            produtos=[ProdutoResponse.model_validate(prod) for prod in (p.produtos or [])],
            custo=CustoPedidoOut.model_validate(p.custo) if p.custo else None,
            data_pagamento=p.data_pagamento,
            multa=p.multa,
            juros=p.juros,
            forma_pagamento_efetiva=p.forma_pagamento_efetiva,
            num_parcelas_efetivas=p.num_parcelas_efetivas,
            plano_parcelas=p.plano_parcelas,
            plano_parcelas_pedido=p.plano_parcelas_pedido,
            valor_total_estornado=estornado_map.get(str(p.id), Decimal("0")),
        )
        for p in items
    ]
    return PedidoListResponse(items=items_out, total=total, page=page, limit=limit, pages=pages)


@router.get("/{pedido_id}/history", response_model=OrderHistoryResponse)
def get_order_history(
    pedido_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    status_history = (
        db.query(StatusHistory)
        .filter(
            StatusHistory.entity_type == EntityType.PEDIDO,
            StatusHistory.entity_id == pedido_id,
        )
        .order_by(StatusHistory.changed_at.asc())
        .all()
    )
    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "pedido", AuditLog.entity_id == pedido_id)
        .order_by(AuditLog.changed_at.asc())
        .all()
    )
    return OrderHistoryResponse(
        order_id=pedido_id,
        status_history=[StatusHistoryResponse.model_validate(h) for h in status_history],
        audit_logs=[AuditLogResponse.model_validate(log) for log in audit_logs],
    )


@router.get("/{pedido_id}", response_model=PedidoDetailResponse)
def get_pedido(
    pedido_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    try:
        pedido = PedidoService.get_by_id(db, pedido_id)
        history = PedidoService.get_status_history(db, pedido_id)
        response = PedidoDetailResponse.model_validate(pedido)
        response.status_history = [StatusHistoryOut.model_validate(h) for h in history]
        return response
    except NotFoundException as exc:
        raise to_http_exception(exc)


@router.put("/{pedido_id}", response_model=PedidoResponse)
def update_pedido(
    request: Request,
    pedido_id: UUID,
    data: PedidoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    try:
        return PedidoService.update(db, pedido_id, data, current_user.id, ip_address=ip, user_agent=ua)
    except NotFoundException as exc:
        raise to_http_exception(exc)
    except Exception as exc:
        raise erro_http(exc, "salvar o pedido")


@router.patch("/{pedido_id}/status", response_model=PedidoResponse)
def change_status(
    request: Request,
    pedido_id: UUID,
    data: StatusChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    try:
        return PedidoService.change_status(
            db, pedido_id, data.new_status, current_user.id, data.reason,
            ip_address=ip, user_agent=ua,
        )
    except NotFoundException as exc:
        raise to_http_exception(exc)
    except BusinessLogicException as exc:
        raise to_http_exception(exc)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.delete("/{pedido_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pedido(
    request: Request,
    pedido_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    try:
        PedidoService.soft_delete(db, pedido_id, current_user.id, ip_address=ip, user_agent=ua)
    except NotFoundException as exc:
        raise to_http_exception(exc)


# ── Frete CRUD ────────────────────────────────────────────────────────────────

@router.post("/{pedido_id}/fretes", response_model=FreteOut, status_code=status.HTTP_201_CREATED)
def add_frete(
    pedido_id: UUID,
    data: FreteCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    try:
        PedidoService.get_by_id(db, pedido_id)
    except NotFoundException as exc:
        raise to_http_exception(exc)
    frete = Frete(id_pedido=pedido_id, entregador=data.entregador, valor=data.valor, data_frete=data.data_frete, pago=data.pago)
    db.add(frete)
    db.commit()
    db.refresh(frete)
    return FreteOut.model_validate(frete)


@router.put("/{pedido_id}/fretes/{frete_id}", response_model=FreteOut)
def update_frete(
    pedido_id: UUID,
    frete_id: UUID,
    data: FreteCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    frete = db.query(Frete).filter(Frete.id == frete_id, Frete.id_pedido == pedido_id).first()
    if not frete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frete não encontrado")
    frete.entregador = data.entregador
    frete.valor = data.valor
    frete.data_frete = data.data_frete
    frete.pago = data.pago
    db.commit()
    db.refresh(frete)
    return FreteOut.model_validate(frete)


@router.patch("/{pedido_id}/fretes/{frete_id}/pago", response_model=FreteOut)
def toggle_frete_pago(
    pedido_id: UUID,
    frete_id: UUID,
    data: FretePagoUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    frete = db.query(Frete).filter(Frete.id == frete_id, Frete.id_pedido == pedido_id).first()
    if not frete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frete não encontrado")
    frete.pago = data.pago
    db.commit()
    db.refresh(frete)
    return FreteOut.model_validate(frete)


@router.delete("/{pedido_id}/fretes/{frete_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_frete(
    pedido_id: UUID,
    frete_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user_dep),
):
    frete = db.query(Frete).filter(Frete.id == frete_id, Frete.id_pedido == pedido_id).first()
    if not frete:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frete não encontrado")
    db.delete(frete)
    db.commit()
