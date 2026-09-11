from datetime import date
from uuid import UUID, uuid4
from sqlalchemy.orm import Session

from app.models.cotacao import Cotacao
from app.models.cliente import Cliente
from app.services.cliente_identidade import obter_ou_criar_cliente
from app.models.item_cotacao import ItemCotacao
from app.models.pedido import Pedido
from app.models.produto import Produto
from app.models.status_history import StatusHistory, EntityType
from app.models.audit_log import AuditLog, AuditAction
from app.services.pedido import _generate_numero_os, _numero_provisorio
from app.utils.errors import NotFoundException, BusinessLogicException


class ConversaoCotacaoService:

    @staticmethod
    def convert_to_pedido(
        db: Session,
        cotacao_id: UUID,
        current_user_id: UUID,
    ) -> Pedido:
        cotacao = db.query(Cotacao).filter(
            Cotacao.id == cotacao_id,
            Cotacao.deleted_at.is_(None),
        ).with_for_update().first()
        if not cotacao:
            raise NotFoundException(f"Cotação {cotacao_id} não encontrada")

        if cotacao.status_caida:
            raise BusinessLogicException("Cotação caída não pode ser convertida em pedido")

        existing_pedido = db.query(Pedido).filter(
            Pedido.id_cotacao == cotacao_id,
            Pedido.deleted_at.is_(None),
        ).first()
        if existing_pedido:
            raise BusinessLogicException(
                f"Cotação já foi convertida no pedido {existing_pedido.numero_os}"
            )

        # Resolve o cliente pela regra compartilhada. Antes, sem CNPJ, esta
        # conversao casava por NOME — dois "Joao" sem documento viravam o mesmo
        # cliente aqui e clientes diferentes na criacao de pedido.
        # A cotacao separa empresa (b2b_company) de pessoa (cliente); o pedido
        # passou a separar tambem. O cadastro de cliente e da EMPRESA — e dela
        # que o CNPJ e —, e a pessoa vai para contato_cliente. Antes os dois
        # entravam fundidos: o b2b_company era descartado na conversao.
        empresa = (cotacao.b2b_company or "").strip() or cotacao.cliente
        cliente = obter_ou_criar_cliente(db, empresa, cotacao.cnpj_cliente)

        # O numero da OS NAO sai aqui — ver o comentario depois do db.add.
        pedido_id = uuid4()
        pedido = Pedido(
            id=pedido_id,
            id_loja=cotacao.id_loja,
            id_vendedor=cotacao.id_vendedor,
            id_cliente=cliente.id,
            id_cotacao=cotacao.id,
            contato_cliente=(cotacao.cliente or "").strip() or None,
            numero_os=_numero_provisorio(pedido_id),
            numero_nf=None,
            data_pedido=date.today(),
            data_entrega=cotacao.data_prevista_fechamento or date.today(),
            status="To Buy",
            is_direct_billing=cotacao.is_direct_billing,
            fornecedor_principal=cotacao.fornecedor,
            observacao=cotacao.observacao,
            created_by=current_user_id,
        )
        db.add(pedido)

        # Mesma ordem da criacao normal de pedido (app/services/pedido.py): o
        # numero vem de nextval, que nao volta no rollback, entao pedi-lo antes
        # do INSERT faz toda insercao recusada pelo banco abrir um buraco
        # permanente na numeracao. Aqui a recusa e plausivel — id_loja e
        # id_vendedor vem da cotacao e podem apontar para loja ou vendedor
        # excluido depois que a cotacao foi criada.
        db.flush()
        pedido.numero_os = numero_os = _generate_numero_os(db)
        db.flush()

        itens_cotacao = db.query(ItemCotacao).filter(ItemCotacao.id_cotacao == cotacao_id).all()
        for item in itens_cotacao:
            db.add(Produto(
                id_pedido=pedido.id,
                id_vendedor=cotacao.id_vendedor,
                descricao=item.descricao,
                quantidade=item.quantidade,
                # O custo projetado e o custo da cotacao; o preco do cliente
                # vai para valor_venda, que e o campo dele.
                valor_projetado=item.valor_unitario,
                valor_venda=item.valor_fechamento,
                # Item normal: valor_compra fica VAZIO, porque nada foi comprado
                # ainda. Ele recebia `valor_fechamento`, o preco do cliente, e
                # era isso que fazia a coluna "Valor de compra" do documento
                # mostrar o preco de venda — ate o item ser comprado, quando o
                # campo era sobrescrito e o preco de venda se perdia.
                #
                # Fornecimento direto e a excecao, e ela e antiga: ali
                # valor_compra guarda o valor de VENDA por convencao (ver
                # item_pedido.add_item) e e dele que saem a margem e o custo do
                # fornecedor. Esvaziar zeraria essas contas.
                valor_compra=item.valor_fechamento if item.is_direct_supply else None,
                fornecedor=item.fornecedor,
                is_direct_supply=item.is_direct_supply,
                porcentagem_fornecedor=item.porcentagem_fornecedor,
                frete_fornecedor=item.frete_fornecedor,
                status="To Buy",
            ))

        db.add(StatusHistory(
            entity_type=EntityType.PEDIDO,
            entity_id=pedido.id,
            old_status=None,
            new_status="To Buy",
            changed_by=current_user_id,
            reason=f"Criado a partir da cotação {cotacao.numero_requisicao or cotacao_id}",
        ))

        db.add(AuditLog(
            entity_type="pedido",
            entity_id=pedido.id,
            action=AuditAction.CREATE,
            changed_by=current_user_id,
            new_values={
                "numero_os": numero_os,
                "origem": "cotacao",
                "cotacao_id": str(cotacao_id),
            },
        ))

        cotacao.status_fechada = True
        cotacao.data_fechamento = date.today()
        if cotacao.valor_total and not cotacao.valor_fechamento:
            cotacao.valor_fechamento = cotacao.valor_total

        db.add(AuditLog(
            entity_type="cotacao",
            entity_id=cotacao.id,
            action=AuditAction.UPDATE,
            changed_by=current_user_id,
            old_values={"status_fechada": False},
            new_values={"status_fechada": True, "pedido_id": str(pedido.id)},
        ))

        db.commit()
        db.refresh(pedido)
        return pedido
