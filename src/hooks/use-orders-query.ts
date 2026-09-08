import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { ProdutoApiItem, CustoPedido } from '@/types/api'

export interface OrderFilters {
  page: number
  limit: number
  status?: string
  id_loja?: string
  id_vendedor?: string
  data_inicio?: string
  data_fim?: string
  sort_by: string
  sort_dir: 'asc' | 'desc'
}

export interface FreteApiItem {
  id: string
  entregador: string | null
  valor: string | number
  data_frete: string
  pago?: boolean
}

/** Condicoes comerciais herdadas da cotacao que gerou o pedido.
 *  Nao sao campos do pedido — vivem na cotacao e viajam junto para que o
 *  documento da OS mostre o mesmo que o cliente viu ao fechar. */
export interface TermosCotacao {
  previsao_entrega: string | null
  forma_pagamento: string | null
  detalhes_pagamento: string | null
  garantia: string | null
}

export interface PedidoListItem {
  id: string
  id_cotacao: string | null
  /** Índice da cotação que gerou o pedido; null quando ele foi criado do zero. */
  numero_cotacao: number | null
  /** null quando o pedido nasceu do zero, ou quando a cotacao nao tem termo
   *  nenhum preenchido — nos dois casos o bloco nao sai no papel. */
  termos_cotacao: TermosCotacao | null
  /** Pessoa de contato dentro do cliente. A empresa vem em nome_cliente. */
  contato_cliente: string | null
  numero_os: string
  data_pedido: string
  data_entrega: string
  status: string
  is_rma: boolean | null
  is_cancelled: boolean | null
  is_direct_billing: boolean | null
  valor_venda: string | null
  parcelas: number | null
  nome_cliente: string | null
  cnpj_cliente: string | null
  nome_loja: string | null
  nome_vendedor: string | null
  numero_oc: string | null
  numero_nf: string | null
  nota_fiscal_fornecedor: string | null
  observacao: string | null
  fornecedor_principal: string | null
  formas_pagamento: { id: string; forma: string }[]
  fretes: FreteApiItem[]
  produtos: ProdutoApiItem[]
  custo: CustoPedido | null
  data_pagamento: string | null
  multa: string | null
  juros: string | null
  forma_pagamento_efetiva: string | null
  num_parcelas_efetivas: number | null
  plano_parcelas: { date: string; value: number }[] | null
  plano_parcelas_pedido: { date: string; value: number }[] | null
  valor_total_estornado: string | null
}

export interface PedidoListResponse {
  items: PedidoListItem[]
  total: number
  page: number
  limit: number
  pages: number
}

export function useOrdersQuery(filters: OrderFilters, options?: { enabled?: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery<PedidoListResponse>({
    queryKey: ['orders', 'list', filters],
    queryFn: () =>
      apiFetch<PedidoListResponse>('/pedidos', {
        params: {
          page: filters.page,
          limit: filters.limit,
          status: filters.status || undefined,
          id_loja: filters.id_loja || undefined,
          id_vendedor: filters.id_vendedor || undefined,
          data_inicio: filters.data_inicio || undefined,
          data_fim: filters.data_fim || undefined,
          sort_by: filters.sort_by,
          sort_dir: filters.sort_dir,
        },
      }),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
  })

  return { data, isLoading, isError, refetch }
}
