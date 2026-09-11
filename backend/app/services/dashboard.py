from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func, case, or_, and_
from sqlalchemy.orm import Session

from app.models.pedido import Pedido, CustoPedido, Frete, PEDIDO_ATIVO, PEDIDO_CANCELADO
from app.models.produto import Produto
from app.models.cotacao import Cotacao
from app.models.despesa import Despesa
from app.models.rma import Rma
from app.models.item_rma import ItemRma
from app.models.loja import Loja
from app.models.vendedor import Vendedor
from app.models.dashboard_goal import DashboardGoal
from app.models.meta_vendedor import MetaVendedor
from app.schemas.dashboard import (
    DashboardKpisResponse,
    BreakdownByCompanyResponse,
    BreakdownBySellerResponse,
    BreakdownItem,
    BreakdownBySellerItem,
    GoalCreate,
    GoalResponse,
    GoalsListResponse,
    VendorGoalCreate,
    VendorGoalResponse,
    VendorGoalsListResponse,
    DailySeriesItem,
    DailySeriesResponse,
    ProjectionsResponse,
    CardSpendItem,
    CardSpendResponse,
    DashboardCountsResponse,
)
from app.utils.errors import NotFoundException


# ─── Feriados Nacionais Brasileiros ───────────────────────────────────────────

_FERIADOS: set[date] = {
    # 2025
    date(2025, 1, 1), date(2025, 3, 3), date(2025, 3, 4),
    date(2025, 4, 18), date(2025, 4, 21), date(2025, 5, 1),
    date(2025, 6, 19), date(2025, 9, 7), date(2025, 10, 12),
    date(2025, 11, 2), date(2025, 11, 15), date(2025, 11, 20),
    date(2025, 12, 25),
    # 2026
    date(2026, 1, 1), date(2026, 2, 16), date(2026, 2, 17),
    date(2026, 4, 3), date(2026, 4, 21), date(2026, 5, 1),
    date(2026, 5, 14), date(2026, 9, 7), date(2026, 10, 12),
    date(2026, 11, 2), date(2026, 11, 15), date(2026, 11, 20),
    date(2026, 12, 25),
    # 2027
    date(2027, 1, 1), date(2027, 2, 8), date(2027, 2, 9),
    date(2027, 3, 26), date(2027, 4, 21), date(2027, 5, 1),
    date(2027, 6, 3), date(2027, 9, 7), date(2027, 10, 12),
    date(2027, 11, 2), date(2027, 11, 15), date(2027, 11, 20),
    date(2027, 12, 25),
}


def _is_working_day(d: date) -> bool:
    return d.weekday() < 5 and d not in _FERIADOS


def _count_working_days(start: date, end: date) -> int:
    if start > end:
        return 0
    total = 0
    current = start
    while current <= end:
        if _is_working_day(current):
            total += 1
        current += timedelta(days=1)
    return total


# ─── Período helpers ──────────────────────────────────────────────────────────

def _resolve_period(
    mes: Optional[int],
    ano: Optional[int],
    data_inicio: Optional[date],
    data_fim: Optional[date],
) -> tuple[date, date]:
    if data_inicio and data_fim:
        return data_inicio, data_fim
    today = date.today()
    m = mes or today.month
    y = ano or today.year
    inicio = date(y, m, 1)
    if m == 12:
        fim = date(y, 12, 31)
    else:
        fim = date(y, m + 1, 1) - timedelta(days=1)
    return inicio, fim


# ─── Agregação principal ──────────────────────────────────────────────────────

def _custos_adicionais_sql():
    # Monetary amounts only: percentages and the initial estimate are not costs.
    return sum(func.coalesce(column, 0) for column in (
        CustoPedido.custo_servico, CustoPedido.imposto_compra,
        CustoPedido.imposto_venda, CustoPedido.custo_credito,
        CustoPedido.custo_debito, CustoPedido.custo_boleto, CustoPedido.brinde,
    ))


def _custos_pedido_sql():
    return func.coalesce(CustoPedido.custo_produto_final, 0) + _custos_adicionais_sql()


def _aggregate(
    db: Session,
    inicio: date,
    fim: date,
    id_loja: Optional[UUID],
    include_cancelled: bool = False,
):
    """Retorna Row com somas de receita, custo e impostos."""
    q = (
        db.query(
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, Pedido.valor_venda), else_=0)
            ), 0).label("receita"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, CustoPedido.custo_produto_final), else_=0)
            ), 0).label("custo_produto"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, CustoPedido.custo_servico), else_=0)
            ), 0).label("custo_servico"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, CustoPedido.imposto_compra), else_=0)
            ), 0).label("imposto_compra"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, CustoPedido.imposto_venda), else_=0)
            ), 0).label("imposto_venda"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, _custos_adicionais_sql()), else_=0)
            ), 0).label("custo_adicionais"),
            func.count(case((PEDIDO_ATIVO, 1))).label("num_pedidos"),
            func.count(case((PEDIDO_CANCELADO, 1))).label("num_cancelamentos"),
            func.coalesce(func.sum(
                case((PEDIDO_CANCELADO, Pedido.valor_venda), else_=0)
            ), 0).label("valor_cancelamentos"),
        )
        .outerjoin(CustoPedido, CustoPedido.id_pedido == Pedido.id)
        .filter(
            Pedido.deleted_at.is_(None),
            Pedido.is_rma.isnot(True),
            Pedido.data_pedido >= inicio,
            Pedido.data_pedido <= fim,
        )
    )
    if id_loja:
        q = q.filter(Pedido.id_loja == id_loja)
    return q.first()


# ─── KPIs ─────────────────────────────────────────────────────────────────────

def get_kpis(
    db: Session,
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    id_loja: Optional[UUID] = None,
) -> DashboardKpisResponse:
    inicio, fim = _resolve_period(mes, ano, data_inicio, data_fim)
    row = _aggregate(db, inicio, fim, id_loja)

    receita_bruta = Decimal(str(row.receita or 0))
    custo_produto = Decimal(str(row.custo_produto or 0))
    imposto_compra = Decimal(str(row.imposto_compra or 0))
    imposto_venda = Decimal(str(row.imposto_venda or 0))
    custo_adicionais = Decimal(str(row.custo_adicionais or 0))
    custo = custo_produto + custo_adicionais

    # Estornos (devoluções de RMA) abatem o faturamento no período — por data do estorno
    # (fallback: data de registro do RMA quando o estorno não tem data preenchida)
    estornos_q = (
        db.query(func.coalesce(func.sum(ItemRma.valor_estornado), 0))
        .join(Rma, ItemRma.id_rma == Rma.id)
        .filter(
            Rma.deleted_at.is_(None),
            func.coalesce(ItemRma.data_estorno, Rma.data_registro) >= inicio,
            func.coalesce(ItemRma.data_estorno, Rma.data_registro) <= fim,
        )
    )
    if id_loja:
        estornos_q = estornos_q.filter(Rma.id_loja == id_loja)
    estornos = Decimal(str(estornos_q.scalar() or 0))

    receita = receita_bruta - estornos
    gastos_fixos_q = (
        db.query(func.coalesce(func.sum(
            case(
                (Despesa.tipo == "PAGO", Despesa.valor_pago),
                else_=Despesa.valor_previsto,
            )
        ), 0))
        .filter(
            Despesa.deleted_at.is_(None),
            or_(
                and_(Despesa.tipo == "PAGO",
                     Despesa.data_pagamento >= inicio,
                     Despesa.data_pagamento <= fim),
                and_(Despesa.tipo == "PREVISAO",
                     Despesa.data_prevista >= inicio,
                     Despesa.data_prevista <= fim),
            ),
        )
    )
    outros_custos = Decimal(str(gastos_fixos_q.scalar() or 0))

    frete_q = (
        db.query(func.coalesce(func.sum(Frete.valor), 0))
        .filter(
            Frete.data_frete >= inicio,
            Frete.data_frete <= fim,
        )
    )
    if id_loja:
        frete_q = (
            frete_q.join(Pedido, Pedido.id == Frete.id_pedido)
            .filter(Pedido.id_loja == id_loja)
        )
    custo_frete = Decimal(str(frete_q.scalar() or 0))
    custo += custo_frete
    lucro = receita - custo
    margem = (lucro / receita).quantize(Decimal("0.0001")) if receita > 0 else Decimal("0")

    num_pedidos = row.num_pedidos or 0

    # Receita de hoje
    today = date.today()
    today_q = (
        db.query(func.coalesce(func.sum(Pedido.valor_venda), 0))
        .filter(
            Pedido.deleted_at.is_(None),
            Pedido.is_rma.isnot(True),
            PEDIDO_ATIVO,
            Pedido.data_pedido == today,
        )
    )
    if id_loja:
        today_q = today_q.filter(Pedido.id_loja == id_loja)
    receita_hoje = Decimal(str(today_q.scalar() or 0))

    return DashboardKpisResponse(
        periodo_inicio=inicio,
        periodo_fim=fim,
        receita=receita,
        estornos=estornos,
        custo=custo,
        lucro=lucro,
        margem=margem,
        num_pedidos=num_pedidos,
        num_cancelamentos=row.num_cancelamentos or 0,
        valor_cancelamentos=Decimal(str(row.valor_cancelamentos or 0)),
        receita_hoje=receita_hoje,
        ticket_venda=(receita / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
        ticket_lucro=(lucro / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
        ticket_custo=(custo / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
        imposto_compra=imposto_compra,
        imposto_venda=imposto_venda,
        outros_custos=outros_custos,
        custo_frete=custo_frete,
        custo_produtos=custo_produto,
        custo_adicionais=custo_adicionais,
    )


# ─── Breakdowns ───────────────────────────────────────────────────────────────

def get_breakdown_by_company(
    db: Session,
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    id_loja: Optional[UUID] = None,
) -> BreakdownByCompanyResponse:
    inicio, fim = _resolve_period(mes, ano, data_inicio, data_fim)

    q = (
        db.query(
            Loja.nome.label("nome"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, Pedido.valor_venda), else_=0)
            ), 0).label("receita"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO,
                      CustoPedido.custo_produto_final + CustoPedido.custo_servico), else_=0)
            ), 0).label("custo"),
            func.count(case((PEDIDO_ATIVO, 1))).label("num_pedidos"),
            func.count(case((PEDIDO_CANCELADO, 1))).label("num_cancelamentos"),
            func.coalesce(func.sum(
                case((PEDIDO_CANCELADO, Pedido.valor_venda), else_=0)
            ), 0).label("valor_cancelamentos"),
        )
        .join(Loja, Loja.id == Pedido.id_loja)
        .outerjoin(CustoPedido, CustoPedido.id_pedido == Pedido.id)
        .filter(
            Pedido.deleted_at.is_(None),
            Pedido.is_rma.isnot(True),
            Pedido.data_pedido >= inicio,
            Pedido.data_pedido <= fim,
        )
        .group_by(Loja.id, Loja.nome)
        .order_by(func.sum(
            case((PEDIDO_ATIVO, Pedido.valor_venda), else_=0)
        ).desc())
    )
    if id_loja:
        q = q.filter(Pedido.id_loja == id_loja)

    items = []
    for row in q.all():
        receita = Decimal(str(row.receita or 0))
        custo = Decimal(str(row.custo or 0))
        lucro = receita - custo
        margem = (lucro / receita).quantize(Decimal("0.0001")) if receita > 0 else Decimal("0")
        num_pedidos = row.num_pedidos or 0
        items.append(BreakdownItem(
            nome=row.nome,
            receita=receita,
            custo=custo,
            lucro=lucro,
            margem=margem,
            num_pedidos=num_pedidos,
            num_cancelamentos=row.num_cancelamentos or 0,
            valor_cancelamentos=Decimal(str(row.valor_cancelamentos or 0)),
            ticket_venda=(receita / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
            ticket_custo=(custo / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
            ticket_lucro=(lucro / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
        ))
    return BreakdownByCompanyResponse(items=items)


def get_breakdown_by_seller(
    db: Session,
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    id_loja: Optional[UUID] = None,
) -> BreakdownBySellerResponse:
    inicio, fim = _resolve_period(mes, ano, data_inicio, data_fim)

    q = (
        db.query(
            Vendedor.id.label("id_vendedor"),
            Vendedor.nome.label("nome"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO, Pedido.valor_venda), else_=0)
            ), 0).label("receita"),
            func.coalesce(func.sum(
                case((PEDIDO_ATIVO,
                      CustoPedido.custo_produto_final + CustoPedido.custo_servico), else_=0)
            ), 0).label("custo"),
            func.count(case((PEDIDO_ATIVO, 1))).label("num_pedidos"),
            func.count(case((PEDIDO_CANCELADO, 1))).label("num_cancelamentos"),
            func.coalesce(func.sum(
                case((PEDIDO_CANCELADO, Pedido.valor_venda), else_=0)
            ), 0).label("valor_cancelamentos"),
        )
        .join(Vendedor, Vendedor.id == Pedido.id_vendedor)
        .outerjoin(CustoPedido, CustoPedido.id_pedido == Pedido.id)
        .filter(
            Pedido.deleted_at.is_(None),
            Pedido.is_rma.isnot(True),
            Pedido.data_pedido >= inicio,
            Pedido.data_pedido <= fim,
        )
        .group_by(Vendedor.id, Vendedor.nome)
        .order_by(func.sum(
            case((PEDIDO_ATIVO, Pedido.valor_venda), else_=0)
        ).desc())
    )
    if id_loja:
        q = q.filter(Pedido.id_loja == id_loja)

    items = []
    for row in q.all():
        receita = Decimal(str(row.receita or 0))
        custo = Decimal(str(row.custo or 0))
        lucro = receita - custo
        margem = (lucro / receita).quantize(Decimal("0.0001")) if receita > 0 else Decimal("0")
        num_pedidos = row.num_pedidos or 0
        items.append(BreakdownBySellerItem(
            id_vendedor=row.id_vendedor,
            nome=row.nome,
            receita=receita,
            custo=custo,
            lucro=lucro,
            margem=margem,
            num_pedidos=num_pedidos,
            num_cancelamentos=row.num_cancelamentos or 0,
            valor_cancelamentos=Decimal(str(row.valor_cancelamentos or 0)),
            ticket_venda=(receita / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
            ticket_custo=(custo / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
            ticket_lucro=(lucro / num_pedidos).quantize(Decimal("0.01")) if num_pedidos else Decimal("0"),
        ))
    return BreakdownBySellerResponse(items=items)


# ─── Goals ────────────────────────────────────────────────────────────────────

def _goal_to_response(goal: DashboardGoal, nome_loja: Optional[str] = None) -> GoalResponse:
    return GoalResponse(
        id=goal.id,
        ano=goal.ano,
        mes=goal.mes,
        id_loja=goal.id_loja,
        nome_loja=nome_loja,
        tipo=goal.tipo,
        target=goal.target,
        floor=goal.floor,
    )


def list_goals(
    db: Session,
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    id_loja: Optional[UUID] = None,
) -> GoalsListResponse:
    q = db.query(DashboardGoal, Loja.nome).join(Loja, Loja.id == DashboardGoal.id_loja)
    if ano:
        q = q.filter(DashboardGoal.ano == ano)
    if mes:
        q = q.filter(DashboardGoal.mes == mes)
    if id_loja:
        q = q.filter(DashboardGoal.id_loja == id_loja)
    q = q.order_by(DashboardGoal.ano.desc(), DashboardGoal.mes.desc())

    return GoalsListResponse(items=[_goal_to_response(g, nome) for g, nome in q.all()])


def upsert_goal(db: Session, data: GoalCreate) -> GoalResponse:
    existing = db.query(DashboardGoal).filter(
        DashboardGoal.ano == data.ano,
        DashboardGoal.mes == data.mes,
        DashboardGoal.id_loja == data.id_loja,
        DashboardGoal.tipo == data.tipo,
    ).first()

    if existing:
        existing.target = data.target
        existing.floor = data.floor
        db.commit()
        db.refresh(existing)
        goal = existing
    else:
        goal = DashboardGoal(
            ano=data.ano,
            mes=data.mes,
            id_loja=data.id_loja,
            tipo=data.tipo,
            target=data.target,
            floor=data.floor,
        )
        db.add(goal)
        db.commit()
        db.refresh(goal)

    loja = db.query(Loja).filter(Loja.id == goal.id_loja).first()
    return _goal_to_response(goal, loja.nome if loja else None)


def delete_goal(db: Session, goal_id: UUID) -> None:
    goal = db.query(DashboardGoal).filter(DashboardGoal.id == goal_id).first()
    if not goal:
        raise NotFoundException(f"Meta {goal_id} não encontrada")
    db.delete(goal)
    db.commit()


# ─── Vendor Goals ─────────────────────────────────────────────────────────────

def _vendor_goal_to_response(meta: MetaVendedor, nome_vendedor: Optional[str] = None) -> VendorGoalResponse:
    return VendorGoalResponse(
        id=meta.id,
        ano=meta.ano_mes.year,
        mes=meta.ano_mes.month,
        id_vendedor=meta.id_vendedor,
        nome_vendedor=nome_vendedor,
        tipo=meta.tipo,
        target=meta.alvo_individual or Decimal(0),
        floor=meta.piso,
    )


def list_vendor_goals(
    db: Session,
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    id_vendedor: Optional[UUID] = None,
) -> VendorGoalsListResponse:
    q = db.query(MetaVendedor, Vendedor.nome).join(Vendedor, Vendedor.id == MetaVendedor.id_vendedor)
    if ano and mes:
        q = q.filter(MetaVendedor.ano_mes == date(ano, mes, 1))
    elif ano:
        q = q.filter(func.extract('year', MetaVendedor.ano_mes) == ano)
    elif mes:
        q = q.filter(func.extract('month', MetaVendedor.ano_mes) == mes)
    if id_vendedor:
        q = q.filter(MetaVendedor.id_vendedor == id_vendedor)
    q = q.order_by(MetaVendedor.ano_mes.desc())
    return VendorGoalsListResponse(items=[_vendor_goal_to_response(m, nome) for m, nome in q.all()])


def upsert_vendor_goal(db: Session, data: VendorGoalCreate) -> VendorGoalResponse:
    ano_mes = date(data.ano, data.mes, 1)
    existing = db.query(MetaVendedor).filter(
        MetaVendedor.id_vendedor == data.id_vendedor,
        MetaVendedor.ano_mes == ano_mes,
        MetaVendedor.tipo == data.tipo,
    ).first()

    if existing:
        existing.alvo_individual = data.target
        existing.piso = data.floor
        db.commit()
        db.refresh(existing)
        meta = existing
    else:
        meta = MetaVendedor(
            id_vendedor=data.id_vendedor,
            ano_mes=ano_mes,
            tipo=data.tipo,
            alvo_individual=data.target,
            piso=data.floor,
        )
        db.add(meta)
        db.commit()
        db.refresh(meta)

    vendedor = db.query(Vendedor).filter(Vendedor.id == meta.id_vendedor).first()
    return _vendor_goal_to_response(meta, vendedor.nome if vendedor else None)


def delete_vendor_goal(db: Session, goal_id: UUID) -> None:
    meta = db.query(MetaVendedor).filter(MetaVendedor.id == goal_id).first()
    if not meta:
        raise NotFoundException(f"Meta de vendedor {goal_id} não encontrada")
    db.delete(meta)
    db.commit()


# ─── Daily Series ─────────────────────────────────────────────────────────────

def get_daily_series(
    db: Session,
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    id_loja: Optional[UUID] = None,
) -> DailySeriesResponse:
    inicio, fim = _resolve_period(mes, ano, data_inicio, data_fim)

    def _query_daily(start: date, end: date):
        q = (
            db.query(
                Pedido.data_pedido.label("data"),
                func.coalesce(func.sum(
                    case((PEDIDO_ATIVO, Pedido.valor_venda), else_=0)
                ), 0).label("receita"),
                func.coalesce(func.sum(
                    case((PEDIDO_ATIVO,
                          _custos_pedido_sql()), else_=0)
                ), 0).label("custo"),
                func.coalesce(func.sum(
                    case((PEDIDO_ATIVO,
                          func.coalesce(Pedido.multa, 0) + func.coalesce(Pedido.juros, 0)), else_=0)
                ), 0).label("ganhos"),
            )
            .outerjoin(CustoPedido, CustoPedido.id_pedido == Pedido.id)
            .filter(
                Pedido.deleted_at.is_(None),
                Pedido.is_rma.isnot(True),
                Pedido.data_pedido >= start,
                Pedido.data_pedido <= end,
            )
            .group_by(Pedido.data_pedido)
            .order_by(Pedido.data_pedido)
        )
        if id_loja:
            q = q.filter(Pedido.id_loja == id_loja)
        return {row.data: row for row in q.all()}

    current_rows = _query_daily(inicio, fim)

    # Gastos fixos (despesas) por dia: PAGO → data_pagamento, PREVISAO → data_prevista
    despesas = (
        db.query(Despesa)
        .filter(
            Despesa.deleted_at.is_(None),
            or_(
                and_(Despesa.tipo == "PAGO",
                     Despesa.data_pagamento >= inicio, Despesa.data_pagamento <= fim),
                and_(Despesa.tipo == "PREVISAO",
                     Despesa.data_prevista >= inicio, Despesa.data_prevista <= fim),
            ),
        )
        .all()
    )
    gastos_by_day: dict[date, Decimal] = {}
    for d in despesas:
        if d.tipo == "PAGO":
            dia, val = d.data_pagamento, d.valor_pago
        else:
            dia, val = d.data_prevista, d.valor_previsto
        if dia is None:
            continue
        gastos_by_day[dia] = gastos_by_day.get(dia, Decimal(0)) + Decimal(str(val or 0))

    # Fretes pela data efetiva, como no indicador de custo total
    frete_dia = Frete.data_frete
    frete_q = (
        db.query(
            frete_dia.label("dia"),
            func.coalesce(func.sum(Frete.valor), 0).label("total"),
        )
        .filter(frete_dia >= inicio, frete_dia <= fim)
        .group_by(frete_dia)
    )
    if id_loja:
        frete_q = (
            frete_q.join(Pedido, Pedido.id == Frete.id_pedido)
            .filter(Pedido.id_loja == id_loja)
        )
    fretes_by_day: dict[date, Decimal] = {
        row.dia: Decimal(str(row.total or 0)) for row in frete_q.all()
    }

    # Previous year: same calendar window, clamp day to avoid Feb-29 errors
    def _prev_year_date(d: date) -> date:
        try:
            return date(d.year - 1, d.month, d.day)
        except ValueError:
            return date(d.year - 1, d.month, 28)

    prev_inicio = _prev_year_date(inicio)
    prev_fim = _prev_year_date(fim)
    prev_rows = _query_daily(prev_inicio, prev_fim)
    prev_by_md: dict[tuple[int, int], Decimal] = {
        (d.month, d.day): Decimal(str(row.receita or 0))
        for d, row in prev_rows.items()
    }

    items = []
    current = inicio
    while current <= fim:
        row = current_rows.get(current)
        receita = Decimal(str(row.receita or 0)) if row else Decimal(0)
        custo = Decimal(str(row.custo or 0)) if row else Decimal(0)
        ganhos = Decimal(str(row.ganhos or 0)) if row else Decimal(0)
        gastos_fixos = gastos_by_day.get(current, Decimal(0))
        fretes = fretes_by_day.get(current, Decimal(0))
        custo += fretes
        items.append(DailySeriesItem(
            data=current.isoformat(),
            faturamento=receita,
            lucro=receita - custo,
            ano_anterior=prev_by_md.get((current.month, current.day), Decimal(0)),
            custo=custo,
            gastos_fixos=gastos_fixos,
            ganhos_financeiros=ganhos,
            fretes=fretes,
        ))
        current += timedelta(days=1)

    return DailySeriesResponse(items=items)


# ─── Projections ──────────────────────────────────────────────────────────────

def get_projections(
    db: Session,
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    id_loja: Optional[UUID] = None,
) -> ProjectionsResponse:
    inicio, fim = _resolve_period(mes, ano, data_inicio, data_fim)
    today = date.today()

    # Dias úteis decorridos: de inicio até hoje (ou fim do período, o que vier primeiro)
    ate_hoje = min(today, fim)
    dias_decorridos = _count_working_days(inicio, ate_hoje) if ate_hoje >= inicio else 0

    # Dias úteis restantes: de amanhã até o fim do período
    amanha = today + timedelta(days=1)
    dias_restantes = _count_working_days(amanha, fim) if amanha <= fim else 0

    # KPIs do período
    kpis = get_kpis(db, mes, ano, data_inicio, data_fim, id_loja)
    receita = kpis.receita
    lucro_liquido = float(kpis.lucro) - float(kpis.outros_custos)

    media_diaria = round(receita / dias_decorridos, 2) if dias_decorridos > 0 else 0.0
    projecao_mes = round(media_diaria * (dias_decorridos + dias_restantes), 2)

    # Metas do período (faturamento e lucro).
    # Sem id_loja (visualização geral de empresas), agrega as metas de TODAS as
    # empresas somando target/floor por tipo — assim os cards batem com os KPIs,
    # que também são agregados. Com id_loja, há no máximo uma meta por tipo.
    meta_target = None
    meta_floor = None
    meta_lucro_target = None
    meta_lucro_floor = None
    if not (data_inicio or data_fim):
        m = mes or today.month
        y = ano or today.year
        q = db.query(DashboardGoal).filter(DashboardGoal.ano == y, DashboardGoal.mes == m)
        if id_loja:
            q = q.filter(DashboardGoal.id_loja == id_loja)
        for g in q.all():
            if g.tipo == "lucro":
                meta_lucro_target = (meta_lucro_target or 0.0) + float(g.target)
                if g.floor:
                    meta_lucro_floor = (meta_lucro_floor or 0.0) + float(g.floor)
            else:
                meta_target = (meta_target or 0.0) + float(g.target)
                if g.floor:
                    meta_floor = (meta_floor or 0.0) + float(g.floor)

    gap_target = max(meta_target - receita, 0.0) if meta_target is not None else None
    gap_floor  = max(meta_floor  - receita, 0.0) if meta_floor  is not None else None
    pct_meta   = round(receita / meta_target, 4)  if meta_target else None

    meta_diaria_dinamica = None
    if gap_floor is not None and dias_restantes > 0:
        meta_diaria_dinamica = round(gap_floor / dias_restantes, 2)

    # Projeções de lucro líquido (metas de lucro já agregadas acima)
    gap_lucro_target = max(meta_lucro_target - lucro_liquido, 0.0) if meta_lucro_target is not None else None
    gap_lucro_floor  = max(meta_lucro_floor  - lucro_liquido, 0.0) if meta_lucro_floor  is not None else None
    pct_meta_lucro   = round(lucro_liquido / meta_lucro_target, 4)  if meta_lucro_target else None

    meta_lucro_diaria_dinamica = None
    if gap_lucro_floor is not None and dias_restantes > 0:
        meta_lucro_diaria_dinamica = round(gap_lucro_floor / dias_restantes, 2)

    return ProjectionsResponse(
        periodo_inicio=inicio,
        periodo_fim=fim,
        dias_uteis_decorridos=dias_decorridos,
        dias_uteis_restantes=dias_restantes,
        media_diaria=media_diaria,
        projecao_mes=projecao_mes,
        meta_target=meta_target,
        meta_floor=meta_floor,
        gap_target=gap_target,
        gap_floor=gap_floor,
        meta_diaria_dinamica=meta_diaria_dinamica,
        pct_meta=pct_meta,
        meta_lucro_target=meta_lucro_target,
        meta_lucro_floor=meta_lucro_floor,
        gap_lucro_target=gap_lucro_target,
        gap_lucro_floor=gap_lucro_floor,
        pct_meta_lucro=pct_meta_lucro,
        meta_lucro_diaria_dinamica=meta_lucro_diaria_dinamica,
    )


# ─── Card spend ───────────────────────────────────────────────────────────────

def get_card_spend(
    db: Session,
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    id_loja: Optional[UUID] = None,
) -> CardSpendResponse:
    """Soma o valor gasto (purchaseValue das sub-compras) agrupado por cartão.

    Agrega TODOS os cartões cadastrados (sem filtro de período), opcionalmente
    restrito por loja.
    """
    q = (
        db.query(Produto.sub_compras)
        .join(Pedido, Pedido.id == Produto.id_pedido)
        .filter(
            Pedido.deleted_at.is_(None),
            Pedido.is_rma.isnot(True),
            PEDIDO_ATIVO,
            Produto.sub_compras.isnot(None),
        )
    )
    if id_loja:
        q = q.filter(Pedido.id_loja == id_loja)

    totals: dict[str, float] = {}
    for (sub_compras,) in q.all():
        if not sub_compras:
            continue
        for sc in sub_compras:
            if not isinstance(sc, dict):
                continue
            card = (sc.get("card") or "").strip()
            if not card:
                continue
            try:
                valor = float(sc.get("purchaseValue") or 0)
            except (TypeError, ValueError):
                valor = 0.0
            totals[card] = totals.get(card, 0.0) + valor

    items = [
        CardSpendItem(card=card, total=round(total, 2))
        for card, total in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return CardSpendResponse(items=items)


# ─── Contagens operacionais ────────────────────────────────────────────────────

# Status terminais por entidade (usados para separar "em aberto" de "entregue")
_PEDIDO_ENTREGUE = "Delivered"
_RMA_ENTREGUE = ("Delivered", "Completed")
_RMA_FORA_DE_ABERTO = ("Delivered", "Completed", "Cancelled")


def get_counts(
    db: Session,
    mes: Optional[int] = None,
    ano: Optional[int] = None,
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    id_loja: Optional[UUID] = None,
) -> DashboardCountsResponse:
    """Contagens de estado atual (snapshot) para o dashboard de Vendas.

    São métricas de "quantos estão em cada estado agora" — por isso NÃO são
    filtradas por período; apenas, opcionalmente, por loja (id_loja).
    """
    # ── Pedidos ──
    ped_base = db.query(func.count(Pedido.id)).filter(
        Pedido.deleted_at.is_(None),
        Pedido.is_rma.isnot(True),
    )
    if id_loja:
        ped_base = ped_base.filter(Pedido.id_loja == id_loja)

    pedidos_abertos = ped_base.filter(
        PEDIDO_ATIVO,
        Pedido.status != _PEDIDO_ENTREGUE,
    ).scalar() or 0
    pedidos_entregues = ped_base.filter(
        Pedido.status == _PEDIDO_ENTREGUE,
    ).scalar() or 0

    # ── Cotações ──
    cot_base = db.query(func.count(Cotacao.id)).filter(Cotacao.deleted_at.is_(None))
    if id_loja:
        cot_base = cot_base.filter(Cotacao.id_loja == id_loja)

    cotacoes_abertas = cot_base.filter(
        Cotacao.status_fechada.isnot(True),
        Cotacao.status_caida.isnot(True),
    ).scalar() or 0
    cotacoes_fechadas = cot_base.filter(
        Cotacao.status_fechada.is_(True),
    ).scalar() or 0

    # ── RMAs ──
    rma_base = db.query(func.count(Rma.id)).filter(Rma.deleted_at.is_(None))
    if id_loja:
        rma_base = rma_base.filter(Rma.id_loja == id_loja)

    rmas_abertos = rma_base.filter(
        Rma.status.notin_(_RMA_FORA_DE_ABERTO),
    ).scalar() or 0
    rmas_entregues = rma_base.filter(
        Rma.status.in_(_RMA_ENTREGUE),
    ).scalar() or 0

    # ── Produtos para comprar (status "To Buy") ──
    prod_q = (
        db.query(func.count(Produto.id))
        .join(Pedido, Pedido.id == Produto.id_pedido)
        .filter(
            Pedido.deleted_at.is_(None),
            PEDIDO_ATIVO,
            Produto.status == "To Buy",
        )
    )
    if id_loja:
        prod_q = prod_q.filter(Pedido.id_loja == id_loja)
    produtos_para_comprar = prod_q.scalar() or 0

    return DashboardCountsResponse(
        pedidos_abertos=pedidos_abertos,
        pedidos_entregues=pedidos_entregues,
        cotacoes_abertas=cotacoes_abertas,
        cotacoes_fechadas=cotacoes_fechadas,
        rmas_abertos=rmas_abertos,
        rmas_entregues=rmas_entregues,
        produtos_para_comprar=produtos_para_comprar,
    )
