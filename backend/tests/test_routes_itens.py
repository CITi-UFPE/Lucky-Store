import uuid
import pytest
from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.itens_pedido import router
from app.schemas.produto import ProdutoResponse
from app.utils.errors import NotFoundException
from app.database import get_db
from app.api.routes.auth import get_current_user_dep


def _produto_response(pedido_id=None, status="Pending"):
    return ProdutoResponse(
        id=uuid.uuid4(),
        id_pedido=pedido_id or uuid.uuid4(),
        id_vendedor=uuid.uuid4(),
        id_comprador=None,
        descricao="Produto teste",
        quantidade=2,
        valor_projetado=Decimal("100.00"),
        preco_custo=None,
        valor_compra=None,
        # Quanto o cliente paga por este item — ver app/schemas/produto.py.
        valor_venda=None,
        economia=None,
        fornecedor=None,
        data_compra=None,
        prazo_entrega=None,
        data_recebimento=None,
        status=status,
        is_direct_supply=False,
        porcentagem_fornecedor=None,
        frete_fornecedor=None,
        nota_fiscal_item=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def _no_auth_client(mock_db):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: mock_db
    return TestClient(app, raise_server_exceptions=False)


# ── POST /pedidos/{id}/items ──────────────────────────────────────────────────

def test_add_item_success(make_test_client):
    client = make_test_client(router)
    pedido_id = uuid.uuid4()
    payload = {"id_vendedor": str(uuid.uuid4()), "descricao": "Teclado", "quantidade": 1, "valor_projetado": "250.00"}
    with patch("app.api.routes.itens_pedido.ItemPedidoService.add_item") as m:
        m.return_value = _produto_response(pedido_id)
        r = client.post(f"/pedidos/{pedido_id}/items", json=payload)
    assert r.status_code == 201
    assert r.json()["descricao"] == "Produto teste"


def test_add_item_pedido_not_found(make_test_client):
    client = make_test_client(router)
    payload = {"id_vendedor": str(uuid.uuid4()), "descricao": "X", "quantidade": 1, "valor_projetado": "10"}
    with patch("app.api.routes.itens_pedido.ItemPedidoService.add_item") as m:
        m.side_effect = NotFoundException("Pedido não encontrado")
        r = client.post(f"/pedidos/{uuid.uuid4()}/items", json=payload)
    assert r.status_code == 404


def test_add_item_no_auth(mock_db):
    client = _no_auth_client(mock_db)
    r = client.post(f"/pedidos/{uuid.uuid4()}/items", json={})
    assert r.status_code == 401


# ── PATCH /pedidos/{id}/items/{item_id}/status ────────────────────────────────

def test_update_status_success(make_test_client):
    client = make_test_client(router)
    pedido_id, item_id = uuid.uuid4(), uuid.uuid4()
    with patch("app.api.routes.itens_pedido.ItemPedidoService.update_item_status") as m:
        m.return_value = _produto_response(pedido_id, status="Received")
        r = client.patch(f"/pedidos/{pedido_id}/items/{item_id}/status", json={"new_status": "Received"})
    assert r.status_code == 200
    assert r.json()["status"] == "Received"


def test_update_status_item_not_found(make_test_client):
    client = make_test_client(router)
    with patch("app.api.routes.itens_pedido.ItemPedidoService.update_item_status") as m:
        m.side_effect = NotFoundException("Item não encontrado")
        r = client.patch(f"/pedidos/{uuid.uuid4()}/items/{uuid.uuid4()}/status", json={"new_status": "Received"})
    assert r.status_code == 404


def test_update_status_invalid_status(make_test_client):
    client = make_test_client(router)
    r = client.patch(f"/pedidos/{uuid.uuid4()}/items/{uuid.uuid4()}/status", json={"new_status": "INVALIDO"})
    assert r.status_code == 422


# ── DELETE /pedidos/{id}/items/{item_id} ──────────────────────────────────────

def test_delete_item_success(make_test_client):
    client = make_test_client(router)
    with patch("app.api.routes.itens_pedido.ItemPedidoService.remove_item") as m:
        m.return_value = None
        r = client.delete(f"/pedidos/{uuid.uuid4()}/items/{uuid.uuid4()}")
    assert r.status_code == 204


def test_delete_item_not_found(make_test_client):
    client = make_test_client(router)
    with patch("app.api.routes.itens_pedido.ItemPedidoService.remove_item") as m:
        m.side_effect = NotFoundException("Item não encontrado")
        r = client.delete(f"/pedidos/{uuid.uuid4()}/items/{uuid.uuid4()}")
    assert r.status_code == 404


def test_delete_item_no_auth(mock_db):
    client = _no_auth_client(mock_db)
    r = client.delete(f"/pedidos/{uuid.uuid4()}/items/{uuid.uuid4()}")
    assert r.status_code == 401
