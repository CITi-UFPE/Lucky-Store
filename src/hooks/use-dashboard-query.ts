import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface DashboardQueryParams {
  mes?: number
  ano?: number
  data_inicio?: string
  data_fim?: string
  id_loja?: string
}

export interface DashboardKpis {
  periodo_inicio: string
  periodo_fim: string
  receita: number
  estornos: number
  custo: number
  lucro: number
  margem: number
  num_pedidos: number
  num_cancelamentos: number
  valor_cancelamentos: number
  receita_hoje: number
  ticket_venda: number
  ticket_lucro: number
  ticket_custo: number
  imposto_compra: number
  imposto_venda: number
  outros_custos: number
  custo_frete: number
  custo_produtos: number
  custo_adicionais: number
}

export interface DashboardProjections {
  periodo_inicio: string
  periodo_fim: string
  dias_uteis_decorridos: number
  dias_uteis_restantes: number
  media_diaria: number
  projecao_mes: number
  meta_target: number | null
  meta_floor: number | null
  gap_target: number | null
  gap_floor: number | null
  meta_diaria_dinamica: number | null
  pct_meta: number | null
  meta_lucro_target: number | null
  meta_lucro_floor: number | null
  gap_lucro_target: number | null
  gap_lucro_floor: number | null
  pct_meta_lucro: number | null
  meta_lucro_diaria_dinamica: number | null
}

export interface BreakdownItem {
  nome: string
  receita: number
  custo: number
  lucro: number
  margem: number
  num_pedidos: number
  num_cancelamentos: number
  valor_cancelamentos: number
  ticket_venda: number
  ticket_custo: number
  ticket_lucro: number
}

export interface SellerBreakdownItem extends BreakdownItem {
  id_vendedor: string
}

export function useDashboardKpis(params: DashboardQueryParams) {
  return useQuery<DashboardKpis>({
    queryKey: ['dashboard', 'kpis', params],
    queryFn: () => apiFetch<DashboardKpis>('/dashboard/kpis', { params: { ...params } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useDashboardProjections(params: DashboardQueryParams) {
  return useQuery<DashboardProjections>({
    queryKey: ['dashboard', 'projections', params],
    queryFn: () => apiFetch<DashboardProjections>('/dashboard/projections', { params: { ...params } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useDashboardBreakdownByCompany(params: DashboardQueryParams) {
  return useQuery<{ items: BreakdownItem[] }>({
    queryKey: ['dashboard', 'breakdown-company', params],
    queryFn: () => apiFetch('/dashboard/breakdown-by-company', { params: { ...params } }),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useDashboardBreakdownBySeller(params: DashboardQueryParams) {
  return useQuery<{ items: SellerBreakdownItem[] }>({
    queryKey: ['dashboard', 'breakdown-seller', params],
    queryFn: () => apiFetch('/dashboard/breakdown-by-seller', { params: { ...params } }),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

export interface CardSpendItem {
  card: string
  total: number
}

export function useDashboardCardSpend(params: DashboardQueryParams) {
  return useQuery<{ items: CardSpendItem[] }>({
    queryKey: ['dashboard', 'card-spend', params],
    queryFn: () => apiFetch('/dashboard/card-spend', { params: { ...params } }),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

// ─── Contagens operacionais (snapshot) ─────────────────────────────────────────

export interface DashboardCounts {
  pedidos_abertos: number
  pedidos_entregues: number
  cotacoes_abertas: number
  cotacoes_fechadas: number
  rmas_abertos: number
  rmas_entregues: number
  produtos_para_comprar: number
}

export function useDashboardCounts(params: DashboardQueryParams) {
  // Contagens de estado atual — só a loja importa (o backend ignora o período).
  const p = { id_loja: params.id_loja }
  return useQuery<DashboardCounts>({
    queryKey: ['dashboard', 'counts', p],
    queryFn: () => apiFetch('/dashboard/counts', { params: { ...p } }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface ApiGoal {
  id: string
  ano: number
  mes: number
  id_loja: string
  nome_loja: string | null
  tipo: string
  target: number
  floor: number | null
}

export function useDashboardGoals() {
  return useQuery<{ items: ApiGoal[] }>({
    queryKey: ['dashboard', 'goals'],
    queryFn: () => apiFetch('/dashboard/goals'),
    staleTime: 60_000,
  })
}

export function useUpsertGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { ano: number; mes: number; id_loja: string; tipo: string; target: number; floor: number | null }) =>
      apiFetch<ApiGoal>('/dashboard/goals', {
        init: { method: 'POST', body: JSON.stringify(data) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'goals'] })
      qc.invalidateQueries({ queryKey: ['dashboard', 'projections'] })
    },
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/dashboard/goals/${id}`, { init: { method: 'DELETE' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'goals'] })
      qc.invalidateQueries({ queryKey: ['dashboard', 'projections'] })
    },
  })
}

// ─── Vendor Goals ─────────────────────────────────────────────────────────────

export interface ApiVendorGoal {
  id: string
  ano: number
  mes: number
  id_vendedor: string
  nome_vendedor: string | null
  tipo: string
  target: number
  floor: number | null
}

export function useVendorGoals(params?: { ano?: number; mes?: number }) {
  return useQuery<{ items: ApiVendorGoal[] }>({
    queryKey: ['dashboard', 'vendor-goals', params ?? {}],
    queryFn: () => apiFetch('/dashboard/vendor-goals', { params }),
    staleTime: 60_000,
  })
}

export function useUpsertVendorGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { ano: number; mes: number; id_vendedor: string; tipo: string; target: number; floor: number | null }) =>
      apiFetch<ApiVendorGoal>('/dashboard/vendor-goals', {
        init: { method: 'POST', body: JSON.stringify(data) },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', 'vendor-goals'] }),
  })
}

export function useDeleteVendorGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/dashboard/vendor-goals/${id}`, { init: { method: 'DELETE' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', 'vendor-goals'] }),
  })
}

// ─── Daily Series ─────────────────────────────────────────────────────────────

export interface DailySeriesItem {
  data: string
  faturamento: number
  lucro: number
  ano_anterior: number
  custo: number
  gastos_fixos: number
  ganhos_financeiros: number
  fretes: number
}

export function useDailyHistorical(params: DashboardQueryParams) {
  return useQuery<{ items: DailySeriesItem[] }>({
    queryKey: ['dashboard', 'daily-series', params],
    queryFn: () => apiFetch('/dashboard/daily-series', { params: { ...params } }),
    staleTime: 60_000,
  })
}

// ─── Vendedores ───────────────────────────────────────────────────────────────

export interface VendedorItem {
  id: string
  nome: string
  id_loja: string
  /** A rota /vendedores ja devolve os dois; faltavam aqui. O cartao de contato
   *  no rodape da cotacao da BTech le phone e email deste registro — e ele e
   *  por loja, entao o mesmo vendedor tem um telefone para cada empresa. */
  email: string | null
  phone: string | null
}

export function useVendedores() {
  return useQuery<{ items: VendedorItem[] }>({
    queryKey: ['vendedores'],
    queryFn: () => apiFetch('/vendedores'),
    staleTime: 5 * 60_000,
  })
}
