"""Keep the order's stored purchase cost in sync with its products."""
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog, AuditAction
from app.models.pedido import CustoPedido, Pedido
from app.models.produto import Produto


def sync_product_cost(db: Session, pedido_id: UUID, user_id: UUID) -> None:
    # Serialize item saves for the same order before reading the new total.
    # The caller commits the item and its consolidated cost together.
    with db.no_autoflush:
        db.query(Pedido.id).filter(Pedido.id == pedido_id).with_for_update().first()
    db.flush()
    products = list(db.query(Produto).filter(
        Produto.id_pedido == pedido_id, Produto.deleted_at.is_(None),
    ).populate_existing().all())
    if not products:
        # Legacy orders without products may have a manually entered cost.
        return

    total = sum((
        (p.preco_custo or Decimal(0)) * p.quantidade if p.is_direct_supply
        else (p.valor_compra or Decimal(0))
        for p in products
    ), Decimal(0)).quantize(Decimal('0.01'))
    cost = db.query(CustoPedido).filter(CustoPedido.id_pedido == pedido_id).populate_existing().first()
    created = cost is None
    if created:
        cost = CustoPedido(id_pedido=pedido_id)
        db.add(cost)
    old = {'custo_produto_final': str(cost.custo_produto_final), 'imposto_compra': str(cost.imposto_compra)}
    cost.custo_produto_final = total
    if cost.pct_imposto_compra is not None:
        cost.imposto_compra = (total * cost.pct_imposto_compra / 100).quantize(Decimal('0.01'))
    new = {'custo_produto_final': str(cost.custo_produto_final), 'imposto_compra': str(cost.imposto_compra)}
    if old != new:
        db.flush()
        db.add(AuditLog(entity_type='custo_pedido', entity_id=cost.id,
                        action=AuditAction.CREATE if created else AuditAction.UPDATE, changed_by=user_id,
                        old_values=old, new_values=new))
