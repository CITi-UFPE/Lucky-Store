from datetime import date, datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.despesa import Despesa
from app.schemas.despesa import DespesaCreate, DespesaUpdate
from app.services.despesa_recorrente import excluir_serie, garantir_ocorrencias, primeiro_dia
from app.utils.errors import NotFoundException


class DespesaService:

    @staticmethod
    def list(db: Session) -> list[Despesa]:
        # A geracao das ocorrencias recorrentes acontece aqui, na leitura. Nao
        # ha agendador nesta infra, e amarrar no deploy significaria que ficar
        # tres meses sem subir codigo deixaria tres meses sem aluguel lancado —
        # com o Dashboard mostrando lucro maior que o real e sem erro nenhum.
        # Quem abre a tela em maio ve o aluguel de maio. Duplicata e problema do
        # indice unico, nao deste codigo.
        garantir_ocorrencias(db)
        return (
            db.query(Despesa)
            .filter(Despesa.deleted_at.is_(None))
            .order_by(Despesa.created_at.desc())
            .all()
        )

    @staticmethod
    def get_by_id(db: Session, despesa_id: UUID) -> Despesa:
        despesa = db.query(Despesa).filter(
            Despesa.id == despesa_id,
            Despesa.deleted_at.is_(None),
        ).first()
        if not despesa:
            raise NotFoundException(f"Despesa {despesa_id} não encontrada")
        return despesa

    @staticmethod
    def create(db: Session, data: DespesaCreate, current_user_id: UUID) -> Despesa:
        payload = data.model_dump()
        if payload.get('plano_parcelas'):
            payload['plano_parcelas'] = [p.model_dump() if hasattr(p, 'model_dump') else p
                                         for p in payload['plano_parcelas']]
        recorrente = bool(payload.pop('recorrente', False))
        despesa = Despesa(**payload, created_by=current_user_id)

        if recorrente:
            # A competencia e o mes desta primeira despesa; e dela que as
            # proximas saem. Sem data nenhuma, cai no mes corrente — melhor que
            # recusar o cadastro por causa de um campo que a tela nem sempre
            # preenche.
            origem = despesa.data_prevista or despesa.data_pagamento or date.today()
            despesa.competencia = primeiro_dia(origem)
            despesa.recorrente = True

        db.add(despesa)
        db.flush()  # precisa do id para o grupo apontar para ele

        if recorrente:
            # A mae leva o proprio id como identificador do grupo, entao nao ha
            # uma tabela de regra separada para sair de sincronia com as
            # ocorrencias.
            despesa.recorrencia_id = despesa.id

        db.commit()
        db.refresh(despesa)

        if recorrente:
            # Os proximos meses ja saem criados, senao a tela salvaria uma
            # despesa recorrente e nao mostraria repeticao nenhuma ate a
            # proxima leitura.
            garantir_ocorrencias(db)

        return despesa

    @staticmethod
    def update(db: Session, despesa_id: UUID, data: DespesaUpdate, current_user_id: UUID) -> Despesa:
        despesa = DespesaService.get_by_id(db, despesa_id)
        payload = data.model_dump(exclude_none=True)
        if 'plano_parcelas' in payload and payload['plano_parcelas']:
            payload['plano_parcelas'] = [p.model_dump() if hasattr(p, 'model_dump') else p
                                         for p in payload['plano_parcelas']]
        for field, value in payload.items():
            setattr(despesa, field, value)
        db.commit()
        db.refresh(despesa)
        return despesa

    @staticmethod
    def delete(db: Session, despesa_id: UUID, current_user_id: UUID) -> None:
        despesa = DespesaService.get_by_id(db, despesa_id)

        # Numa despesa recorrente, excluir e excluir A DESPESA, nao aquele mes.
        # Quem clica em excluir cadastrou errado e quer aquilo fora; apagar so a
        # copia aberta deixaria as outras onze espalhadas pelo ano, uma por mes,
        # para serem cacadas na mao. O que ja foi PAGO fica — se o dinheiro
        # saiu, apagar faria o caixa de um mes fechado mudar sozinho.
        if despesa.recorrencia_id:
            excluir_serie(db, despesa.recorrencia_id)
            return

        despesa.deleted_at = datetime.now(timezone.utc)
        db.commit()
