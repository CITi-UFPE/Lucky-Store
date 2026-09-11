import type { PedidoListItem, FreteApiItem } from '@/hooks/use-orders-query';
import type { Order, Company, Seller, PaymentMethod, ItemStatus, DirectSupplyOrderItem, PaymentInstallment, OrderStatus } from '@/store/OrderStore';
import { FORMA_PAGAMENTO_MAP } from '@/api/storeConfig';
const FORMA_TO_PAYMENT = Object.fromEntries(Object.entries(FORMA_PAGAMENTO_MAP).map(([k,v]) => [v,k]));
function getEffectiveStatus(status: string, cancelled: boolean, deliveryDate: string): OrderStatus {
  if (cancelled || status === 'Cancelled') return 'Cancelled';
  if (status === 'Delivered') return 'Delivered';
  if (deliveryDate && deliveryDate < new Date().toISOString().slice(0, 10)) return 'Delayed';
  return status as OrderStatus;
}

export function pedidoListToOrder(item: PedidoListItem): Order {
  return {
    id: item.id,
    os: item.numero_os,
    sourceQuoteNumber: item.numero_cotacao ?? null,
    quoteTerms: item.termos_cotacao
      ? {
          deliveryForecast: item.termos_cotacao.previsao_entrega,
          paymentMethod: item.termos_cotacao.forma_pagamento,
          paymentDetails: item.termos_cotacao.detalhes_pagamento,
          warranty: item.termos_cotacao.garantia,
        }
      : null,
    customerContact: item.contato_cliente ?? '',
    createdAt: Date.now(),
    orderDate: item.data_pedido,
    customer: item.nome_cliente ?? '',
    cnpj: item.cnpj_cliente ?? '',
    company: (item.nome_loja ?? '') as Company,
    seller: (item.nome_vendedor ?? '') as Seller,
    ocAfPed: item.numero_oc ?? '',
    directBilling: item.is_direct_billing ?? false,
    supplier: item.fornecedor_principal ?? '',
    invoice: item.numero_nf ?? '',
    invoiceSupplier: item.nota_fiscal_fornecedor ?? '',
    paymentMethods: (item.formas_pagamento ?? [])
      .map(fp => FORMA_TO_PAYMENT[fp.forma])
      .filter(Boolean) as PaymentMethod[],
    installments: item.parcelas ?? 1,
    deliveryDate: item.data_entrega,
    status: getEffectiveStatus(item.status, item.is_cancelled ?? false, item.data_entrega),
    isRMA: item.is_rma ?? false,
    // Mesma regra do getEffectiveStatus acima e do backend: cancelado e
    // status 'Cancelled', a flag e so o espelho. Sem isto, pedido criado
    // ja cancelado abre o modal com o switch desligado.
    cancelled: (item.is_cancelled ?? false) || item.status === 'Cancelled',
    observations: item.observacao ?? '',
    initialProductCost: parseFloat(item.custo?.custo_produto_inicial ?? '0') || 0,
    finalProductCost:   parseFloat(item.custo?.custo_produto_final   ?? '0') || 0,
    boletoCost:         parseFloat(item.custo?.custo_boleto           ?? '0') || 0,
    giftCost:           parseFloat(item.custo?.brinde                 ?? '0') || 0,
    creditCostPercent:  parseFloat(item.custo?.pct_custo_credito      ?? '0') || 0,
    creditCostValue:    parseFloat(item.custo?.custo_credito          ?? '0') || 0,
    debitCostPercent:   parseFloat(item.custo?.pct_custo_debito       ?? '0') || 0,
    debitCostValue:     parseFloat(item.custo?.custo_debito           ?? '0') || 0,
    purchaseTaxPercent: parseFloat(item.custo?.pct_imposto_compra     ?? '0') || 0,
    purchaseTaxValue:   parseFloat(item.custo?.imposto_compra         ?? '0') || 0,
    salesTaxPercent:    parseFloat(item.custo?.pct_imposto_venda      ?? '0') || 0,
    salesTaxValue:      parseFloat(item.custo?.imposto_venda          ?? '0') || 0,
    salesValue: Number(item.valor_venda) || 0,
    refundTotal: parseFloat(String(item.valor_total_estornado ?? '0')) || 0,
    items: (item.produtos ?? []).filter(p => !p.is_direct_supply).map(p => ({
      id: p.id,
      name: p.descricao,
      observations: p.observacao ?? '',
      quantity: p.quantidade,
      status: p.status as ItemStatus,
      projectedValue: parseFloat(String(p.valor_projetado)) || 0,
      purchaseValue: parseFloat(String(p.valor_compra ?? '0')) || 0,
      productDeliveryDate: p.prazo_entrega ?? undefined,
      saleValue: p.valor_venda != null ? parseFloat(String(p.valor_venda)) : undefined,
    })),
    directSupplyItems: (item.produtos ?? []).filter(p => p.is_direct_supply).map(p => ({
      id: p.id,
      name: p.descricao,
      quantity: p.quantidade,
      projectedValue: parseFloat(String(p.valor_projetado)) || 0,
      purchaseValue: parseFloat(String(p.preco_custo ?? '0')) || 0,
      closingValue: parseFloat(String(p.valor_compra ?? '0')) || 0,
      supplier: p.fornecedor ?? '',
      supplierPct: parseFloat(String(p.porcentagem_fornecedor ?? '0')) || 0,
      supplierFreight: parseFloat(String(p.frete_fornecedor ?? '0')) || 0,
      supplierInvoice: p.nota_fiscal_item ?? '',
    } as DirectSupplyOrderItem)),
    freight: (item.fretes ?? []).map((f: FreteApiItem) => ({
      id: f.id,
      deliveryPerson: f.entregador ?? '',
      value: parseFloat(String(f.valor)) || 0,
      deliveryDate: f.data_frete ?? undefined,
      pago: f.pago ?? false,
    })),
    paymentDate: item.data_pagamento ?? '',
    penaltyValue: parseFloat(String(item.multa ?? '0')) || 0,
    interestValue: parseFloat(String(item.juros ?? '0')) || 0,
    paymentMethod: (Object.entries(FORMA_PAGAMENTO_MAP).find(([, v]) => v === item.forma_pagamento_efetiva)?.[0] ?? '') as PaymentMethod | '',
    paymentInstallments: item.num_parcelas_efetivas ?? 1,
    paymentInstallmentPlan: (item.plano_parcelas ?? []) as PaymentInstallment[],
    orderInstallmentPlan: (item.plano_parcelas_pedido ?? []) as PaymentInstallment[],
  };
}
