"""
Tests for RMA routes:
  POST   /rma
  GET    /rma
  GET    /rma/{id}
  PATCH  /rma/{id}/close
  PATCH  /rma/{id}/items/{item_id}/status
"""
import uuid
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.api.routes.rma import router as rma_router
from app.models.rma import RmaStatus
from app.models.item_rma import ItemRmaStatus
from app.utils.errors import NotFoundException, BusinessLogicException


def _fake_rma(rma_id=None):
    r = MagicMock()
    r.id = rma_id or uuid.uuid4()
    r.id_pedido_origem = uuid.uuid4()
    r.id_vendedor = uuid.uuid4()
    r.id_loja = uuid.uuid4()
    r.numero_rma = f"RMA-2026-000001"
    r.numero_os_origem = None
    r.data_registro = date.today()
    r.prazo_entrega = None
    r.status = RmaStatus.REGISTERED
    r.created_by = uuid.uuid4()
    r.created_at = datetime.now(timezone.utc)
    r.updated_at = datetime.now(timezone.utc)
    r.deleted_at = None
    r.itens = []
    return r


def _fake_item_rma(rma_id=None):
    item = MagicMock()
    item.id = uuid.uuid4()
    item.id_rma = rma_id or uuid.uuid4()
    item.id_produto_origem = uuid.uuid4()
    item.descricao = "Notebook com defeito"
    item.quantidade = 1
    item.status = ItemRmaStatus.NOT_RECEIVED
    item.fornecedor = None
    item.consertado_por = None
    item.valor_estornado = None
    item.data_estorno = None
    item.motivo_estorno = None
    item.created_at = datetime.now(timezone.utc)
    item.updated_at = datetime.now(timezone.utc)
    return item


_RMA_PAYLOAD = {
    "id_pedido_origem": str(uuid.uuid4()),
    "itens": [
        {
            "id_produto_origem": str(uuid.uuid4()),
            "descricao": "Notebook com defeito",
            "quantidade": 1,
        }
    ],
}


# ── POST /rma ─────────────────────────────────────────────────────────────────

class TestCreateRma:

    def test_returns_201_on_success(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.create", return_value=_fake_rma()):
            resp = client.post("/rma", json=_RMA_PAYLOAD)
        assert resp.status_code == 201

    def test_response_contains_numero_rma(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.create", return_value=_fake_rma()):
            resp = client.post("/rma", json=_RMA_PAYLOAD)
        assert "numero_rma" in resp.json()

    def test_response_status_is_registered(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.create", return_value=_fake_rma()):
            resp = client.post("/rma", json=_RMA_PAYLOAD)
        assert resp.json()["status"] == RmaStatus.REGISTERED.value

    def test_returns_404_when_pedido_not_found(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.create",
                   side_effect=NotFoundException("Pedido não encontrado")):
            resp = client.post("/rma", json=_RMA_PAYLOAD)
        assert resp.status_code == 404

    def test_returns_400_when_rma_number_already_exists(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.create",
                   side_effect=BusinessLogicException("Número RMA já existe")):
            resp = client.post("/rma", json=_RMA_PAYLOAD)
        assert resp.status_code == 400

    def test_returns_422_when_itens_is_empty(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        payload = {**_RMA_PAYLOAD, "itens": []}
        resp = client.post("/rma", json=payload)
        assert resp.status_code == 422


# ── GET /rma ──────────────────────────────────────────────────────────────────

class TestListRmas:

    def test_returns_200_with_empty_list(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.list", return_value=([], 0, 0)):
            resp = client.get("/rma")
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_returns_items_and_pagination(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.list", return_value=([_fake_rma()], 1, 1)):
            resp = client.get("/rma")
        body = resp.json()
        assert body["total"] == 1
        assert len(body["items"]) == 1

    def test_passes_status_filter_to_service(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        with patch("app.api.routes.rma.RmaService.list",
                   return_value=([], 0, 0)) as mock_list:
            client.get("/rma?status=Registered")
        call_kwargs = mock_list.call_args.kwargs
        assert call_kwargs["status"] == RmaStatus.REGISTERED


# ── GET /rma/{id} ─────────────────────────────────────────────────────────────

class TestGetRma:

    def test_returns_200_when_found(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        with patch("app.api.routes.rma.RmaService.get_by_id", return_value=_fake_rma(rma_id)):
            resp = client.get(f"/rma/{rma_id}")
        assert resp.status_code == 200

    def test_response_id_matches_path(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        with patch("app.api.routes.rma.RmaService.get_by_id", return_value=_fake_rma(rma_id)):
            resp = client.get(f"/rma/{rma_id}")
        assert resp.json()["id"] == str(rma_id)

    def test_returns_404_when_not_found(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        with patch("app.api.routes.rma.RmaService.get_by_id",
                   side_effect=NotFoundException("RMA não encontrado")):
            resp = client.get(f"/rma/{rma_id}")
        assert resp.status_code == 404


# ── PATCH /rma/{id}/close ─────────────────────────────────────────────────────

class TestCloseRma:

    def test_returns_200_on_success(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        fake = _fake_rma(rma_id)
        fake.status = RmaStatus.COMPLETED
        with patch("app.api.routes.rma.RmaService.close", return_value=fake):
            resp = client.patch(f"/rma/{rma_id}/close")
        assert resp.status_code == 200

    def test_response_status_is_completed(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        fake = _fake_rma(rma_id)
        fake.status = RmaStatus.COMPLETED
        with patch("app.api.routes.rma.RmaService.close", return_value=fake):
            resp = client.patch(f"/rma/{rma_id}/close")
        assert resp.json()["status"] == RmaStatus.COMPLETED.value

    def test_returns_404_when_not_found(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        with patch("app.api.routes.rma.RmaService.close",
                   side_effect=NotFoundException("not found")):
            resp = client.patch(f"/rma/{rma_id}/close")
        assert resp.status_code == 404

    def test_returns_400_when_already_completed(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        with patch("app.api.routes.rma.RmaService.close",
                   side_effect=BusinessLogicException("RMA já está concluído")):
            resp = client.patch(f"/rma/{rma_id}/close")
        assert resp.status_code == 400

    def test_returns_400_when_already_cancelled(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        with patch("app.api.routes.rma.RmaService.close",
                   side_effect=BusinessLogicException("RMA cancelado não pode ser concluído")):
            resp = client.patch(f"/rma/{rma_id}/close")
        assert resp.status_code == 400


# ── PATCH /rma/{id}/items/{item_id}/status ────────────────────────────────────

class TestUpdateItemStatus:

    def test_returns_200_on_success(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        item_id = uuid.uuid4()
        fake_item = _fake_item_rma(rma_id)
        fake_item.id = item_id
        fake_item.status = ItemRmaStatus.RECEIVED
        with patch("app.api.routes.rma.RmaService.update_item_status", return_value=fake_item):
            resp = client.patch(f"/rma/{rma_id}/items/{item_id}/status",
                                json={"new_status": "Received"})
        assert resp.status_code == 200

    def test_response_reflects_new_status(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        item_id = uuid.uuid4()
        fake_item = _fake_item_rma(rma_id)
        fake_item.id = item_id
        fake_item.status = ItemRmaStatus.IN_REPAIR
        with patch("app.api.routes.rma.RmaService.update_item_status", return_value=fake_item):
            resp = client.patch(f"/rma/{rma_id}/items/{item_id}/status",
                                json={"new_status": "In Repair"})
        assert resp.json()["status"] == ItemRmaStatus.IN_REPAIR.value

    def test_returns_404_when_item_not_found(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        item_id = uuid.uuid4()
        with patch("app.api.routes.rma.RmaService.update_item_status",
                   side_effect=NotFoundException("Item não encontrado")):
            resp = client.patch(f"/rma/{rma_id}/items/{item_id}/status",
                                json={"new_status": "Received"})
        assert resp.status_code == 404

    def test_returns_422_on_invalid_status_value(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        item_id = uuid.uuid4()
        resp = client.patch(f"/rma/{rma_id}/items/{item_id}/status",
                            json={"new_status": "StatusInvalido"})
        assert resp.status_code == 422

    def test_accepts_consertado_por_field(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id = uuid.uuid4()
        item_id = uuid.uuid4()
        fake_item = _fake_item_rma(rma_id)
        fake_item.id = item_id
        fake_item.status = ItemRmaStatus.REPAIRED_RECEIVED
        fake_item.consertado_por = "Técnico João"
        with patch("app.api.routes.rma.RmaService.update_item_status",
                   return_value=fake_item) as mock_upd:
            client.patch(f"/rma/{rma_id}/items/{item_id}/status",
                         json={"new_status": "Repaired Received", "consertado_por": "Técnico João"})
        call_args = mock_upd.call_args.args
        assert call_args[3].consertado_por == "Técnico João"
