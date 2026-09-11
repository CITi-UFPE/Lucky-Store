import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

vi.mock('@/hooks/use-dashboard-query', () => ({
  useDashboardKpis: vi.fn(),
  useDashboardProjections: vi.fn(),
  useDashboardBreakdownByCompany: vi.fn(),
  useDashboardBreakdownBySeller: vi.fn(),
  useDashboardCardSpend: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useDashboardCounts: vi.fn(() => ({ data: {
    pedidos_abertos: 0, pedidos_entregues: 0, cotacoes_abertas: 0, cotacoes_fechadas: 0,
    rmas_abertos: 0, rmas_entregues: 0, produtos_para_comprar: 0,
  } })),
  useDashboardGoals: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useUpsertGoal: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteGoal: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useVendorGoals: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
  useVendedores: vi.fn(() => ({ data: { items: [] } })),
  useUpsertVendorGoal: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteVendorGoal: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/store/DashboardFilterStore', () => ({
  useDashboardFilters: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/components/dashboard/KpiCard', () => ({
  KpiCard: ({ label, value }: any) => <div data-testid="kpi-card">{label}: {value}</div>,
}));

vi.mock('@/components/dashboard/CompanyBreakdownTable', () => ({
  CompanyBreakdownTable: () => <div data-testid="company-table" />,
}));

vi.mock('@/components/dashboard/SellerBreakdownTable', () => ({
  SellerBreakdownTable: () => <div data-testid="seller-table" />,
}));

vi.mock('@/components/dashboard/DashboardPieChart', () => ({
  DashboardPieChart: (props: unknown) => <div data-testid="pie-chart" data-parts={JSON.stringify(props)} />,
}));

vi.mock('@/components/dashboard/DashboardTicketBar', () => ({
  DashboardTicketBar: () => <div data-testid="ticket-bar" />,
}));

vi.mock('@/components/dashboard/HistoricalChart', () => ({
  HistoricalChart: () => <div data-testid="historical-chart" />,
}));

vi.mock('@/components/dashboard/CardSpendChart', () => ({
  CardSpendChart: () => <div data-testid="card-spend-chart" />,
}));

vi.mock('@/components/dashboard/SellerCard', () => ({
  SellerCard: () => <div data-testid="seller-card" />,
}));

vi.mock('@/components/dashboard/SellerGoalChart', () => ({
  SellerGoalChart: () => <div data-testid="seller-goal-chart" />,
}));

vi.mock('@/api/storeConfig', () => ({
  LOJA_IDS: { 'Lucky Store': 'ls1', BTech: 'bt1', AJJ: 'ajj1' },
  VENDEDOR_IDS: {},
}));

import {
  useDashboardKpis,
  useDashboardProjections,
  useDashboardBreakdownByCompany,
  useDashboardBreakdownBySeller,
} from '@/hooks/use-dashboard-query';
import { useDashboardFilters } from '@/store/DashboardFilterStore';
import { toast } from 'sonner';

const mockFilters = {
  filters: { year: 2026, month: 4 },
  setFilters: vi.fn(),
  mode: 'company' as const,
  setMode: vi.fn(),
  section: 'geral' as const,
  setSection: vi.fn(),
};

const mockKpis = {
  receita: 50000,
  receita_hoje: 2000,
  lucro: 10000,
  margem: 0.2,
  num_pedidos: 120,
  num_cancelamentos: 3,
  valor_cancelamentos: 1500,
  ticket_venda: 416.67,
  ticket_lucro: 83.33,
  ticket_custo: 333.33,
  imposto_compra: 2000,
  imposto_venda: 3000,
  outros_custos: 5000,
  custo: 40000,
  periodo_inicio: '2026-05-01',
  periodo_fim: '2026-05-31',
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderDashboard() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setupDefaultMocks() {
  vi.mocked(useDashboardFilters).mockReturnValue(mockFilters);
  vi.mocked(useDashboardProjections).mockReturnValue({ data: undefined, isLoading: false, isError: false } as any);
  vi.mocked(useDashboardBreakdownByCompany).mockReturnValue({ data: undefined, isLoading: false, isError: false } as any);
  vi.mocked(useDashboardBreakdownBySeller).mockReturnValue({ data: undefined, isLoading: false, isError: false } as any);
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders skeleton when kpisLoading is true', () => {
    setupDefaultMocks();
    vi.mocked(useDashboardKpis).mockReturnValue({ data: undefined, isLoading: true, isError: false } as any);

    renderDashboard();

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByTestId('kpi-card')).toHaveLength(0);
  });

  it('renders KpiCards when kpisLoading is false and data is available', () => {
    setupDefaultMocks();
    vi.mocked(useDashboardKpis).mockReturnValue({ data: mockKpis, isLoading: false, isError: false } as any);

    renderDashboard();

    expect(screen.queryAllByTestId('kpi-card').length).toBeGreaterThan(0);
  });

  it('renders HistoricalChart in geral section (mode=company)', () => {
    setupDefaultMocks();
    vi.mocked(useDashboardKpis).mockReturnValue({ data: mockKpis, isLoading: false, isError: false } as any);
    vi.mocked(useDashboardFilters).mockReturnValue({
      ...mockFilters,
      mode: 'company',
      section: 'geral',
    });

    renderDashboard();

    expect(screen.getByTestId('historical-chart')).toBeInTheDocument();
  });

  it('renders SellerGoalChart in seller mode', () => {
    setupDefaultMocks();
    vi.mocked(useDashboardKpis).mockReturnValue({ data: mockKpis, isLoading: false, isError: false } as any);
    vi.mocked(useDashboardFilters).mockReturnValue({
      ...mockFilters,
      mode: 'seller',
      section: 'geral',
    });

    renderDashboard();

    expect(screen.getByTestId('seller-goal-chart')).toBeInTheDocument();
  });

  it('calls toast.error when kpisError is true', async () => {
    setupDefaultMocks();
    vi.mocked(useDashboardKpis).mockReturnValue({ data: undefined, isLoading: false, isError: true } as any);

    renderDashboard();

    expect(toast.error).toHaveBeenCalledWith('Erro ao carregar dados do dashboard');
  });
});


it('decomposes the full cost without adding fixed expenses twice', () => {
  setupDefaultMocks();
  vi.mocked(useDashboardKpis).mockReturnValue({ data: {
    ...mockKpis, receita: 7464.50, custo: 1060.40, lucro: 6404.10,
    custo_produtos: 840, custo_adicionais: 85.40, custo_frete: 135, outros_custos: 200,
  }, isLoading: false, isError: false } as any);
  renderDashboard();
  const parts = JSON.parse(screen.getByTestId('pie-chart').getAttribute('data-parts')!);
  expect(parts).toEqual({ custoProdutos: 840, custoAdicionais: 85.4, custoFrete: 135 });
  expect(Object.values(parts).reduce((sum: number, value) => sum + Number(value), 0)).toBe(1060.4);
  expect(screen.getByText(/Custo Total: R\$\s*1\.060,40/)).toBeInTheDocument();
  expect(screen.getByText(/R\$\s*6\.204,10/)).toBeInTheDocument();
});
