from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.models import Pedido, CustoPedido, Frete
from app.models.despesa import Despesa
from app.services.dashboard import get_kpis, get_daily_series
from tests.test_atomic_saves_postgres import records


def setup_costs(records):
    db, user, _, order_id, _, _, freight_id, _, _ = records
    order = db.get(Pedido, order_id)
    order.valor_venda = Decimal('7464.50')
    order.custo.custo_produto_final = 840
    order.custo.custo_servico = None
    order.custo.custo_boleto = Decimal('5.40')
    order.custo.imposto_compra = 20
    order.custo.imposto_venda = 30
    order.custo.custo_credito = 10
    order.custo.custo_debito = 5
    order.custo.brinde = 15
    # Estimates and percentages must never be added to the money amounts.
    order.custo.custo_produto_inicial = 9999
    order.custo.pct_imposto_compra = 15
    db.get(Frete, freight_id).valor = 135
    db.commit()
    return db, user, order


def test_total_equals_components_and_profit_uses_full_cost(records):
    db, _, _ = setup_costs(records)
    result = get_kpis(db, data_inicio=date.today(), data_fim=date.today())
    assert result.custo_produtos == 840
    assert result.custo_adicionais == 85.4
    assert result.custo_frete == 135
    assert result.custo == 1060.4
    assert result.custo == result.custo_produtos + result.custo_adicionais + result.custo_frete
    assert result.lucro == 6404.1
    assert result.ticket_custo == 1060.4


def test_fixed_expenses_are_separate_and_services_count_once(records):
    db, user, order = setup_costs(records)
    order.custo.custo_servico = 50
    db.add(Despesa(id=uuid4(), tipo='PAGO', servico='Aluguel', valor_pago=200,
                   data_pagamento=date.today(), created_by=user))
    db.commit()
    result = get_kpis(db, data_inicio=date.today(), data_fim=date.today())
    assert result.custo_adicionais == 135.4
    assert result.custo == 1110.4
    assert result.outros_custos == 200
    assert result.lucro == 6354.1


def test_multiple_freights_do_not_multiply_product_costs_and_daily_total_matches(records):
    db, _, order = setup_costs(records)
    db.add(Frete(id=uuid4(), id_pedido=order.id, valor=25, data_frete=date.today(),
                 created_at=date(2025, 1, 1)))
    db.commit()
    result = get_kpis(db, data_inicio=date.today(), data_fim=date.today())
    daily = get_daily_series(db, data_inicio=date.today(), data_fim=date.today())
    assert result.custo_produtos == 840
    assert result.custo_frete == 160
    assert result.custo == 1085.4
    assert daily.items[0].custo == result.custo
    assert daily.items[0].lucro == result.lucro


def test_empty_period_returns_zero_components(records):
    db, *_ = records
    result = get_kpis(db, data_inicio=date(2000, 1, 1), data_fim=date(2000, 1, 31))
    assert result.custo_produtos == result.custo_adicionais == result.custo_frete == result.custo == 0
