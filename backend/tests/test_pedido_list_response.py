"""
Tests for PedidoListItemResponse schema and the ProdutoUpdate.sub_compras field
introduced in feature/list-view-integration.

Validates:
  - PedidoListItemResponse includes a produtos field
  - PedidoListItemResponse can be constructed with produtos that have sub_compras
  - ProdutoUpdate accepts sub_compras as an arbitrary JSON list
  - ProdutoUpdate.status validation rejects values not in PRODUTO_STATUSES
  - The 3 item-purchase statuses (To Buy, Bought, In Stock) are valid PRODUTO_STATUSES
  - auto_delayed: pedidos com data_entrega no passado e status não-final viram "Delayed"
"""
import pytest
from decimal import Decimal
from datetime import date, datetime, timezone, timedelta
from uuid import uuid4
from pydantic import ValidationError

from app.schemas.pedido import PedidoListItemResponse, PedidoListResponse, PedidoResponse
from app.schemas.produto import ProdutoResponse, ProdutoUpdate
from app.models.produto import PRODUTO_STATUSES


def _make_produto_response(**overrides):
    base = dict(
        id=uuid4(),
        id_pedido=uuid4(),
        id_vendedor=uuid4(),
        id_comprador=None,
        descricao="Notebook",
        quantidade=1,
        valor_projetado=Decimal("3000.00"),
        preco_custo=None,
        valor_compra=None,
        # Quanto o cliente paga por este item. Campo obrigatorio na resposta
        # desde que se descobriu que o preco de venda ficava emprestado em
        # valor_compra e sumia quando o item era comprado.
        valor_venda=None,
        economia=None,
        sub_compras=None,
        fornecedor=None,
        data_compra=None,
        prazo_entrega=None,
        data_recebimento=None,
        status="To Buy",
        is_direct_supply=False,
        porcentagem_fornecedor=None,
        frete_fornecedor=None,
        nota_fiscal_item=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    base.update(overrides)
    return ProdutoResponse(**base)


def _make_pedido_list_item(**overrides):
    base = dict(
        id=uuid4(),
        numero_os="OS-001",
        data_pedido=date.today(),
        data_entrega=date.today(),
        status="To Buy",
        produtos=[],
        formas_pagamento=[],
        fretes=[],
    )
    base.update(overrides)
    return PedidoListItemResponse(**base)


# ── PedidoListItemResponse ────────────────────────────────────────────────────

class TestPedidoListItemResponse:

    def test_has_produtos_field(self):
        item = _make_pedido_list_item()
        assert hasattr(item, "produtos")

    def test_produtos_defaults_to_empty_list(self):
        item = _make_pedido_list_item()
        assert item.produtos == []

    def test_accepts_list_of_produto_responses(self):
        produto = _make_produto_response()
        item = _make_pedido_list_item(produtos=[produto])
        assert len(item.produtos) == 1
        assert item.produtos[0].descricao == "Notebook"

    def test_produto_with_sub_compras_serialises(self):
        sub_compras = [
            {"id": str(uuid4()), "status": "To Buy", "purchaseValue": 1200.0, "selectedQuantity": 1}
        ]
        produto = _make_produto_response(sub_compras=sub_compras)
        item = _make_pedido_list_item(produtos=[produto])
        assert item.produtos[0].sub_compras is not None
        assert item.produtos[0].sub_compras[0]["status"] == "To Buy"

    def test_produto_sub_compras_multiple_entries(self):
        sub_compras = [
            {"id": str(uuid4()), "status": "To Buy", "purchaseValue": 500.0, "selectedQuantity": 1},
            {"id": str(uuid4()), "status": "Bought", "purchaseValue": 600.0, "selectedQuantity": 1},
        ]
        produto = _make_produto_response(sub_compras=sub_compras, status="To Buy")
        item = _make_pedido_list_item(produtos=[produto])
        assert len(item.produtos[0].sub_compras) == 2

    def test_multiple_produtos_in_list_item(self):
        produtos = [_make_produto_response(descricao=f"Produto {i}") for i in range(3)]
        item = _make_pedido_list_item(produtos=produtos)
        assert len(item.produtos) == 3


# ── PedidoListResponse wrapper ────────────────────────────────────────────────

class TestPedidoListResponse:

    def test_wraps_items_and_pagination(self):
        item = _make_pedido_list_item()
        resp = PedidoListResponse(items=[item], total=1, page=1, limit=20, pages=1)
        assert resp.total == 1
        assert len(resp.items) == 1


# ── auto_delayed ─────────────────────────────────────────────────────────────

YESTERDAY = date.today() - timedelta(days=1)
TOMORROW = date.today() + timedelta(days=1)


class TestAutoDelayed:

    def test_overdue_order_becomes_delayed(self):
        item = _make_pedido_list_item(status="To Buy", data_entrega=YESTERDAY)
        assert item.status == "Delayed"

    def test_overdue_order_any_non_final_status_becomes_delayed(self):
        for status in ("To Buy", "Bought", "Received", "To Invoice", "To Pack", "Out for Delivery"):
            item = _make_pedido_list_item(status=status, data_entrega=YESTERDAY)
            assert item.status == "Delayed", f"esperado Delayed para status={status}"

    def test_delivered_order_stays_delivered_even_if_overdue(self):
        item = _make_pedido_list_item(status="Delivered", data_entrega=YESTERDAY)
        assert item.status == "Delivered"

    def test_cancelled_order_stays_cancelled_even_if_overdue(self):
        item = _make_pedido_list_item(status="Cancelled", data_entrega=YESTERDAY)
        assert item.status == "Cancelled"

    def test_already_delayed_stays_delayed(self):
        item = _make_pedido_list_item(status="Delayed", data_entrega=YESTERDAY)
        assert item.status == "Delayed"

    def test_future_order_status_unchanged(self):
        item = _make_pedido_list_item(status="To Buy", data_entrega=TOMORROW)
        assert item.status == "To Buy"

    def test_order_due_today_not_delayed(self):
        item = _make_pedido_list_item(status="To Buy", data_entrega=date.today())
        assert item.status == "To Buy"


class TestAutoDelayedPedidoResponse:

    def _make_pedido_response(self, **overrides):
        base = dict(
            id=uuid4(),
            id_loja=uuid4(),
            id_vendedor=uuid4(),
            id_cliente=uuid4(),
            numero_os="OS-001",
            numero_nf=None,
            numero_oc=None,
            data_pedido=date.today(),
            data_entrega=date.today(),
            status="To Buy",
            is_rma=False,
            is_cancelled=False,
            is_direct_billing=False,
            valor_venda=None,
            parcelas=None,
            observacao=None,
            fornecedor_principal=None,
            nota_fiscal_fornecedor=None,
            created_by=uuid4(),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            formas_pagamento=[],
            custo=None,
        )
        base.update(overrides)
        return PedidoResponse(**base)

    def test_overdue_order_becomes_delayed(self):
        resp = self._make_pedido_response(status="To Buy", data_entrega=YESTERDAY)
        assert resp.status == "Delayed"

    def test_delivered_stays_delivered(self):
        resp = self._make_pedido_response(status="Delivered", data_entrega=YESTERDAY)
        assert resp.status == "Delivered"

    def test_future_order_unchanged(self):
        resp = self._make_pedido_response(status="To Buy", data_entrega=TOMORROW)
        assert resp.status == "To Buy"


# ── ProdutoUpdate sub_compras ─────────────────────────────────────────────────

class TestProdutoUpdateSubCompras:

    def test_accepts_none(self):
        obj = ProdutoUpdate(sub_compras=None)
        assert obj.sub_compras is None

    def test_accepts_empty_list(self):
        obj = ProdutoUpdate(sub_compras=[])
        assert obj.sub_compras == []

    def test_accepts_list_of_dicts(self):
        payload = [{"id": str(uuid4()), "status": "To Buy", "purchaseValue": 100.0}]
        obj = ProdutoUpdate(sub_compras=payload)
        assert len(obj.sub_compras) == 1

    def test_status_to_buy_is_valid(self):
        obj = ProdutoUpdate(status="To Buy")
        assert obj.status == "To Buy"

    def test_status_bought_is_valid(self):
        obj = ProdutoUpdate(status="Bought")
        assert obj.status == "Bought"

    def test_status_in_stock_is_valid(self):
        obj = ProdutoUpdate(status="In Stock")
        assert obj.status == "In Stock"

    def test_status_invalid_raises(self):
        with pytest.raises(ValidationError):
            ProdutoUpdate(status="Invalido")


# ── PRODUTO_STATUSES list ─────────────────────────────────────────────────────

class TestProdutoStatuses:

    def test_to_buy_in_statuses(self):
        assert "To Buy" in PRODUTO_STATUSES

    def test_bought_in_statuses(self):
        assert "Bought" in PRODUTO_STATUSES

    def test_in_stock_in_statuses(self):
        assert "In Stock" in PRODUTO_STATUSES

    def test_all_three_purchase_statuses_present(self):
        for s in ("To Buy", "Bought", "In Stock"):
            assert s in PRODUTO_STATUSES, f"'{s}' missing from PRODUTO_STATUSES"
