import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { PedidoListItem, PedidoListResponse } from './use-orders-query'
import type { Order, OrderStatus, PaymentMethod, Company, ItemStatus } from '@/store/OrderStore'
import { FORMA_PAGAMENTO_MAP } from '@/api/storeConfig'

// forma da API ('credito') → PaymentMethod do frontend ('Credit Card')
const FORMA_TO_PAYMENT: Record<string, PaymentMethod> = Object.fromEntries(
  Object.entries(FORMA_PAGAMENTO_MAP).map(([k, v]) => [v, k as PaymentMethod])
) as Record<string, PaymentMethod>

export function adaptPedidoToOrder(p: PedidoListItem): Order {
  return {
    id: p.id,
    os: p.numero_os,
    createdAt: 0,
    orderDate: p.data_pedido,
    customer: p.nome_cliente ?? '',
    cnpj: p.cnpj_cliente ?? '',
    company: (p.nome_loja ?? '') as Company,
    seller: '',
    ocAfPed: p.numero_oc ?? '',
    directBilling: p.is_direct_billing ?? false,
    supplier: p.fornecedor_principal ?? '',
    invoice: p.numero_nf ?? '',
    invoiceSupplier: p.nota_fiscal_fornecedor ?? '',
    paymentMethods: (p.formas_pagamento ?? [])
      .map(fp => FORMA_TO_PAYMENT[fp.forma] ?? (fp.forma as PaymentMethod))
      .filter(Boolean) as PaymentMethod[],
    installments: p.parcelas ?? 1,
    deliveryDate: p.data_entrega,
    status: (() => {
      const s = p.status as OrderStatus;
      if (p.is_cancelled) return 'Cancelled' as OrderStatus;
      if (s === 'Delivered' || s === 'Cancelled') return s;
      const today = new Date().toISOString().slice(0, 10);
      if (p.data_entrega && p.data_entrega < today) return 'Delayed' as OrderStatus;
      return s;
    })(),
    isRMA: p.is_rma ?? false,
    // O badge ja tratava status==='Cancelled' como cancelado; o switch do
    // modal olhava so a flag. Pedido criado ja cancelado aparecia com o
    // badge vermelho e o switch desligado. Mesma regra do backend agora.
    cancelled: (p.is_cancelled ?? false) || p.status === 'Cancelled',
    observations: p.observacao ?? '',
    initialProductCost: 0,
    finalProductCost: 0,
    boletoCost: 0,
    giftCost: 0,
    creditCostPercent: 0,
    creditCostValue: 0,
    debitCostPercent: 0,
    debitCostValue: 0,
    purchaseTaxPercent: 0,
    purchaseTaxValue: 0,
    salesTaxPercent: 0,
    salesTaxValue: 0,
    salesValue: Number(p.valor_venda) || 0,
    items: (p.produtos ?? []).map(pr => ({
      id: pr.id,
      name: pr.descricao,
      quantity: pr.quantidade,
      status: (pr.status as ItemStatus) || 'To Buy',
      projectedValue: Number(pr.valor_projetado) || 0,
      purchaseValue: Number(pr.valor_compra) || 0,
      productDeliveryDate: pr.prazo_entrega ?? undefined,
    })),
    freight: (p.fretes ?? [])
      .filter(f => !!f.entregador)
      .map(f => ({
        id: f.id,
        deliveryPerson: f.entregador!,
        value: Number(f.valor) || 0,
        deliveryDate: f.data_frete,
      })),
    paymentDate: p.data_pagamento ?? undefined,
    penaltyValue: Number(p.multa) || 0,
    interestValue: Number(p.juros) || 0,
    refundTotal: Number(p.valor_total_estornado) || 0,
    paymentMethod: p.forma_pagamento_efetiva
      ? (FORMA_TO_PAYMENT[p.forma_pagamento_efetiva] ?? (p.forma_pagamento_efetiva as PaymentMethod))
      : undefined,
    paymentInstallments: p.num_parcelas_efetivas ?? 1,
    paymentInstallmentPlan: (p.plano_parcelas ?? []).map(x => ({
      date: x.date,
      value: Number(x.value) || 0,
    })),
    orderInstallmentPlan: (p.plano_parcelas_pedido ?? []).map(x => ({
      date: x.date,
      value: Number(x.value) || 0,
    })),
    directSupplyItems: [],
  }
}

export function useFinancialOrders() {
  return useQuery<Order[]>({
    queryKey: ['financial-orders'],
    queryFn: async () => {
      const resp = await apiFetch<PedidoListResponse>('/pedidos', {
        params: { page: 1, limit: 500, sort_by: 'data_pedido', sort_dir: 'desc' },
      })
      return resp.items.map(adaptPedidoToOrder)
    },
    staleTime: 60_000,
  })
}
