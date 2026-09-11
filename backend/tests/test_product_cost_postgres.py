from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models import Pedido, Produto
from app.schemas.produto import ProdutoUpdate
from app.services.dashboard import get_kpis
from app.services.item_pedido import ItemPedidoService
from app.services.pedido import PedidoService
from tests.test_atomic_saves_postgres import records


@pytest.mark.parametrize('operation', ['purchase', 'item_status', 'order_status'])
def test_purchase_updates_persisted_cost_and_dashboard(records, operation):
    db, user, _, order_id, _, item_id, _, vendor, _ = records
    order = db.get(Pedido, order_id)
    order.custo.custo_produto_final = 0
    order.custo.pct_imposto_compra = 10
    order.custo.imposto_compra = 0
    item = db.get(Produto, item_id)
    item.quantidade = 3  # valor_compra is already the total, not unit cost.
    item.valor_compra = 420 if operation != 'purchase' else 0
    item.status = 'To Buy'
    db.add(Produto(id=uuid4(), id_pedido=order_id, id_vendedor=vendor,
                   descricao='Direct', quantidade=2, valor_projetado=100,
                   preco_custo=50, valor_compra=500, is_direct_supply=True))
    db.add(Produto(id=uuid4(), id_pedido=order_id, id_vendedor=vendor,
                   descricao='Deleted', quantidade=1, valor_projetado=100,
                   valor_compra=900, deleted_at=datetime.now(timezone.utc)))
    db.commit()

    if operation == 'purchase':
        ItemPedidoService.update_item(db, order_id, item_id, ProdutoUpdate(
            status='Bought', valor_compra=420,
            sub_compras=[{'purchaseValue': 200}, {'purchaseValue': 220}],
        ), user)
    elif operation == 'item_status':
        ItemPedidoService.update_item_status(db, order_id, item_id, 'Bought', user)
    else:
        PedidoService.change_status(db, order_id, 'Bought', user)

    db.expire_all()
    cost = db.get(Pedido, order_id).custo
    assert cost.custo_produto_final == Decimal('520.00')
    assert cost.imposto_compra == Decimal('52.00')
    assert cost.custo_boleto == 25
    kpis = get_kpis(db, data_inicio=date.today(), data_fim=date.today())
    assert kpis.custo_produtos == 520
    assert kpis.custo == 520 + 52 + 25 + 20


def test_status_without_purchase_value_does_not_use_estimate(records):
    db, user, _, order, _, item, *_ = records
    ItemPedidoService.update_item_status(db, order, item, 'Bought', user)
    db.expire_all()
    assert db.get(Pedido, order).custo.custo_produto_final == 0


def test_purchase_creates_missing_cost_and_can_clear_value(records):
    db, user, _, order, _, item, *_ = records
    db.delete(db.get(Pedido, order).custo)
    db.commit()
    ItemPedidoService.update_item(db, order, item, ProdutoUpdate(valor_compra=420), user)
    db.expire_all()
    assert db.get(Pedido, order).custo.custo_produto_final == 420
    ItemPedidoService.update_item(db, order, item, ProdutoUpdate(valor_compra=0), user)
    db.expire_all()
    assert db.get(Pedido, order).custo.custo_produto_final == 0


def test_failed_purchase_does_not_partially_save_cost(records, monkeypatch):
    db, user, _, order, _, item, *_ = records
    original_cost = db.get(Pedido, order).custo.custo_produto_final

    def fail_commit():
        raise RuntimeError('Simulated save failure')

    monkeypatch.setattr(db, 'commit', fail_commit)
    with pytest.raises(RuntimeError):
        ItemPedidoService.update_item(db, order, item, ProdutoUpdate(valor_compra=420), user)
    db.rollback()
    assert db.get(Produto, item).valor_compra is None
    assert db.get(Pedido, order).custo.custo_produto_final == original_cost
