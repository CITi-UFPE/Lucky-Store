from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from uuid import UUID
from app.database import get_db
from app.models.user import User
from app.schemas.despesa import DespesaCreate, DespesaUpdate, DespesaOut
from app.services.despesa import DespesaService
from app.services.despesa_recorrente import encerrar as encerrar_recorrencia
from app.utils.errors import NotFoundException, to_http_exception
from app.api.routes.auth import get_current_user_dep
from typing import List

router = APIRouter(prefix="/despesas", tags=["despesas"])


@router.get("", response_model=List[DespesaOut])
def list_despesas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    return DespesaService.list(db)


@router.post("", response_model=DespesaOut, status_code=status.HTTP_201_CREATED)
def create_despesa(
    data: DespesaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    return DespesaService.create(db, data, current_user.id)


@router.put("/{despesa_id}", response_model=DespesaOut)
def update_despesa(
    despesa_id: UUID,
    data: DespesaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    try:
        return DespesaService.update(db, despesa_id, data, current_user.id)
    except NotFoundException as exc:
        raise to_http_exception(exc)


@router.delete("/{despesa_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_despesa(
    despesa_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    try:
        DespesaService.delete(db, despesa_id, current_user.id)
    except NotFoundException as exc:
        raise to_http_exception(exc)


@router.post("/{despesa_id}/encerrar-recorrencia", status_code=status.HTTP_200_OK)
def encerrar_recorrencia_endpoint(
    despesa_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep),
):
    """Para de gerar meses novos e remove o futuro ainda nao pago.

    Rota propria, e nao um campo no PUT, porque encerrar nao e so virar um
    booleano: tambem decide o que acontece com os meses ja lancados adiante.
    Escondido num update, alguem mudaria "recorrente" achando que so parava a
    repeticao e apagaria previsoes junto sem perceber.
    """
    despesa = DespesaService.get_by_id(db, despesa_id)
    if not despesa.recorrencia_id:
        raise to_http_exception(NotFoundException("Esta despesa não é recorrente"))
    removidas = encerrar_recorrencia(db, despesa.recorrencia_id)
    return {"encerrada": True, "ocorrencias_futuras_removidas": removidas}
