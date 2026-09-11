import json
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.produto import Produto
from app.schemas.produto import ProdutoCreate, ProdutoUpdate
from app.services.pedido import PedidoService
from app.services.product_cost import sync_product_cost
from app.models.audit_log import AuditLog, AuditAction
from app.models.status_history import StatusHistory, EntityType
from app.utils.errors import NotFoundException


def _to_jsonable(v):
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, UUID):
        return str(v)
    return v


class ItemPedidoService:

    @staticmethod
    def _get_item(db: Session, pedido_id: UUID, item_id: UUID) -> Produto:
        """Busca item validando pertencimento ao pedido. 404 sem vazar contexto."""
        item = db.query(Produto).filter(
            Produto.id == item_id,
            Produto.id_pedido == pedido_id,
        ).first()
        if not item:
            raise NotFoundException(f"Item {item_id} não encontrado no pedido {pedido_id}")
        return item

    @staticmethod
    def add_item(db: Session, pedido_id: UUID, data: ProdutoCreate, current_user_id: UUID) -> Produto:
        PedidoService.get_by_id(db, pedido_id)  # valida que pedido existe e não está deletado

        produto = Produto(
            id_pedido=pedido_id,
            id_vendedor=data.id_vendedor,
            id_comprador=data.id_comprador,
            descricao=data.descricao,
            observacao=data.observacao,
            quantidade=data.quantidade,
            valor_projetado=data.valor_projetado,
            valor_compra=data.valor_compra,
            # Quanto o cliente paga por este item. Campo proprio desde que se
            # descobriu que o preco de venda sumia ao comprar o item.
            valor_venda=data.valor_venda,
            # Em itens de fornecimento direto, valor_compra guarda o valor de VENDA
            # e preco_custo guarda o custo pago ao fornecedor.
            preco_custo=data.preco_custo,
            fornecedor=data.fornecedor,
            is_direct_supply=data.is_direct_supply,
            porcentagem_fornecedor=data.porcentagem_fornecedor,
            frete_fornecedor=data.frete_fornecedor,
            nota_fiscal_item=data.nota_fiscal_item,
            data_compra=data.data_compra,
            prazo_entrega=data.prazo_entrega,
            data_recebimento=data.data_recebimento,
            status=data.status,
        )
        db.add(produto)
        db.flush()

        db.add(AuditLog(
            entity_type="produto",
            entity_id=produto.id,
            action=AuditAction.CREATE,
            changed_by=current_user_id,
            new_values={"descricao": data.descricao, "quantidade": data.quantidade},
        ))
        db.add(StatusHistory(
            entity_type=EntityType.PRODUTO,
            entity_id=produto.id,
            old_status=None,
            new_status="created",
            changed_by=current_user_id,
            reason="Item adicionado",
        ))

        db.commit()
        db.refresh(produto)
        return produto

    @staticmethod
    def update_item(db: Session, pedido_id: UUID, item_id: UUID,
                    data: ProdutoUpdate, current_user_id: UUID) -> Produto:
        produto = ItemPedidoService._get_item(db, pedido_id, item_id)
        changes = data.model_dump(exclude_none=True)
        if not changes:
            return produto

        old_values = {k: _to_jsonable(getattr(produto, k)) for k in changes}
        new_values = {k: _to_jsonable(v) for k, v in changes.items()}
        for field, value in changes.items():
            setattr(produto, field, value)

        if changes.keys() & {'valor_compra', 'preco_custo', 'quantidade', 'status'}:
            sync_product_cost(db, pedido_id, current_user_id)

        db.add(AuditLog(
            entity_type="produto",
            entity_id=item_id,
            action=AuditAction.UPDATE,
            changed_by=current_user_id,
            old_values=old_values,
            new_values=new_values,
        ))

        db.commit()
        db.refresh(produto)
        return produto

    @staticmethod
    def update_item_status(db: Session, pedido_id: UUID, item_id: UUID,
                           new_status: str, current_user_id: UUID) -> Produto:
        produto = ItemPedidoService._get_item(db, pedido_id, item_id)
        old_status = produto.status
        produto.status = new_status
        sync_product_cost(db, pedido_id, current_user_id)

        db.add(AuditLog(
            entity_type="produto",
            entity_id=item_id,
            action=AuditAction.UPDATE,
            changed_by=current_user_id,
            old_values={"status": old_status},
            new_values={"status": new_status},
        ))
        db.add(StatusHistory(
            entity_type=EntityType.PRODUTO,
            entity_id=item_id,
            old_status=old_status,
            new_status=new_status,
            changed_by=current_user_id,
        ))

        db.commit()
        db.refresh(produto)
        return produto

    @staticmethod
    def remove_item(db: Session, pedido_id: UUID, item_id: UUID, current_user_id: UUID) -> None:
        produto = ItemPedidoService._get_item(db, pedido_id, item_id)

        db.add(AuditLog(
            entity_type="produto",
            entity_id=item_id,
            action=AuditAction.DELETE,
            changed_by=current_user_id,
            old_values={"descricao": produto.descricao, "status": produto.status},
        ))

        db.delete(produto)
        db.commit()
