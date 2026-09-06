"""
Tests for pedido routes:
  POST   /pedidos
  GET    /pedidos
  GET    /pedidos/{id}
  PUT    /pedidos/{id}
  PATCH  /pedidos/{id}/status
  DELETE /pedidos/{id}
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.api.routes.pedidos import router as pedidos_router
from app.utils.errors import NotFoundException, BusinessLogicException


def _fake_pedido(pedido_id=None):
    from unittest.mock import MagicMock
    p = MagicMock()
    p.id = pedido_id or uuid.uuid4()
    p.id_loja = uuid.uuid4()
    p.id_vendedor = uuid.uuid4()
    p.id_cliente = uuid.uuid4()
    p.id_cotacao = None
    p.numero_cotacao = None
    # A empresa fica em nome_cliente/clientes.nome; este e o contato, que nasce
    # vazio nos pedidos que ja existiam. Sem definir, o MagicMock devolve outro
    # MagicMock e o Pydantic recusa a resposta.
    p.contato_cliente = None
    p.numero_os = "OS-001"
    p.numero_nf = None
    p.numero_oc = None
    p.data_pedido = date.today()
    p.data_entrega = date.today()
    p.status = "To Buy"
    p.is_rma = False
    p.is_cancelled = False
    p.is_direct_billing = False
    p.valor_venda = Decimal("1000.00")
    p.parcelas = None
    p.observacao = None
    p.fornecedor_principal = None
    p.nota_fiscal_fornecedor = None
    p.created_by = uuid.uuid4()
    p.created_at = datetime.now(timezone.utc)
    p.updated_at = datetime.now(timezone.utc)
    p.economia = None
    p.formas_pagamento = []
    p.fretes = []
    p.produtos = []
    p.custo = None
    p.deleted_at = None
    p.status_history = []
    p.data_pagamento = None
    p.multa = None
    p.juros = None
    p.forma_pagamento_efetiva = None
    p.num_parcelas_efetivas = None
    p.plano_parcelas = None
    cliente = MagicMock()
    cliente.nome = None
    cliente.cnpj = None
    p.cliente = cliente
    loja = MagicMock()
    loja.nome = None
    p.loja = loja
    vendedor = MagicMock()
    vendedor.nome = None
    p.vendedor = vendedor
    return p


_PEDIDO_PAYLOAD = {
    "id_loja": str(uuid.uuid4()),
    "id_vendedor": str(uuid.uuid4()),
    "nome_cliente": "Cliente Teste",
    "data_pedido": str(date.today()),
    "data_entrega": str(date.today()),
    "status": "To Buy",
    "formas_pagamento": [],
}


# ── POST /pedidos ─────────────────────────────────────────────────────────────

class TestCreatePedido:

    def test_returns_201_on_success(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        with patch("app.api.routes.pedidos.PedidoService.create", return_value=_fake_pedido()):
            resp = client.post("/pedidos", json=_PEDIDO_PAYLOAD)
        assert resp.status_code == 201

    def test_response_contains_numero_os(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        with patch("app.api.routes.pedidos.PedidoService.create", return_value=_fake_pedido()):
            resp = client.post("/pedidos", json=_PEDIDO_PAYLOAD)
        assert resp.json()["numero_os"] == "OS-001"

    def test_returns_400_on_service_exception(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        with patch("app.api.routes.pedidos.PedidoService.create", side_effect=Exception("DB error")):
            resp = client.post("/pedidos", json=_PEDIDO_PAYLOAD)
        assert resp.status_code == 400

    def test_returns_422_on_invalid_status(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        payload = {**_PEDIDO_PAYLOAD, "status": "InvalidStatus"}
        resp = client.post("/pedidos", json=payload)
        assert resp.status_code == 422


# ── GET /pedidos ──────────────────────────────────────────────────────────────

class TestListPedidos:

    def test_returns_200_with_empty_list(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        with patch("app.api.routes.pedidos.PedidoService.list", return_value=([], 0, 0)):
            resp = client.get("/pedidos")
        assert resp.status_code == 200
        assert resp.json()["items"] == []
        assert resp.json()["total"] == 0

    def test_returns_items_and_pagination_fields(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        with patch("app.api.routes.pedidos.PedidoService.list", return_value=([_fake_pedido()], 1, 1)), \
             patch("app.api.routes.pedidos._total_estornado", return_value=Decimal("0")):
            resp = client.get("/pedidos")
        body = resp.json()
        assert body["total"] == 1
        assert body["pages"] == 1
        assert len(body["items"]) == 1

    def test_passes_query_params_to_service(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        with patch("app.api.routes.pedidos.PedidoService.list", return_value=([], 0, 0)) as mock_list:
            client.get("/pedidos?status=Bought&page=2&limit=5")
        call_kwargs = mock_list.call_args.kwargs
        assert call_kwargs["status"] == "Bought"
        assert call_kwargs["page"] == 2
        assert call_kwargs["limit"] == 5


# ── GET /pedidos/{id} ─────────────────────────────────────────────────────────

class TestGetPedido:

    def test_returns_200_when_found(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.get_by_id", return_value=_fake_pedido(pedido_id)), \
             patch("app.api.routes.pedidos.PedidoService.get_status_history", return_value=[]):
            resp = client.get(f"/pedidos/{pedido_id}")
        assert resp.status_code == 200

    def test_response_contains_correct_id(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.get_by_id", return_value=_fake_pedido(pedido_id)), \
             patch("app.api.routes.pedidos.PedidoService.get_status_history", return_value=[]):
            resp = client.get(f"/pedidos/{pedido_id}")
        assert resp.json()["id"] == str(pedido_id)

    def test_returns_404_when_not_found(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.get_by_id",
                   side_effect=NotFoundException("Pedido não encontrado")):
            resp = client.get(f"/pedidos/{pedido_id}")
        assert resp.status_code == 404


# ── PUT /pedidos/{id} ─────────────────────────────────────────────────────────

class TestUpdatePedido:

    def test_returns_200_on_success(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.update", return_value=_fake_pedido(pedido_id)):
            resp = client.put(f"/pedidos/{pedido_id}", json={"observacao": "updated"})
        assert resp.status_code == 200

    def test_returns_404_when_not_found(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.update",
                   side_effect=NotFoundException("not found")):
            resp = client.put(f"/pedidos/{pedido_id}", json={"observacao": "updated"})
        assert resp.status_code == 404

    def test_returns_400_on_general_exception(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.update",
                   side_effect=Exception("unexpected")):
            resp = client.put(f"/pedidos/{pedido_id}", json={"observacao": "updated"})
        assert resp.status_code == 400


# ── PATCH /pedidos/{id}/status ────────────────────────────────────────────────

class TestChangeStatus:

    def test_returns_200_on_valid_transition(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        fake = _fake_pedido(pedido_id)
        fake.status = "Bought"
        with patch("app.api.routes.pedidos.PedidoService.change_status", return_value=fake):
            resp = client.patch(f"/pedidos/{pedido_id}/status", json={"new_status": "Bought"})
        assert resp.status_code == 200

    def test_new_status_reflected_in_response(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        fake = _fake_pedido(pedido_id)
        fake.status = "Received"
        with patch("app.api.routes.pedidos.PedidoService.change_status", return_value=fake):
            resp = client.patch(f"/pedidos/{pedido_id}/status", json={"new_status": "Received"})
        assert resp.json()["status"] == "Received"

    def test_returns_422_on_invalid_status_value(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        resp = client.patch(f"/pedidos/{pedido_id}/status", json={"new_status": "INVALID"})
        assert resp.status_code == 422

    def test_returns_404_when_order_not_found(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.change_status",
                   side_effect=NotFoundException("not found")):
            resp = client.patch(f"/pedidos/{pedido_id}/status", json={"new_status": "Bought"})
        assert resp.status_code == 404

    def test_accepts_optional_reason(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.change_status",
                   return_value=_fake_pedido(pedido_id)) as mock_cs:
            client.patch(f"/pedidos/{pedido_id}/status",
                         json={"new_status": "Cancelled", "reason": "Cliente desistiu"})
        # reason is passed as the 5th positional arg: (db, pedido_id, new_status, user_id, reason)
        assert mock_cs.call_args.args[4] == "Cliente desistiu"


# ── DELETE /pedidos/{id} ──────────────────────────────────────────────────────

class TestDeletePedido:

    def test_returns_204_on_success(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.soft_delete", return_value=None):
            resp = client.delete(f"/pedidos/{pedido_id}")
        assert resp.status_code == 204

    def test_returns_404_when_not_found(self, make_test_client, mock_db):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.soft_delete",
                   side_effect=NotFoundException("not found")):
            resp = client.delete(f"/pedidos/{pedido_id}")
        assert resp.status_code == 404

    def test_calls_soft_delete_with_user_id(self, make_test_client, mock_db, fake_user):
        client = make_test_client(pedidos_router)
        pedido_id = uuid.uuid4()
        with patch("app.api.routes.pedidos.PedidoService.soft_delete",
                   return_value=None) as mock_del:
            client.delete(f"/pedidos/{pedido_id}")
        assert mock_del.call_args.args[2] == fake_user.id
