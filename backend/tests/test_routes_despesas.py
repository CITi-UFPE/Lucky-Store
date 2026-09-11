"""
Tests for despesa routes:
  GET    /despesas
  POST   /despesas
  PUT    /despesas/{id}
  DELETE /despesas/{id}
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

from app.api.routes.despesas import router as despesas_router
from app.utils.errors import NotFoundException


def _fake_despesa(despesa_id=None):
    from unittest.mock import MagicMock
    d = MagicMock()
    d.id = despesa_id or uuid.uuid4()
    d.tipo = "PREVISAO"
    d.servico = "Aluguel"
    d.destino = "Imobiliária X"
    d.valor_previsto = Decimal("4500.00")
    d.data_prevista = date(2026, 6, 1)
    d.status = "Não Pago"
    d.valor_pago = None
    d.data_pagamento = None
    d.metodo_pagamento = None
    d.parcelas = None
    d.plano_parcelas = None
    d.observacoes = None
    # Campos de recorrencia. Precisam estar aqui explicitamente: num MagicMock
    # todo atributo nao declarado devolve outro MagicMock, e a validacao da
    # resposta rejeita isso — sete testes desta suite quebraram de uma vez
    # quando DespesaOut ganhou os campos. Uma despesa comum nao e recorrente.
    d.recorrente = False
    d.recorrencia_id = None
    d.competencia = None
    d.created_by = uuid.uuid4()
    d.created_at = datetime.now(timezone.utc)
    d.updated_at = datetime.now(timezone.utc)
    return d


_CREATE_PAYLOAD = {
    "tipo": "PREVISAO",
    "servico": "Aluguel",
    "destino": "Imobiliária X",
    "valor_previsto": "4500.00",
    "data_prevista": "2026-06-01",
    "status": "Não Pago",
}

_PAGO_PAYLOAD = {
    "tipo": "PAGO",
    "servico": "Energia Elétrica",
    "destino": "Enel",
    "valor_pago": "820.00",
    "data_pagamento": "2026-05-12",
    "metodo_pagamento": "Boleto",
}


# ── GET /despesas ─────────────────────────────────────────────────────────────

class TestListDespesas:

    def test_returns_200_with_empty_list(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        with patch("app.api.routes.despesas.DespesaService.list", return_value=[]):
            resp = client.get("/despesas")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_list_of_despesas(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        fake = _fake_despesa()
        with patch("app.api.routes.despesas.DespesaService.list", return_value=[fake]):
            resp = client.get("/despesas")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["servico"] == "Aluguel"
        assert data[0]["tipo"] == "PREVISAO"


# ── POST /despesas ────────────────────────────────────────────────────────────

class TestCreateDespesa:

    def test_returns_201_on_success(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        with patch("app.api.routes.despesas.DespesaService.create", return_value=_fake_despesa()):
            resp = client.post("/despesas", json=_CREATE_PAYLOAD)
        assert resp.status_code == 201

    def test_response_contains_servico(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        with patch("app.api.routes.despesas.DespesaService.create", return_value=_fake_despesa()):
            resp = client.post("/despesas", json=_CREATE_PAYLOAD)
        assert resp.json()["servico"] == "Aluguel"

    def test_returns_201_for_pago_type(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        fake = _fake_despesa()
        fake.tipo = "PAGO"
        fake.servico = "Energia Elétrica"
        fake.valor_pago = Decimal("820.00")
        with patch("app.api.routes.despesas.DespesaService.create", return_value=fake):
            resp = client.post("/despesas", json=_PAGO_PAYLOAD)
        assert resp.status_code == 201

    def test_create_payload_requires_tipo_and_servico(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        resp = client.post("/despesas", json={"destino": "X"})
        assert resp.status_code == 422

    def test_credit_card_with_installment_plan(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        fake = _fake_despesa()
        fake.tipo = "PAGO"
        fake.metodo_pagamento = "Credit Card"
        fake.parcelas = 2
        fake.plano_parcelas = [
            {"date": "2026-06-01", "value": "410.00"},
            {"date": "2026-07-01", "value": "410.00"},
        ]
        payload = {**_PAGO_PAYLOAD, "metodo_pagamento": "Credit Card", "parcelas": 2,
                   "plano_parcelas": [{"date": "2026-06-01", "value": "410.00"},
                                      {"date": "2026-07-01", "value": "410.00"}]}
        with patch("app.api.routes.despesas.DespesaService.create", return_value=fake):
            resp = client.post("/despesas", json=payload)
        assert resp.status_code == 201


# ── PUT /despesas/{id} ────────────────────────────────────────────────────────

class TestUpdateDespesa:

    def test_returns_200_on_success(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        despesa_id = uuid.uuid4()
        with patch("app.api.routes.despesas.DespesaService.update", return_value=_fake_despesa(despesa_id)):
            resp = client.put(f"/despesas/{despesa_id}", json={"status": "Pago"})
        assert resp.status_code == 200

    def test_returns_404_when_not_found(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        despesa_id = uuid.uuid4()
        with patch("app.api.routes.despesas.DespesaService.update",
                   side_effect=NotFoundException("Despesa não encontrada")):
            resp = client.put(f"/despesas/{despesa_id}", json={"status": "Pago"})
        assert resp.status_code == 404

    def test_partial_update_only_sends_provided_fields(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        despesa_id = uuid.uuid4()
        mock_update = patch("app.api.routes.despesas.DespesaService.update",
                            return_value=_fake_despesa(despesa_id))
        with mock_update as m:
            client.put(f"/despesas/{despesa_id}", json={"valor_pago": "820.00"})
        call_data = m.call_args[0][2]  # DespesaUpdate arg
        assert call_data.valor_pago == Decimal("820.00")
        assert call_data.servico is None


# ── DELETE /despesas/{id} ─────────────────────────────────────────────────────

class TestDeleteDespesa:

    def test_returns_204_on_success(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        despesa_id = uuid.uuid4()
        with patch("app.api.routes.despesas.DespesaService.delete", return_value=None):
            resp = client.delete(f"/despesas/{despesa_id}")
        assert resp.status_code == 204

    def test_returns_404_when_not_found(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        despesa_id = uuid.uuid4()
        with patch("app.api.routes.despesas.DespesaService.delete",
                   side_effect=NotFoundException("Despesa não encontrada")):
            resp = client.delete(f"/despesas/{despesa_id}")
        assert resp.status_code == 404

    def test_calls_service_with_correct_id(self, make_test_client, mock_db):
        client = make_test_client(despesas_router)
        despesa_id = uuid.uuid4()
        with patch("app.api.routes.despesas.DespesaService.delete") as mock_del:
            client.delete(f"/despesas/{despesa_id}")
        called_id = mock_del.call_args[0][1]
        assert called_id == despesa_id
