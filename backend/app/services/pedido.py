import logging
import math
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import Integer, asc, cast, desc, func, nullslast, text
from sqlalchemy.exc import IntegrityError
from app.models.pedido import Pedido, PedidoFormaPagamento, CustoPedido, STATUS_CANCELADO
from app.models.cliente import Cliente
from app.models.produto import Produto
from app.models.rma import Rma
from app.models.loja import Loja
from app.models.vendedor import Vendedor
from app.models.status_history import StatusHistory, EntityType
from app.models.audit_log import AuditLog, AuditAction
from app.schemas.pedido import PedidoCreate, PedidoUpdate
from app.utils.errors import NotFoundException, BusinessLogicException
from app.services.cliente_identidade import obter_ou_criar_cliente
from app.services.referencias import validar_loja_e_vendedor

logger = logging.getLogger("app.pedido")


# Mora em app/services/referencias.py desde que a cotacao passou a precisar da
# mesma checagem pelo mesmo motivo. O apelido mantem o nome usado aqui dentro.
_validar_referencias = validar_loja_e_vendedor


def _pedido_da_tentativa(db: Session, current_user_id: UUID,
                         idempotency_key: Optional[str]) -> Optional[Pedido]:
    """O pedido que ESTA tentativa de salvar ja criou, se criou.

    A chave vem no header Idempotency-Key e identifica o clique em "Criar
    Pedido", nao o pedido: a tela gera uma por tentativa e reusa a mesma se
    precisar tentar de novo. Achando pedido com ela, a resposta certa e devolver
    aquele — nao criar outro.

    Nao filtra deleted_at de proposito. Pedido criado e depois apagado ja gastou
    o numero da OS; recria-lo aqui seria justamente a duplicata que a chave
    existe para impedir. Quem quer mesmo um pedido novo abre o formulario de
    novo, e o formulario gera outra chave.
    """
    if not idempotency_key:
        return None
    pedido = db.query(Pedido).filter(
        Pedido.created_by == current_user_id,
        Pedido.idempotency_key == idempotency_key,
    ).first()
    if pedido is not None:
        pedido.economia = _economia(pedido)
    return pedido


# numero_os e VARCHAR: "OS-013". Ordenar a coluna como texto e ordenacao
# alfabetica, nao numerica — e por isso a tela mostrava OS-013, OS-011, OS-012.
# Alfabeticamente ela tambem quebra na virada da casa: "OS-1000" < "OS-999",
# porque o quarto caractere '0' vem antes de '9'. O zfill(3) de hoje adia isso
# ate a OS-999 e nao resolve.
#
# substring(... from '\d+') pega o primeiro grupo de digitos, entao "OS-013"
# vira 13 e a ordem passa a ser a numerica. Pegar o PRIMEIRO grupo, e nao todos
# os digitos, tambem protege do numero provisorio TMP-<uuid>, que so existe
# dentro da transacao mas cujo apanhado de digitos estouraria o inteiro.
_NUMERO_OS_NUMERICO = cast(
    func.nullif(func.substring(Pedido.numero_os, r"\d+"), ""), Integer
)


def _numero_provisorio(pedido_id: UUID) -> str:
    """numero_os de rascunho, que so existe dentro da transacao.

    numero_os e NOT NULL, entao a linha precisa de algum valor para ser
    inserida. Este e o valor que ela leva ate o INSERT passar; logo depois o
    numero de verdade entra por cima, no mesmo commit. Se a transacao nao
    vingar, a linha inteira desaparece — este texto nunca chega ao banco.

    Derivado do id do pedido so por rastreabilidade: nao ha UNIQUE em numero_os,
    entao dois rascunhos nunca colidiriam de qualquer jeito. Cabe nos 50
    caracteres da coluna (4 + 36).
    """
    return f"TMP-{pedido_id}"


def _generate_numero_os(db: Session) -> str:
    num = db.execute(text("SELECT nextval('pedido_os_seq')")).scalar()
    return f"OS-{str(num).zfill(3)}"


def _audit(db: Session, action: AuditAction, entity_id, changed_by: UUID,
           old_values: dict = None, new_values: dict = None,
           ip_address: str = None, user_agent: str = None):
    db.add(AuditLog(
        entity_type="pedido",
        entity_id=entity_id,
        action=action,
        changed_by=changed_by,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent,
    ))


def _numero_cotacao(pedido: Pedido) -> Optional[int]:
    """Indice da cotacao que gerou o pedido, ou None se ele nasceu do zero.

    Sai como campo proprio na resposta em vez de a tela buscar a cotacao pelo
    id: seriam duas requisicoes para imprimir uma folha, e na listagem uma por
    linha. O relacionamento e carregado junto (joinedload) pelo mesmo motivo.
    """
    return pedido.cotacao.numero if pedido.cotacao else None


def _termos_da_cotacao(pedido: Pedido) -> Optional[dict]:
    """Condicoes comerciais combinadas na cotacao que gerou o pedido.

    Elas vivem SO na cotacao — o pedido nao tem previsao de entrega, detalhes de
    pagamento nem garantia. O documento impresso da OS precisa delas porque e o
    papel que vai ao cliente, e ate agora so o timbrado da cotacao as mostrava:
    o cliente fechava vendo garantia e prazo, e a OS chegava sem nenhum dos dois.

    Vem pela mesma porta do numero_cotacao, e pelo mesmo motivo — o
    relacionamento ja e carregado junto (joinedload), entao imprimir uma folha
    continua sendo uma requisicao, e a listagem nao vira uma por linha.

    Pedido criado do zero devolve None, e o bloco simplesmente nao sai no papel.
    """
    c = pedido.cotacao
    if c is None:
        return None
    termos = {
        "previsao_entrega": c.previsao_entrega,
        "forma_pagamento": c.forma_pagamento,
        "detalhes_pagamento": c.detalhes_pagamento,
        "garantia": c.garantia,
    }
    # Cotacao sem nenhum termo preenchido nao vira um objeto vazio na resposta:
    # a tela so precisa saber "tem bloco" ou "nao tem".
    return termos if any(v is not None and str(v).strip() != "" for v in termos.values()) else None


def _economia(pedido: Pedido) -> Optional[Decimal]:
    if pedido.valor_venda is None or pedido.custo is None:
        return None
    custo_total = (pedido.custo.custo_produto_final or Decimal(0)) + (pedido.custo.custo_servico or Decimal(0))
    return pedido.valor_venda - custo_total


def _sincronizar_cancelamento(pedido: Pedido) -> None:
    """Deixa is_cancelled igual a (status == 'Cancelled').

    Um pedido cancelado e um pedido com status 'Cancelled'. is_cancelled e so
    o espelho disso, mantido porque a API e a tela ja o expoem. Toda escrita
    que mexe no status passa por aqui, para os dois nunca discordarem — ver o
    comentario longo em app/models/pedido.py.
    """
    pedido.is_cancelled = pedido.status == STATUS_CANCELADO


def _get_or_create_cliente(db: Session, nome: str, cpf_cnpj: Optional[str]) -> UUID:
    # A regra de "e o mesmo cliente?" mora em cliente_identidade, compartilhada
    # com cotacao.py e conversao_cotacao.py. Antes cada um decidia sozinho.
    return obter_ou_criar_cliente(db, nome, cpf_cnpj).id


class PedidoService:

    @staticmethod
    def create(db: Session, data: PedidoCreate, current_user_id: UUID,
               ip_address: str = None, user_agent: str = None,
               idempotency_key: Optional[str] = None) -> Pedido:
        # Antes de TUDO, inclusive do nextval: se esta mesma tentativa de salvar
        # ja criou pedido, devolve aquele. E o caso da resposta perdida — o
        # pedido entrou, a tela nao soube, o vendedor clicou de novo.
        ja_criado = _pedido_da_tentativa(db, current_user_id, idempotency_key)
        if ja_criado is not None:
            ja_criado.idempotent_replay = True
            return ja_criado

        # Antes de qualquer escrita: sem isto, uma loja ou vendedor inexistente
        # so era descoberto no flush, com o numero da OS ja gasto.
        _validar_referencias(db, data.id_loja, data.id_vendedor)

        id_cliente = _get_or_create_cliente(db, data.nome_cliente, data.cpf_cnpj)

        # status e is_cancelled dizem a mesma coisa; se qualquer um dos dois
        # chegar dizendo "cancelado", o pedido nasce cancelado dos dois lados.
        # A tela so manda o status, e era assim que nascia o pedido cancelado
        # com is_cancelled=False que o dashboard contava como venda.
        cancelado = data.is_cancelled or data.status == STATUS_CANCELADO
        status_inicial = STATUS_CANCELADO if cancelado else data.status

        # O numero da OS NAO sai aqui. Ele so e pedido depois que o INSERT
        # passou, mais abaixo — ver o comentario no try.
        pedido_id = uuid4()
        pedido = Pedido(
            id=pedido_id,
            id_loja=data.id_loja,
            id_vendedor=data.id_vendedor,
            id_cliente=id_cliente,
            id_cotacao=data.id_cotacao,
            contato_cliente=data.contato_cliente,
            numero_os=data.numero_os or _numero_provisorio(pedido_id),
            numero_nf=data.numero_nf,
            numero_oc=data.numero_oc,
            data_pedido=data.data_pedido,
            data_entrega=data.data_entrega,
            status=status_inicial,
            is_rma=data.is_rma,
            is_cancelled=cancelado,
            is_direct_billing=data.is_direct_billing,
            valor_venda=data.valor_venda,
            parcelas=data.parcelas,
            observacao=data.observacao,
            fornecedor_principal=data.fornecedor_principal,
            nota_fiscal_fornecedor=data.nota_fiscal_fornecedor,
            data_pagamento=data.data_pagamento,
            multa=data.multa,
            juros=data.juros,
            forma_pagamento_efetiva=data.forma_pagamento_efetiva,
            num_parcelas_efetivas=data.num_parcelas_efetivas,
            plano_parcelas=data.plano_parcelas,
            plano_parcelas_pedido=data.plano_parcelas_pedido,
            created_by=current_user_id,
            idempotency_key=idempotency_key,
        )
        db.add(pedido)

        # A busca la em cima nao cobre duas requisicoes com a mesma chave em voo
        # ao mesmo tempo (duplo clique, dois dispositivos): as duas passam sem
        # achar nada. Quem segura ai e o indice unico
        # (created_by, idempotency_key) — o segundo INSERT toma IntegrityError,
        # e aqui ele vira "devolve o que o primeiro criou".
        #
        # E por isso que o numero da OS so e pedido DEPOIS deste flush. O INSERT
        # e o ponto em que o banco decide quem ganhou a corrida; quem perdeu nem
        # chega ao nextval, e nao gasta numero. Antes desta ordem, cada perdedor
        # abria um buraco permanente na numeracao mesmo sem criar pedido nenhum
        # — medido: 4 requisicoes simultaneas com a mesma chave criavam 1 pedido
        # e queimavam 4 numeros.
        #
        # Vale tambem para violacao que _validar_referencias nao cobre: cotacao
        # de origem apagada (id_cotacao) ou usuario removido (created_by)
        # estouram neste INSERT, e agora sem custo na numeracao.
        try:
            db.flush()  # INSERT — e o arbitro da corrida

            if not data.numero_os:
                pedido.numero_os = _generate_numero_os(db)
                db.flush()

            for fp in data.formas_pagamento:
                db.add(PedidoFormaPagamento(id_pedido=pedido.id, forma=fp.forma))

            if data.custo:
                db.add(CustoPedido(id_pedido=pedido.id, **data.custo.model_dump()))

            _audit(db, AuditAction.CREATE, pedido.id, current_user_id,
                   new_values={"status": pedido.status, "numero_os": pedido.numero_os},
                   ip_address=ip_address, user_agent=user_agent)

            db.add(StatusHistory(
                entity_type=EntityType.PEDIDO,
                entity_id=pedido.id,
                old_status=None,
                new_status=pedido.status,
                changed_by=current_user_id,
                reason="Pedido criado",
            ))

            db.commit()
        except IntegrityError:
            db.rollback()
            concorrente = _pedido_da_tentativa(db, current_user_id, idempotency_key)
            if concorrente is None:
                # Violacao de outra restricao (FK, NOT NULL). Nada a ver com
                # idempotencia — deixa subir, a rota traduz em 400.
                raise
            concorrente.idempotent_replay = True
            return concorrente

        db.refresh(pedido)
        pedido.economia = _economia(pedido)
        pedido.numero_cotacao = _numero_cotacao(pedido)
        pedido.termos_cotacao = _termos_da_cotacao(pedido)
        pedido.idempotent_replay = False
        return pedido

    @staticmethod
    def list(
        db: Session,
        page: int = 1,
        limit: int = 20,
        status: Optional[str] = None,
        id_loja: Optional[UUID] = None,
        id_vendedor: Optional[UUID] = None,
        data_inicio: Optional[str] = None,
        data_fim: Optional[str] = None,
        sort_by: str = "numero_os",
        sort_dir: str = "desc",
        numero_os: Optional[str] = None,
    ):
        base_filters = [Pedido.deleted_at.is_(None)]
        if status:
            base_filters.append(Pedido.status == status)
        if id_loja:
            base_filters.append(Pedido.id_loja == id_loja)
        if id_vendedor:
            base_filters.append(Pedido.id_vendedor == id_vendedor)
        if data_inicio:
            base_filters.append(Pedido.data_pedido >= data_inicio)
        if data_fim:
            base_filters.append(Pedido.data_pedido <= data_fim)
        if numero_os:
            base_filters.append(Pedido.numero_os.ilike(f"%{numero_os}%"))

        total = db.query(Pedido).filter(*base_filters).count()

        _SORT_WHITELIST = {"data_pedido", "data_entrega", "status", "numero_os", "created_at", "updated_at"}
        sort_col = getattr(Pedido, sort_by if sort_by in _SORT_WHITELIST else "numero_os")
        direcao = desc if sort_dir == "desc" else asc
        # Pela OS o criterio e o numero, nao o texto da coluna.
        if sort_col is Pedido.numero_os:
            sort_col = _NUMERO_OS_NUMERICO
        items = (
            db.query(Pedido)
            .options(
                joinedload(Pedido.loja),
                joinedload(Pedido.vendedor),
                joinedload(Pedido.cliente),
                joinedload(Pedido.produtos),
                joinedload(Pedido.formas_pagamento),
                joinedload(Pedido.fretes),
                joinedload(Pedido.custo),
                joinedload(Pedido.cotacao),
            )
            .filter(*base_filters)
            # O desempate vale para qualquer criterio: data_pedido e uma DATA e
            # varios pedidos caem no mesmo dia; status e data_entrega repetem
            # ainda mais. Sem desempate a ordem dos empates e a que o Postgres
            # quiser, e com OFFSET/LIMIT isso faz pedido repetir numa pagina e
            # sumir de outra, sem erro nenhum. O numero da OS desempata pela
            # ordem de criacao — e o mesmo criterio que a cotacao usa com o
            # indice — e o id fecha, porque e unico e torna a ordem total.
            .order_by(
                nullslast(direcao(sort_col)),
                nullslast(direcao(_NUMERO_OS_NUMERICO)),
                direcao(Pedido.id),
            )
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )

        for p in items:
            p.economia = _economia(p)
            p.numero_cotacao = _numero_cotacao(p)
            p.termos_cotacao = _termos_da_cotacao(p)

        return items, total, math.ceil(total / limit) if total else 0

    @staticmethod
    def get_by_id(db: Session, pedido_id: UUID) -> Pedido:
        pedido = db.query(Pedido).filter(
            Pedido.id == pedido_id,
            Pedido.deleted_at.is_(None),
        ).first()
        if not pedido:
            raise NotFoundException(f"Pedido {pedido_id} não encontrado")
        pedido.economia = _economia(pedido)
        pedido.numero_cotacao = _numero_cotacao(pedido)
        pedido.termos_cotacao = _termos_da_cotacao(pedido)
        return pedido

    @staticmethod
    def get_status_history(db: Session, pedido_id: UUID):
        return (
            db.query(StatusHistory)
            .filter(
                StatusHistory.entity_type == EntityType.PEDIDO,
                StatusHistory.entity_id == pedido_id,
            )
            .order_by(StatusHistory.changed_at.asc())
            .all()
        )

    @staticmethod
    def update(db: Session, pedido_id: UUID, data: PedidoUpdate, current_user_id: UUID,
               ip_address: str = None, user_agent: str = None) -> Pedido:
        pedido = PedidoService.get_by_id(db, pedido_id)

        old_values = {
            "numero_os": pedido.numero_os,
            "status": pedido.status,
            "valor_venda": str(pedido.valor_venda) if pedido.valor_venda else None,
        }

        dump = data.model_dump(exclude_none=True)
        custo_data = dump.pop('custo', None)
        formas_data = dump.pop('formas_pagamento', None)

        for field, value in dump.items():
            setattr(pedido, field, value)

        # Nao ha sincronizacao de cancelamento aqui de proposito: PedidoUpdate
        # nao expoe status nem is_cancelled, entao este caminho nao consegue
        # cancelar nem descancelar. Quem faz isso e change_status. Se algum dia
        # um desses campos entrar no schema, test_pedido_cancelamento.py avisa.

        # Sincroniza formas de pagamento (relação) — substitui o conjunto atual.
        if formas_data is not None:
            for fp in list(pedido.formas_pagamento):
                db.delete(fp)
            pedido.formas_pagamento = []
            db.flush()
            for fp in formas_data:
                db.add(PedidoFormaPagamento(id_pedido=pedido.id, forma=fp['forma']))

        if custo_data:
            if pedido.custo:
                for k, v in custo_data.items():
                    setattr(pedido.custo, k, v)
            else:
                db.add(CustoPedido(id_pedido=pedido.id, **custo_data))

        new_values = {
            "numero_os": pedido.numero_os,
            "status": pedido.status,
            "valor_venda": str(pedido.valor_venda) if pedido.valor_venda else None,
        }

        _audit(db, AuditAction.UPDATE, pedido.id, current_user_id,
               old_values=old_values, new_values=new_values,
               ip_address=ip_address, user_agent=user_agent)

        db.commit()
        db.refresh(pedido)
        pedido.economia = _economia(pedido)
        return pedido

    @staticmethod
    def change_status(db: Session, pedido_id: UUID, new_status: str,
                      current_user_id: UUID, reason: Optional[str] = None,
                      ip_address: str = None, user_agent: str = None) -> Pedido:
        pedido = PedidoService.get_by_id(db, pedido_id)
        old_status = pedido.status
        pedido.status = new_status
        # Antes isto so LIGAVA a flag. Pedido cancelado e depois reaberto ficava
        # com is_cancelled=True para sempre e sumia do relatorio, mesmo tendo
        # voltado a ser venda.
        _sincronizar_cancelamento(pedido)

        db.add(StatusHistory(
            entity_type=EntityType.PEDIDO,
            entity_id=pedido.id,
            old_status=old_status,
            new_status=new_status,
            changed_by=current_user_id,
            reason=reason,
        ))

        _audit(db, AuditAction.UPDATE, pedido.id, current_user_id,
               old_values={"status": old_status}, new_values={"status": new_status},
               ip_address=ip_address, user_agent=user_agent)

        db.commit()
        db.refresh(pedido)
        pedido.economia = _economia(pedido)
        return pedido

    @staticmethod
    def soft_delete(db: Session, pedido_id: UUID, current_user_id: UUID,
                    ip_address: str = None, user_agent: str = None) -> None:
        pedido = PedidoService.get_by_id(db, pedido_id)

        has_rma = db.query(Rma).filter(Rma.id_pedido_origem == pedido_id).first()
        if has_rma:
            raise BusinessLogicException("Pedido não pode ser excluído pois possui RMA(s) vinculado(s)")

        now = datetime.now(timezone.utc)
        pedido.deleted_at = now

        db.query(Produto).filter(
            Produto.id_pedido == pedido_id,
            Produto.deleted_at.is_(None),
        ).update({"deleted_at": now})

        _audit(db, AuditAction.DELETE, pedido.id, current_user_id,
               old_values={"status": pedido.status, "numero_os": pedido.numero_os},
               ip_address=ip_address, user_agent=user_agent)

        db.commit()
