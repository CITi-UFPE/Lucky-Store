import math
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc, nullslast, text, func, or_, cast, String
from sqlalchemy.exc import IntegrityError

from app.models.cotacao import Cotacao
from app.models.loja import Loja
from app.models.vendedor import Vendedor
from app.models.item_cotacao import ItemCotacao
from app.models.cliente import Cliente
from app.services.child_collection import sync_children
from app.services.cliente_identidade import obter_ou_criar_cliente
from app.models.audit_log import AuditLog, AuditAction
from app.models.status_history import StatusHistory, EntityType
from app.schemas.cotacao import CotacaoCreate, CotacaoUpdate, PhaseUpdate
from app.utils.errors import NotFoundException
from app.services.referencias import validar_loja_e_vendedor


def _generate_numero(db: Session) -> int:
    return db.execute(text("SELECT nextval('cotacao_numero_seq')")).scalar()


def _cotacao_da_tentativa(db: Session, current_user_id: UUID,
                          idempotency_key: Optional[str]) -> Optional[Cotacao]:
    """A cotacao que ESTA tentativa de salvar ja criou, se criou.

    Mesma logica de _pedido_da_tentativa em app/services/pedido.py. Nao filtra
    deleted_at de proposito: cotacao criada e depois apagada ja gastou o numero,
    e recria-la seria a duplicata que a chave existe para impedir.
    """
    if not idempotency_key:
        return None
    return db.query(Cotacao).filter(
        Cotacao.created_by == current_user_id,
        Cotacao.idempotency_key == idempotency_key,
    ).first()


def _filtro_de_busca(termo: str):
    """Uma caixa de busca so, procurando em tudo que identifica a cotacao.

    Precisa ser OU, e nao "se for numero e indice": varios numeros de requisicao
    sao numericos (5137, 3216385). Tratar todo termo numerico como indice faria
    buscar 5137 parar de achar a cotacao cujo Nº Req. e 5137 — trocaria um
    problema por outro.

    O indice casa EXATO, o resto casa por pedaco. Assim "64" traz a cotacao de
    indice 64 e tambem qualquer uma cujo Nº Req. contenha 64, que e o que quem
    digita numa caixa unica espera. Casar o indice por pedaco faria "6" devolver
    6, 16, 60..69 e a busca perderia a serventia.
    """
    like = f"%{termo}%"
    condicoes = [
        Cotacao.cliente.ilike(like),
        Cotacao.b2b_company.ilike(like),
        Cotacao.numero_requisicao.ilike(like),
        # Loja e vendedor entram por relacionamento porque a tela ja buscava por
        # eles (o placeholder diz "Cliente, Req, Empresa, Vendedor"). Sem isto, a
        # busca passaria a achar MENOS do que achava antes.
        Cotacao.loja.has(Loja.nome.ilike(like)),
        Cotacao.vendedor.has(Vendedor.nome.ilike(like)),
    ]
    if termo.isdigit():
        # int() so depois do isdigit: o cast e barato, mas um termo enorme
        # viraria um numero fora do range do integer e o Postgres estouraria.
        if len(termo) <= 9:
            condicoes.append(Cotacao.numero == int(termo))
    return or_(*condicoes)


def _get_quote_phase(cotacao: Cotacao) -> str | None:
    if cotacao.status_caida:
        return "dropped"
    if cotacao.status_fechada:
        return "closed"
    if cotacao.status_em_fechamento:
        return "forClosing"
    if cotacao.status_enviada:
        return "sent"
    return None


def _upsert_cliente(db: Session, nome: str, cnpj: str | None) -> None:
    """Garante que o cliente da cotacao exista no cadastro.

    Antes esta funcao RENOMEAVA o cliente existente quando o nome digitado
    diferia — uma cotacao para "Alpha" sobrescrevia o cadastro de
    "Alpha Ltda" que dividisse o mesmo CNPJ. Pela regra atual os dois sao
    clientes distintos, entao o cadastro alheio nao e mais tocado.
    """
    if not cnpj:
        return
    obter_ou_criar_cliente(db, nome, cnpj)


def _audit(db: Session, action: AuditAction, entity_id, changed_by: UUID,
           old_values: dict = None, new_values: dict = None):
    db.add(AuditLog(
        entity_type="cotacao",
        entity_id=entity_id,
        action=action,
        changed_by=changed_by,
        old_values=old_values,
        new_values=new_values,
    ))


def _calc_item_totals(item: ItemCotacao) -> ItemCotacao:
    item.valor_total = (
        Decimal(item.quantidade) * item.valor_unitario
        if item.valor_unitario is not None else None
    )
    item.valor_total_fechamento = (
        Decimal(item.quantidade) * item.valor_fechamento
        if item.valor_fechamento is not None else None
    )
    return item


def _hydrate_cotacao(db: Session, cotacao: Cotacao) -> Cotacao:
    for item in cotacao.itens:
        _calc_item_totals(item)
    # Número da cotação dentro da própria loja (posição por ordem de criação)
    if cotacao.numero is None:
        cotacao.numero_loja = None
    else:
        cotacao.numero_loja = db.query(func.count(Cotacao.id)).filter(
            Cotacao.id_loja == cotacao.id_loja,
            Cotacao.deleted_at.is_(None),
            Cotacao.numero.isnot(None),
            Cotacao.numero <= cotacao.numero,
        ).scalar()
    return cotacao


# Sem lista fechada, `sort_by` vinha da query string direto para o getattr:
# qualquer atributo do model servia de ordenacao, inclusive os que nao sao
# coluna (metadata, registry) — que estouram na hora de montar o SQL.
_ORDENAVEIS = {
    "data_cotacao", "numero", "cliente", "b2b_company", "valor_total",
    "created_at", "updated_at", "data_envio", "data_validade",
}


class CotacaoService:

    @staticmethod
    def create(db: Session, data: CotacaoCreate, current_user_id: UUID,
               idempotency_key: Optional[str] = None) -> Cotacao:
        # Antes de TUDO, inclusive do nextval: se esta mesma tentativa ja criou
        # cotacao, devolve aquela. E o caso da resposta perdida — a cotacao
        # entrou, a tela nao soube, o vendedor clicou de novo.
        ja_criada = _cotacao_da_tentativa(db, current_user_id, idempotency_key)
        if ja_criada is not None:
            ja_criada.idempotent_replay = True
            return _hydrate_cotacao(db, ja_criada)

        # Antes de qualquer escrita: sem isto, loja ou vendedor inexistente so
        # era descoberto no flush, com o numero da cotacao ja gasto.
        validar_loja_e_vendedor(db, data.id_loja, data.id_vendedor)

        _upsert_cliente(db, data.cliente, data.cnpj_cliente)

        cotacao = Cotacao(
            id_loja=data.id_loja,
            id_vendedor=data.id_vendedor,
            # O numero NAO sai aqui — ver o comentario depois do db.add.
            # numero e nullable, entao aqui nem precisa de rascunho: a linha
            # entra sem numero e recebe o definitivo no mesmo commit.
            numero=None,
            idempotency_key=idempotency_key,
            numero_requisicao=data.numero_requisicao,
            b2b_company=data.b2b_company,
            cliente=data.cliente,
            cnpj_cliente=data.cnpj_cliente,
            data_cotacao=data.data_cotacao,
            data_validade=data.data_validade,
            is_direct_billing=data.is_direct_billing,
            fornecedor=data.fornecedor,
            valor_total=data.valor_total,
            observacao=data.observacao,
            pct_imposto_lucky=data.pct_imposto_lucky,
            pct_imposto_btech=data.pct_imposto_btech,
            data_entrega=data.data_entrega,
            previsao_entrega=data.previsao_entrega,
            forma_pagamento=data.forma_pagamento,
            detalhes_pagamento=data.detalhes_pagamento,
            prazo_pagamento=data.prazo_pagamento,
            garantia=data.garantia,
            created_by=current_user_id,
        )
        db.add(cotacao)

        # O INSERT e o momento em que o banco decide: e ali que estoura tanto a
        # uq_cotacao (loja + vendedor + data + nº de requisicao repetidos)
        # quanto o indice de idempotencia, quando dois cliques chegam juntos.
        # Pedindo o numero antes dele, toda recusa levava um numero junto — e
        # nextval nao volta no rollback.
        #
        # Foi assim que 17 numeros (10 a 26) se perderam neste banco.
        try:
            db.flush()
            cotacao.numero = _generate_numero(db)
            db.flush()
        except IntegrityError:
            db.rollback()
            concorrente = _cotacao_da_tentativa(db, current_user_id, idempotency_key)
            if concorrente is None:
                # Violacao de outra restricao — a uq_cotacao, tipicamente. Nada
                # a ver com idempotencia: deixa subir, a rota traduz.
                raise
            concorrente.idempotent_replay = True
            return _hydrate_cotacao(db, concorrente)

        for item_data in data.itens:
            db.add(ItemCotacao(
                id_cotacao=cotacao.id,
                descricao=item_data.descricao,
                quantidade=item_data.quantidade,
                valor_unitario=item_data.valor_unitario,
                valor_fechamento=item_data.valor_fechamento,
                fornecedor=item_data.fornecedor,
                is_direct_supply=item_data.is_direct_supply,
                porcentagem_fornecedor=item_data.porcentagem_fornecedor,
                frete_fornecedor=item_data.frete_fornecedor,
            ))

        _audit(db, AuditAction.CREATE, cotacao.id, current_user_id,
               new_values={"cliente": cotacao.cliente, "numero_requisicao": cotacao.numero_requisicao})

        db.add(StatusHistory(
            entity_type=EntityType.COTACAO,
            entity_id=cotacao.id,
            old_status=None,
            new_status="created",
            changed_by=current_user_id,
            reason="Cotação criada",
        ))

        db.commit()
        db.refresh(cotacao)
        cotacao.idempotent_replay = False
        return _hydrate_cotacao(db, cotacao)

    @staticmethod
    def list(
        db: Session,
        page: int = 1,
        limit: int = 20,
        id_loja: Optional[UUID] = None,
        id_vendedor: Optional[UUID] = None,
        cliente: Optional[str] = None,
        data_inicio: Optional[str] = None,
        data_fim: Optional[str] = None,
        sort_by: str = "numero",
        sort_dir: str = "desc",
        eligible_for_order: Optional[bool] = None,
        numero_requisicao: Optional[str] = None,
        busca: Optional[str] = None,
        numero: Optional[int] = None,
    ):

        q = db.query(Cotacao).filter(Cotacao.deleted_at.is_(None))

        if id_loja:
            q = q.filter(Cotacao.id_loja == id_loja)
        if id_vendedor:
            q = q.filter(Cotacao.id_vendedor == id_vendedor)
        if cliente:
            q = q.filter(Cotacao.cliente.ilike(f"%{cliente}%"))
        if numero_requisicao:
            q = q.filter(Cotacao.numero_requisicao.ilike(f"%{numero_requisicao}%"))
        if numero is not None:
            q = q.filter(Cotacao.numero == numero)
        if busca and busca.strip():
            q = q.filter(_filtro_de_busca(busca.strip()))
        if data_inicio:
            q = q.filter(Cotacao.data_cotacao >= data_inicio)
        if data_fim:
            q = q.filter(Cotacao.data_cotacao <= data_fim)
        if eligible_for_order:
            q = q.filter(Cotacao.status_fechada == True, Cotacao.status_caida != True)

        # A ordem e pelo INDICE (numero), nao pela data. O indice vem de uma
        # sequence, entao o maior e sempre o mais recente — que e como a tela
        # apresenta a lista. data_cotacao nao serve para isso: e uma DATA
        # digitada, varias cotacoes caem no mesmo dia e ainda pode ser
        # retroagida. Ordenando por ela, os empates saiam na ordem que o
        # Postgres quisesse, e a tela mostrava 79, 80, 78, 81, 77...
        #
        # O desempate por `id` fecha a ordem. Nao e preciosismo: com
        # OFFSET/LIMIT, ordem instavel faz a mesma cotacao aparecer em duas
        # paginas e outra em nenhuma, sem erro nenhum.
        #
        # nullslast porque as cotacoes anteriores a sequence nao tem numero, e
        # em DESC o Postgres joga NULL para o topo — elas iriam para a frente
        # das numeradas.
        sort_col = getattr(Cotacao, sort_by if sort_by in _ORDENAVEIS else "numero")
        direcao = desc if sort_dir == "desc" else asc
        q = q.order_by(
            nullslast(direcao(sort_col)),
            nullslast(direcao(Cotacao.numero)),
            direcao(Cotacao.id),
        )

        total = q.count()
        items = q.offset((page - 1) * limit).limit(limit).all()

        for cotacao in items:
            _hydrate_cotacao(db, cotacao)

        return items, total, math.ceil(total / limit) if total else 0

    @staticmethod
    def get_by_id(db: Session, cotacao_id: UUID) -> Cotacao:
        cotacao = db.query(Cotacao).filter(
            Cotacao.id == cotacao_id,
            Cotacao.deleted_at.is_(None),
        ).first()
        if not cotacao:
            raise NotFoundException(f"Cotação {cotacao_id} não encontrada")
        return _hydrate_cotacao(db, cotacao)

    @staticmethod
    def update(db: Session, cotacao_id: UUID, data: CotacaoUpdate, current_user_id: UUID) -> Cotacao:
        cotacao = CotacaoService.get_by_id(db, cotacao_id)

        old_values = {
            "cliente": cotacao.cliente,
            "valor_total": str(cotacao.valor_total) if cotacao.valor_total else None,
        }

        for field, value in data.model_dump(exclude_none=True, exclude={'itens', 'fase'}).items():
            setattr(cotacao, field, value)

        _upsert_cliente(db, cotacao.cliente, cotacao.cnpj_cliente)

        new_values = {
            "cliente": cotacao.cliente,
            "valor_total": str(cotacao.valor_total) if cotacao.valor_total else None,
        }

        _audit(db, AuditAction.UPDATE, cotacao.id, current_user_id,
               old_values=old_values, new_values=new_values)

        if data.itens is not None:
            sync_children(db, cotacao.id, ItemCotacao, 'id_cotacao', data.itens, 'item_cotacao', current_user_id)
        if data.fase is not None:
            CotacaoService.update_phase(db, cotacao.id, data.fase, current_user_id, commit=False)

        db.commit()
        db.refresh(cotacao)
        return _hydrate_cotacao(db, cotacao)

    @staticmethod
    def update_phase(db: Session, cotacao_id: UUID, data: PhaseUpdate, current_user_id: UUID, *, commit: bool = True) -> Cotacao:
        cotacao = CotacaoService.get_by_id(db, cotacao_id)

        old_phase = _get_quote_phase(cotacao)
        old_values = {
            "status_enviada": cotacao.status_enviada,
            "status_em_fechamento": cotacao.status_em_fechamento,
            "status_fechada": cotacao.status_fechada,
            "status_caida": cotacao.status_caida,
        }

        for field, value in data.model_dump(exclude_none=True).items():
            setattr(cotacao, field, value)

        new_phase = _get_quote_phase(cotacao)
        new_values = {
            "status_enviada": cotacao.status_enviada,
            "status_em_fechamento": cotacao.status_em_fechamento,
            "status_fechada": cotacao.status_fechada,
            "status_caida": cotacao.status_caida,
        }

        _audit(db, AuditAction.UPDATE, cotacao.id, current_user_id,
               old_values=old_values, new_values=new_values)

        if new_phase and new_phase != old_phase:
            db.add(StatusHistory(
                entity_type=EntityType.COTACAO,
                entity_id=cotacao.id,
                old_status=old_phase,
                new_status=new_phase,
                changed_by=current_user_id,
            ))

        if not commit:
            return cotacao
        db.commit()
        db.refresh(cotacao)
        return _hydrate_cotacao(db, cotacao)

    @staticmethod
    def soft_delete(db: Session, cotacao_id: UUID, current_user_id: UUID) -> None:
        cotacao = CotacaoService.get_by_id(db, cotacao_id)
        cotacao.deleted_at = datetime.now(timezone.utc)

        _audit(db, AuditAction.DELETE, cotacao.id, current_user_id,
               old_values={"cliente": cotacao.cliente})

        db.commit()
