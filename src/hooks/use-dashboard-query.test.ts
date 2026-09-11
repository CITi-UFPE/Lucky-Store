import type { QueryObserverOptions } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  useDashboardKpis,
  useDashboardProjections,
  useDashboardBreakdownByCompany,
  useDashboardBreakdownBySeller,
  type DashboardQueryParams,
} from './use-dashboard-query'
import { apiFetch } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}))

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

const baseParams: DashboardQueryParams = { mes: 5, ano: 2026 }

const mockKpis = {
  periodo_inicio: '2026-05-01',
  periodo_fim: '2026-05-31',
  receita: 10000,
  custo: 6000,
  lucro: 4000,
  margem: 0.4,
  num_pedidos: 50,
  num_cancelamentos: 2,
  valor_cancelamentos: 300,
  receita_hoje: 500,
  ticket_venda: 200,
  ticket_lucro: 80,
  ticket_custo: 120,
  imposto_compra: 100,
  imposto_venda: 150,
  outros_custos: 200,
}

const mockProjections = {
  periodo_inicio: '2026-05-01',
  periodo_fim: '2026-05-31',
  dias_uteis_decorridos: 14,
  dias_uteis_restantes: 8,
  media_diaria: 714,
  projecao_mes: 15708,
  meta_target: 20000,
  meta_floor: 15000,
  gap_target: -4292,
  gap_floor: 708,
  meta_diaria_dinamica: 537,
  pct_meta: 0.5,
}

describe('useDashboardKpis', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls apiFetch with correct path and params', async () => {
    mockApiFetch.mockResolvedValueOnce(mockKpis)

    const { result } = renderHook(() => useDashboardKpis(baseParams), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/dashboard/kpis', { params: baseParams })
  })

  it('uses queryKey that includes params', async () => {
    mockApiFetch.mockResolvedValueOnce(mockKpis)

    const { result } = renderHook(() => useDashboardKpis(baseParams), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockKpis)
  })

  it('has staleTime of 30 000 ms', () => {
    mockApiFetch.mockResolvedValueOnce(mockKpis)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useDashboardKpis(baseParams), { wrapper })

    const query = qc.getQueryCache().find({
      queryKey: ['dashboard', 'kpis', baseParams],
    })
    expect((query?.options as QueryObserverOptions | undefined)?.staleTime).toBe(30_000)
  })
})

describe('useDashboardProjections', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls apiFetch with correct path and params', async () => {
    mockApiFetch.mockResolvedValueOnce(mockProjections)

    const { result } = renderHook(() => useDashboardProjections(baseParams), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/dashboard/projections', { params: baseParams })
  })

  it('uses queryKey that includes params', async () => {
    mockApiFetch.mockResolvedValueOnce(mockProjections)

    const { result } = renderHook(() => useDashboardProjections(baseParams), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockProjections)
  })

  it('has staleTime of 30 000 ms', () => {
    mockApiFetch.mockResolvedValueOnce(mockProjections)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useDashboardProjections(baseParams), { wrapper })

    const query = qc.getQueryCache().find({
      queryKey: ['dashboard', 'projections', baseParams],
    })
    expect((query?.options as QueryObserverOptions | undefined)?.staleTime).toBe(30_000)
  })
})

describe('useDashboardBreakdownByCompany', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls apiFetch with correct path and params', async () => {
    const mockData = { items: [{ nome: 'Loja A', receita: 5000, custo: 3000, lucro: 2000, margem: 0.4, num_pedidos: 25, num_cancelamentos: 1, valor_cancelamentos: 200, ticket_venda: 200, ticket_custo: 120, ticket_lucro: 80 }] }
    mockApiFetch.mockResolvedValueOnce(mockData)

    const { result } = renderHook(() => useDashboardBreakdownByCompany(baseParams), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/dashboard/breakdown-by-company', { params: baseParams })
  })

  it('uses queryKey that includes params', async () => {
    const mockData = { items: [] }
    mockApiFetch.mockResolvedValueOnce(mockData)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useDashboardBreakdownByCompany(baseParams), { wrapper })

    const query = qc.getQueryCache().find({
      queryKey: ['dashboard', 'breakdown-company', baseParams],
    })
    expect(query).toBeDefined()
  })

  it('has staleTime of 60 000 ms', () => {
    mockApiFetch.mockResolvedValueOnce({ items: [] })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useDashboardBreakdownByCompany(baseParams), { wrapper })

    const query = qc.getQueryCache().find({
      queryKey: ['dashboard', 'breakdown-company', baseParams],
    })
    expect((query?.options as QueryObserverOptions | undefined)?.staleTime).toBe(60_000)
  })
})

describe('useDashboardBreakdownBySeller', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls apiFetch with correct path and params', async () => {
    const mockData = {
      items: [{ id_vendedor: 'v1', nome: 'Vendedor A', receita: 5000, custo: 3000, lucro: 2000, margem: 0.4, num_pedidos: 25, num_cancelamentos: 1, valor_cancelamentos: 200, ticket_venda: 200, ticket_custo: 120, ticket_lucro: 80 }],
    }
    mockApiFetch.mockResolvedValueOnce(mockData)

    const { result } = renderHook(() => useDashboardBreakdownBySeller(baseParams), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/dashboard/breakdown-by-seller', { params: baseParams })
  })

  it('uses queryKey that includes params', async () => {
    const mockData = { items: [] }
    mockApiFetch.mockResolvedValueOnce(mockData)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useDashboardBreakdownBySeller(baseParams), { wrapper })

    const query = qc.getQueryCache().find({
      queryKey: ['dashboard', 'breakdown-seller', baseParams],
    })
    expect(query).toBeDefined()
  })

  it('has staleTime of 60 000 ms', () => {
    mockApiFetch.mockResolvedValueOnce({ items: [] })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children)

    renderHook(() => useDashboardBreakdownBySeller(baseParams), { wrapper })

    const query = qc.getQueryCache().find({
      queryKey: ['dashboard', 'breakdown-seller', baseParams],
    })
    expect((query?.options as QueryObserverOptions | undefined)?.staleTime).toBe(60_000)
  })
})
