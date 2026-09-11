import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PaymentMethod, Order, PaymentInstallment } from './OrderStore';

export type ExpenseKind = 'PREVISAO' | 'PAGO';
export type ExpenseStatus = 'Não Pago' | 'Pago';

export interface InstallmentPlan {
  /** ISO yyyy-mm-dd date for this installment */
  date: string;
  /** Monetary value in BRL */
  value: number;
}

export interface Expense {
  id: string;
  kind: ExpenseKind;
  service: string;
  destination: string;
  predictedValue?: number;
  predictedDate?: string;
  status?: ExpenseStatus;
  paidValue?: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethod | '';
  installments?: number;
  installmentPlan?: InstallmentPlan[];
  observations?: string;
  /**
   * Custo fixo se repete todo mês. Marcando isto ao CRIAR, o backend passa a
   * gerar uma despesa por mês a partir desta — despesas de verdade, uma por
   * mês, para que março possa estar pago e abril não.
   *
   * Só vale na criação: parar de repetir também decide o que fazer com os meses
   * futuros já lançados, e por isso tem ação própria em vez de ser um campo
   * que se desmarca sem querer.
   */
  recurring?: boolean;
  /** Agrupa as ocorrências da mesma recorrência. Vem do backend. */
  recurrenceId?: string;
  /** Mês a que esta ocorrência se refere (dia 1). Vem do backend. */
  competence?: string;
}

export function expenseSavings(e: Expense): number {
  if (e.kind !== 'PREVISAO') return 0;
  const previsto = e.predictedValue || 0;
  const pago = e.status === 'Pago' ? (e.paidValue ?? previsto) : previsto;
  return previsto - pago;
}

/** Calendar entry rendered on the Financial Manager calendar */
export interface CalendarEntry {
  id: string;
  date: string;
  value: number;
  type: 'MULTA' | 'JUROS' | 'PREVISAO' | 'PAGO' | 'ORDER' | 'FRETE' | 'ESTORNO';
  title: string;
  refId: string;
  refKind: 'expense' | 'order' | 'order-penalty' | 'order-interest' | 'order-frete' | 'rma-estorno';
  /** Optional sub-index for installments */
  subIndex?: number;
}

export function expandExpense(e: Expense): CalendarEntry[] {
  const isPaid = e.kind === 'PAGO' || e.status === 'Pago';

  if (isPaid && e.paymentMethod === 'Credit Card' && e.installmentPlan && e.installmentPlan.length > 0) {
    return e.installmentPlan
      .filter(p => p.date)
      .map((p, i) => ({
        id: `${e.id}-i${i}`,
        date: p.date,
        value: p.value,
        type: 'PAGO',
        title: e.service || 'Despesa',
        refId: e.id,
        refKind: 'expense',
        subIndex: i,
      }));
  }

  if (isPaid) {
    const date = e.paymentDate;
    if (!date) return [];
    return [{
      id: e.id,
      date,
      value: e.paidValue ?? e.predictedValue ?? 0,
      type: 'PAGO',
      title: e.service || 'Despesa',
      refId: e.id,
      refKind: 'expense',
    }];
  }

  const date = e.predictedDate;
  if (!date) return [];
  return [{
    id: e.id,
    date,
    value: e.predictedValue || 0,
    type: 'PREVISAO',
    title: e.service || 'Despesa',
    refId: e.id,
    refKind: 'expense',
  }];
}

/** Pedido parcelado no cartão pela seção Informações Gerais (valor do pedido). */
export function isCreditOrder(o: Order): boolean {
  return (o.paymentMethods || []).includes('Credit Card');
}

/**
 * Derive Multa (penalty) and Juros (interest) calendar entries from an Order's
 * Pagamento section (Financeiro).
 * - Forma de pagamento efetiva = Cartão de Crédito, com plano de parcelas de
 *   multa/juros → multa e juros divididos proporcionalmente ao peso de cada
 *   parcela, lançados na data de cada parcela.
 * - Caso contrário → uma única entrada de multa e/ou juros na data de pagamento.
 */
export function expandOrderFinancial(o: Order): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  const payDate = o.paymentDate || o.deliveryDate;
  const multa = o.penaltyValue || 0;
  const juros = o.interestValue || 0;
  const plan = o.paymentInstallmentPlan || [];   // Set B — parcelas de multa/juros
  const creditWithPlan = o.paymentMethod === 'Credit Card' && plan.some(p => p.date);

  if (creditWithPlan) {
    const totalPlanValue = plan.reduce((s, p) => s + (p.value || 0), 0);
    const dated = plan.filter(p => p.date);
    const share = (total: number, p: PaymentInstallment) =>
      totalPlanValue > 0 ? (p.value || 0) / totalPlanValue * total : total / dated.length;

    dated.forEach((p, i) => {
      if (multa > 0) {
        out.push({
          id: `op-${o.id}-i${i}`,
          date: p.date,
          value: +share(multa, p).toFixed(2),
          type: 'MULTA',
          title: `${o.os} (${i + 1}ª)`,
          refId: o.id,
          refKind: 'order-penalty',
          subIndex: i,
        });
      }
      if (juros > 0) {
        out.push({
          id: `oi-${o.id}-i${i}`,
          date: p.date,
          value: +share(juros, p).toFixed(2),
          type: 'JUROS',
          title: `${o.os} (${i + 1}ª)`,
          refId: o.id,
          refKind: 'order-interest',
          subIndex: i,
        });
      }
    });
    return out;
  }

  // Não-crédito (ou sem plano): entradas únicas na data de pagamento.
  if (multa > 0 && payDate) {
    out.push({
      id: `op-${o.id}`,
      date: payDate,
      value: multa,
      type: 'MULTA',
      title: `${o.os}`,
      refId: o.id,
      refKind: 'order-penalty',
    });
  }
  if (juros > 0 && payDate) {
    out.push({
      id: `oi-${o.id}`,
      date: payDate,
      value: juros,
      type: 'JUROS',
      title: `${o.os}`,
      refId: o.id,
      refKind: 'order-interest',
    });
  }

  return out;
}

/**
 * Deriva entradas de ESTORNO (saída/despesa) a partir dos itens devolvidos de um RMA.
 * Uma entrada por item com valor_estornado > 0, na data do estorno
 * (fallback: data de registro do RMA).
 */
export function expandRmaEstorno(rma: {
  id: string;
  numero_os_origem?: string | null;
  data_registro: string;
  itens?: { id: string; descricao: string; valor_estornado?: string | number | null; data_estorno?: string | null }[];
}): CalendarEntry[] {
  return (rma.itens ?? [])
    .map(it => ({ it, val: Number(it.valor_estornado) || 0 }))
    .filter(({ val }) => val > 0)
    .map(({ it, val }) => ({
      id: `est-${it.id}`,
      date: it.data_estorno || rma.data_registro,
      value: val,
      type: 'ESTORNO' as const,
      title: `Estorno ${rma.numero_os_origem || '—'} — ${it.descricao}`,
      refId: rma.id,
      refKind: 'rma-estorno' as const,
    }));
}

/** Derive FRETE calendar entries from an Order's freight cards. */
export function expandOrderFretes(o: Order): CalendarEntry[] {
  return (o.freight || [])
    .filter(f => !!f.deliveryDate)
    .map(f => ({
      id: `of-${f.id}`,
      date: f.deliveryDate!,
      value: f.value,
      type: 'FRETE' as const,
      title: f.deliveryPerson ? `Frete — ${f.deliveryPerson}` : 'Frete',
      refId: o.id,
      refKind: 'order-frete' as const,
    }));
}

interface FinanceContextType {
  expenses: Expense[];
  addExpense: (e: Expense) => void;
  endRecurrence: (id: string) => void;
  updateExpense: (e: Expense) => void;
  deleteExpense: (id: string) => void;
  /** Monthly goals (KPI configuration) */
  goals: Goal[];
  upsertGoal: (g: Goal) => void;
  deleteGoal: (key: string) => void;
}

export type GoalScopeType = 'company' | 'seller';

export interface Goal {
  /** key = `${year}-${month}-${scopeType}-${scopeId}` (month 1-12) */
  key: string;
  year: number;
  month: number;
  /** 'company' = overall/per-store target; 'seller' = per-seller target */
  scopeType: GoalScopeType;
  /** For company: 'all' | 'Lucky Store' | 'BTech' | 'AJJ'. For seller: seller name. */
  scopeId: string;
  target: number;
  floor: number;
}

export function goalKey(year: number, month: number, scopeType: GoalScopeType, scopeId: string) {
  return `${year}-${month}-${scopeType}-${scopeId}`;
}

const FinanceContext = createContext<FinanceContextType | null>(null);

// ── API ↔ Expense adapters ────────────────────────────────────────────────────

interface DespesaApiItem {
  id: string; tipo: string; servico: string; destino: string;
  valor_previsto: string | null; data_prevista: string | null; status: string | null;
  valor_pago: string | null; data_pagamento: string | null; metodo_pagamento: string | null;
  parcelas: number | null; plano_parcelas: { date: string; value: string }[] | null;
  observacoes: string | null;
  recorrente?: boolean; recorrencia_id?: string | null; competencia?: string | null;
}

function fromApi(a: DespesaApiItem): Expense {
  return {
    id: a.id,
    kind: a.tipo as ExpenseKind,
    service: a.servico,
    destination: a.destino,
    predictedValue: a.valor_previsto != null ? Number(a.valor_previsto) : undefined,
    predictedDate: a.data_prevista ?? undefined,
    status: (a.status as ExpenseStatus) ?? undefined,
    paidValue: a.valor_pago != null ? Number(a.valor_pago) : undefined,
    paymentDate: a.data_pagamento ?? undefined,
    paymentMethod: (a.metodo_pagamento as PaymentMethod) ?? undefined,
    installments: a.parcelas ?? undefined,
    installmentPlan: a.plano_parcelas
      ? a.plano_parcelas.map(p => ({ date: p.date, value: Number(p.value) }))
      : undefined,
    observations: a.observacoes ?? undefined,
    recurring: a.recorrente ?? false,
    recurrenceId: a.recorrencia_id ?? undefined,
    competence: a.competencia ?? undefined,
  };
}

function toApiPayload(e: Expense) {
  return {
    tipo: e.kind,
    servico: e.service,
    destino: e.destination,
    valor_previsto: e.predictedValue ?? null,
    data_prevista: e.predictedDate ?? null,
    status: e.status ?? null,
    valor_pago: e.paidValue ?? null,
    data_pagamento: e.paymentDate ?? null,
    metodo_pagamento: e.paymentMethod ?? null,
    parcelas: e.installments ?? null,
    plano_parcelas: e.installmentPlan ?? null,
    observacoes: e.observations ?? null,
    // O backend só lê isto no POST. No PUT ele ignora, de propósito: desligar a
    // recorrência é ação separada, porque também apaga os meses futuros.
    recorrente: e.recurring ?? false,
  };
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const qc = useQueryClient();

  const invalidateDashboard = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['dashboard', 'kpis'] });
    qc.invalidateQueries({ queryKey: ['dashboard', 'projections'] });
  }, [qc]);

  useEffect(() => {
    apiFetch<DespesaApiItem[]>('/despesas')
      .then(data => setExpenses(data.map(fromApi)))
      .catch(() => { /* mantém lista vazia se API indisponível */ });
  }, []);

  /** Recarrega a lista do servidor. */
  const recarregar = useCallback(
    () => apiFetch<DespesaApiItem[]>('/despesas').then(d => setExpenses(d.map(fromApi))),
    [],
  );

  const addExpense = useCallback((e: Expense) => {
    setExpenses(p => [...p, e]);
    apiFetch<DespesaApiItem>('/despesas', {
      init: { method: 'POST', body: JSON.stringify(toApiPayload(e)) },
    }).then(created => {
      setExpenses(p => p.map(x => x.id === e.id ? fromApi(created) : x));
      // Despesa recorrente nasce com os próximos meses junto, e eles são criados
      // no servidor. Sem recarregar, a tela mostraria só o primeiro mês e daria
      // a impressão de que a repetição não funcionou.
      if (e.recurring) return recarregar();
      invalidateDashboard();
    }).then(() => { if (e.recurring) invalidateDashboard(); })
      .catch(() => { /* mantém entrada otimista */ });
  }, [invalidateDashboard, recarregar]);

  /** Encerra a repetição da série a que esta despesa pertence.
   *
   *  Recarrega em vez de mexer na lista local: encerrar apaga as previsões
   *  futuras, e adivinhar aqui quais sumiram significaria repetir a regra do
   *  servidor — e ela mudar de um lado só. */
  const endRecurrence = useCallback((id: string) => {
    apiFetch(`/despesas/${id}/encerrar-recorrencia`, { init: { method: 'POST' } })
      .then(() => recarregar())
      .then(() => invalidateDashboard())
      .catch(() => { /* a lista continua como está */ });
  }, [invalidateDashboard, recarregar]);

  const updateExpense = useCallback((e: Expense) => {
    setExpenses(p => p.map(x => x.id === e.id ? e : x));
    apiFetch<DespesaApiItem>(`/despesas/${e.id}`, {
      init: { method: 'PUT', body: JSON.stringify(toApiPayload(e)) },
    }).then(() => invalidateDashboard())
      .catch(() => { /* atualização otimista já aplicada */ });
  }, [invalidateDashboard]);

  const deleteExpense = useCallback((id: string) => {
    // Numa despesa recorrente, o servidor remove TODAS as cópias não pagas, e
    // não só esta. Tirar só o id da lista local deixaria os outros meses na
    // tela até alguém recarregar — com a impressão de que a exclusão falhou
    // pela metade. Por isso a lista vem do servidor de novo.
    const recorrente = expenses.find(x => x.id === id)?.recurrenceId;
    setExpenses(p => p.filter(x => x.id !== id));
    apiFetch(`/despesas/${id}`, { init: { method: 'DELETE' } })
      .then(() => (recorrente ? recarregar() : undefined))
      .then(() => invalidateDashboard())
      .catch(() => { /* remoção otimista já aplicada */ });
  }, [expenses, invalidateDashboard, recarregar]);

  const upsertGoal = useCallback((g: Goal) => {
    setGoals(p => {
      const exists = p.some(x => x.key === g.key);
      return exists ? p.map(x => x.key === g.key ? g : x) : [...p, g];
    });
  }, []);
  const deleteGoal = useCallback((key: string) => setGoals(p => p.filter(x => x.key !== key)), []);

  return (
    <FinanceContext.Provider value={{ expenses, addExpense, endRecurrence, updateExpense, deleteExpense, goals, upsertGoal, deleteGoal }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
}
