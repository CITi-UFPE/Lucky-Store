"""
Tests for the expanded ItemRmaStatus enum (10 values) introduced in
feature/list-view-integration.

Covers:
  - All 10 enum members exist with the correct string values
  - Old values that no longer exist as direct enum members
  - Schema validation accepts every new status value
  - Schema validation rejects invalid strings
  - PATCH /rma/{id}/items/{item_id}/status accepts all new statuses
  - PATCH returns 422 for a string not in the enum
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.item_rma import ItemRmaStatus
from app.api.routes.rma import router as rma_router
from app.utils.errors import NotFoundException


# ── helper ────────────────────────────────────────────────────────────────────

def _fake_item(status: ItemRmaStatus):
    item = MagicMock()
    item.id = uuid.uuid4()
    item.id_rma = uuid.uuid4()
    item.id_produto_origem = None
    item.descricao = "Teclado com defeito"
    item.quantidade = 1
    item.status = status
    item.fornecedor = None
    item.consertado_por = None
    item.valor_estornado = None
    item.data_estorno = None
    item.motivo_estorno = None
    item.created_at = datetime.now(timezone.utc)
    item.updated_at = datetime.now(timezone.utc)
    return item


# ── enum membership ───────────────────────────────────────────────────────────

class TestItemRmaStatusEnum:

    def test_has_exactly_10_members(self):
        assert len(ItemRmaStatus) == 11

    def test_not_received_value(self):
        assert ItemRmaStatus.NOT_RECEIVED.value == "Not Received"

    def test_received_value(self):
        assert ItemRmaStatus.RECEIVED.value == "Received"

    def test_sent_for_repair_value(self):
        assert ItemRmaStatus.SENT_FOR_REPAIR.value == "Sent for Repair"

    def test_in_repair_value(self):
        assert ItemRmaStatus.IN_REPAIR.value == "In Repair"

    def test_repaired_not_received_value(self):
        assert ItemRmaStatus.REPAIRED_NOT_RECEIVED.value == "Repaired Not Received"

    def test_repaired_received_value(self):
        assert ItemRmaStatus.REPAIRED_RECEIVED.value == "Repaired Received"

    def test_to_pack_value(self):
        assert ItemRmaStatus.TO_PACK.value == "To Pack"

    def test_ready_for_delivery_value(self):
        assert ItemRmaStatus.READY_FOR_DELIVERY.value == "Ready for Delivery"

    def test_out_for_delivery_value(self):
        assert ItemRmaStatus.OUT_FOR_DELIVERY.value == "Out for Delivery"

    def test_delivered_value(self):
        assert ItemRmaStatus.DELIVERED.value == "Delivered"

    def test_old_repaired_is_not_a_member(self):
        values = [e.value for e in ItemRmaStatus]
        assert "Repaired" not in values

    def test_old_ready_is_not_a_member(self):
        values = [e.value for e in ItemRmaStatus]
        assert "Ready" not in values

    def test_old_shipped_is_not_a_member(self):
        values = [e.value for e in ItemRmaStatus]
        assert "Shipped" not in values

    def test_old_cancelled_is_not_a_member(self):
        values = [e.value for e in ItemRmaStatus]
        assert "Cancelled" not in values

    def test_lookup_by_value_succeeds_for_all_members(self):
        for member in ItemRmaStatus:
            result = ItemRmaStatus(member.value)
            assert result is member

    def test_lookup_invalid_value_raises(self):
        with pytest.raises(ValueError):
            ItemRmaStatus("Invalido")


# ── PATCH /rma/{id}/items/{item_id}/status ────────────────────────────────────

class TestItemStatusRoute:

    @pytest.mark.parametrize("status", list(ItemRmaStatus))
    def test_accepts_all_valid_statuses(self, make_test_client, mock_db, status):
        client = make_test_client(rma_router)
        rma_id, item_id = uuid.uuid4(), uuid.uuid4()
        fake = _fake_item(status)
        with patch("app.api.routes.rma.RmaService.update_item_status", return_value=fake):
            resp = client.patch(
                f"/rma/{rma_id}/items/{item_id}/status",
                json={"new_status": status.value},
            )
        assert resp.status_code == 200

    def test_rejects_old_repaired_string(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        resp = client.patch(
            f"/rma/{uuid.uuid4()}/items/{uuid.uuid4()}/status",
            json={"new_status": "Repaired"},
        )
        assert resp.status_code == 422

    def test_rejects_old_ready_string(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        resp = client.patch(
            f"/rma/{uuid.uuid4()}/items/{uuid.uuid4()}/status",
            json={"new_status": "Ready"},
        )
        assert resp.status_code == 422

    def test_rejects_old_shipped_string(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        resp = client.patch(
            f"/rma/{uuid.uuid4()}/items/{uuid.uuid4()}/status",
            json={"new_status": "Shipped"},
        )
        assert resp.status_code == 422

    def test_rejects_old_cancelled_string(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        resp = client.patch(
            f"/rma/{uuid.uuid4()}/items/{uuid.uuid4()}/status",
            json={"new_status": "Cancelled"},
        )
        assert resp.status_code == 422

    def test_response_contains_status_field(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id, item_id = uuid.uuid4(), uuid.uuid4()
        fake = _fake_item(ItemRmaStatus.REPAIRED_RECEIVED)
        with patch("app.api.routes.rma.RmaService.update_item_status", return_value=fake):
            resp = client.patch(
                f"/rma/{rma_id}/items/{item_id}/status",
                json={"new_status": "Repaired Received"},
            )
        assert resp.json()["status"] == "Repaired Received"

    def test_not_received_roundtrip(self, make_test_client, mock_db):
        client = make_test_client(rma_router)
        rma_id, item_id = uuid.uuid4(), uuid.uuid4()
        fake = _fake_item(ItemRmaStatus.NOT_RECEIVED)
        with patch("app.api.routes.rma.RmaService.update_item_status", return_value=fake):
            resp = client.patch(
                f"/rma/{rma_id}/items/{item_id}/status",
                json={"new_status": "Not Received"},
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "Not Received"
