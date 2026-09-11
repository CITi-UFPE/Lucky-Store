// ─── Shared ───────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface StatusHistoryEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  changed_at: string;
  reason: string | null;
}

export interface OrderHistoryResponse {
  order_id: string;
  status_history: StatusHistoryEntry[];
  audit_logs: unknown[];
}

export interface QuoteHistoryResponse {
  quote_id: string;
  status_history: StatusHistoryEntry[];
  audit_logs: unknown[];
}

export interface ItemHistoryResponse {
  item_id: string;
  status_history: StatusHistoryEntry[];
  audit_logs: unknown[];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserResponse;
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────

export type PedidoStatus =
  | 'To Buy'
  | 'Bought'
  | 'Received'
  | 'To Invoice'
  | 'Invoiced and Received'
  | 'Invoiced and Awaiting Receipt'
  | 'To Pack'
  | 'Ready for Delivery'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Delayed'
  | 'Cancelled';

export interface FormaPagamento {
  id: string;
  forma: string;
}

export interface CustoPedido {
  id: string;
  id_pedido: string;
  custo_produto_inicial: string | null;
  custo_produto_final: string | null;
  custo_servico: string | null;
  brinde: string | null;
  custo_boleto: string | null;
  pct_imposto_compra: string | null;
  imposto_compra: string | null;
  pct_imposto_venda: string | null;
  imposto_venda: string | null;
  pct_custo_credito: string | null;
  custo_credito: string | null;
  pct_custo_debito: string | null;
  custo_debito: string | null;
}

export interface PedidoResponse {
  id: string;
  id_loja: string;
  id_vendedor: string;
  id_cliente: string;
  numero_os: string;
  numero_nf: string | null;
  numero_oc: string | null;
  data_pedido: string;
  data_entrega: string;
  status: PedidoStatus;
  is_rma: boolean;
  is_cancelled: boolean;
  is_direct_billing: boolean;
  valor_venda: string | null;
  parcelas: number | null;
  observacao: string | null;
  fornecedor_principal: string | null;
  nota_fiscal_fornecedor: string | null;
  economia: string | null;
  formas_pagamento: FormaPagamento[];
  custo: CustoPedido | null;
  status_history: StatusHistoryEntry[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePedidoPayload {
  id_loja: string;
  id_vendedor: string;
  id_cotacao?: string;
  /** A EMPRESA. A pessoa de contato vai em contato_cliente. */
  nome_cliente: string;
  contato_cliente?: string;
  cpf_cnpj?: string;
  data_pedido: string;
  data_entrega: string;
  status: PedidoStatus;
  valor_venda?: string;
  parcelas?: number;
  observacao?: string;
  numero_nf?: string;
  nota_fiscal_fornecedor?: string;
  numero_oc?: string;
  is_direct_billing?: boolean;
  fornecedor_principal?: string;
  formas_pagamento?: { forma: string }[];
  custo?: Partial<Omit<CustoPedido, 'id' | 'id_pedido'>>;
  data_pagamento?: string;
  multa?: string;
  juros?: string;
  forma_pagamento_efetiva?: string;
  num_parcelas_efetivas?: number;
  plano_parcelas?: { date: string; value: number }[];
  plano_parcelas_pedido?: { date: string; value: number }[];
}

/**
 * `id_loja` e `id_vendedor` ESTÃO aqui.
 *
 * Eles ficavam de fora deste tipo, e o backend sempre os aceitou no PUT
 * (PedidoUpdate tem os dois). O efeito era invisível: trocar a empresa ou o
 * vendedor de uma OS já criada aparecia na tela, a API respondia 200, a mensagem
 * de sucesso saía — e nada disso chegava ao banco, porque os campos nem eram
 * enviados. Só recarregando a página é que a troca desaparecia.
 *
 * `nome_cliente` e `status` continuam fora por motivo real: o primeiro não
 * existe em PedidoUpdate, e o segundo tem rota própria (mudar status dispara
 * cancelamento, histórico e outras regras que um PUT não pode disparar de lado).
 */
export type UpdatePedidoPayload = Partial<Omit<CreatePedidoPayload, 'nome_cliente' | 'status'>>;

export interface PedidoFilters {
  page?: number;
  limit?: number;
  status?: PedidoStatus;
  id_loja?: string;
  id_vendedor?: string;
  data_inicio?: string;
  data_fim?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

// ─── Produtos ─────────────────────────────────────────────────────────────────

export interface SubCompraApiItem {
  id: string;
  selectedQuantity: number;
  supplier: string;
  buyer: string;
  purchaseDate?: string;
  productDeliveryDate?: string;
  receiptDate?: string;
  purchaseValue: number;
  paymentMethod: string;
  installments?: number;
  card?: string;
  status: string;
}

export interface ProdutoApiItem {
  id: string;
  id_pedido: string;
  id_vendedor: string;
  descricao: string;
  /** Anotações do item, escritas na tela de Produtos. */
  observacao: string | null;
  quantidade: number;
  valor_projetado: string;
  preco_custo: string | null;
  valor_compra: string | null;
  status: string;
  prazo_entrega: string | null;
  data_compra: string | null;
  data_recebimento: string | null;
  fornecedor: string | null;
  is_direct_supply: boolean;
  porcentagem_fornecedor: string | null;
  frete_fornecedor: string | null;
  nota_fiscal_item: string | null;
  sub_compras: SubCompraApiItem[] | null;
}

// ─── Cotações ─────────────────────────────────────────────────────────────────

export interface ItemCotacao {
  id: string;
  id_cotacao: string;
  descricao: string;
  quantidade: number;
  valor_unitario: string;
  valor_total: string;
  valor_fechamento: string | null;
  valor_total_fechamento: string | null;
  fornecedor: string | null;
  is_direct_supply: boolean;
  porcentagem_fornecedor: string | null;
  frete_fornecedor: string | null;
}

export interface CotacaoResponse {
  id: string;
  id_loja: string;
  id_vendedor: string;
  numero: number | null;
  numero_loja: number | null;
  cliente: string;
  cnpj_cliente: string | null;
  numero_requisicao: string | null;
  data_cotacao: string;
  data_validade: string | null;
  b2b_company: string | null;
  is_direct_billing: boolean;
  fornecedor: string | null;
  valor_total: string | null;
  pct_imposto_lucky: string | null;
  pct_imposto_btech: string | null;
  observacao: string | null;
  data_entrega: string | null;
  previsao_entrega: string | null;
  forma_pagamento: string | null;
  detalhes_pagamento: string | null;
  prazo_pagamento: string | null;
  garantia: string | null;
  status_enviada: boolean;
  data_envio: string | null;
  status_em_fechamento: boolean;
  data_prevista_fechamento: string | null;
  status_fechada: boolean;
  data_fechamento: string | null;
  valor_fechamento: string | null;
  status_caida: boolean;
  data_queda: string | null;
  itens: ItemCotacao[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCotacaoPayload {
  id_loja: string;
  id_vendedor: string;
  cliente: string;
  data_cotacao: string;
  cnpj_cliente?: string;
  numero_requisicao?: string;
  data_validade?: string;
  b2b_company?: string;
  is_direct_billing?: boolean;
  fornecedor?: string;
  valor_total?: string;
  pct_imposto_lucky?: string;
  pct_imposto_btech?: string;
  observacao?: string;
  data_entrega?: string;
  previsao_entrega?: string;
  forma_pagamento?: string;
  detalhes_pagamento?: string;
  prazo_pagamento?: string;
  garantia?: string;
  itens?: {
    descricao: string;
    quantidade: number;
    valor_unitario: string;
    valor_fechamento?: string;
    fornecedor?: string;
    is_direct_supply?: boolean;
    porcentagem_fornecedor?: string;
    frete_fornecedor?: string;
  }[];
}

export type UpdateCotacaoPayload = Partial<Omit<CreateCotacaoPayload, 'id_loja' | 'id_vendedor' | 'itens'>>;

export interface UpdateCotacaoFasePayload {
  status_enviada?: boolean;
  data_envio?: string;
  status_em_fechamento?: boolean;
  data_prevista_fechamento?: string;
  status_fechada?: boolean;
  data_fechamento?: string;
  valor_fechamento?: string;
  status_caida?: boolean;
  data_queda?: string;
}

export interface CotacaoFilters {
  page?: number;
  limit?: number;
  id_loja?: string;
  id_vendedor?: string;
  cliente?: string;
  data_inicio?: string;
  data_fim?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  numero_requisicao?: string;
  /** Procura em índice (exato), Nº de requisição, cliente, empresa e vendedor. */
  busca?: string;
}

export interface ConversaoResponse {
  id_pedido: string;
  id_cotacao: string;
  message: string;
}

// ─── RMA ──────────────────────────────────────────────────────────────────────

export type RmaStatus =
  | 'Registered'
  | 'In Analysis'
  | 'Approved'
  | 'In Repair'
  | 'Repaired'
  | 'Ready'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Completed'
  | 'Reembolso';

export type ItemRmaStatus =
  | 'Not Received'
  | 'Received'
  | 'Sent for Repair'
  | 'In Repair'
  | 'Repaired Not Received'
  | 'Repaired Received'
  | 'To Pack'
  | 'Ready for Delivery'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Estorno';

export interface ItemRma {
  id: string;
  id_rma: string;
  id_produto_origem: string | null;
  descricao: string;
  quantidade: number;
  status: ItemRmaStatus;
  consertado_por: string | null;
  fornecedor: string | null;
  valor_estornado: string | null;
  data_estorno: string | null;
  motivo_estorno: string | null;
}

export interface RmaResponse {
  id: string;
  id_pedido_origem: string;
  id_vendedor: string;
  id_loja: string;
  numero_rma: string;
  numero_os_origem: string | null;
  data_registro: string;
  prazo_entrega: string | null;
  status: RmaStatus;
  itens: ItemRma[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateRmaPayload {
  prazo_entrega?: string;
  status?: RmaStatus;
}

export interface CreateRmaPayload {
  id_pedido_origem: string;
  prazo_entrega?: string;
  itens: {
    id_produto_origem?: string;
    descricao: string;
    quantidade: number;
    fornecedor?: string;
  }[];
}

export interface RmaFilters {
  page?: number;
  limit?: number;
  status?: RmaStatus;
  id_loja?: string;
  id_vendedor?: string;
  id_pedido_origem?: string;
  data_inicio?: string;
  data_fim?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  numero_rma?: string;
}

export interface RmaHistoryResponse {
  rma_id: string;
  status_history: StatusHistoryEntry[];
  audit_logs: unknown[];
}
