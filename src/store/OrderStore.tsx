import React, { createContext, useContext, useState, useCallback } from 'react';

export type OrderStatus =
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

export type ItemStatus = 'To Buy' | 'Bought' | 'In Stock';

export type RmaItemStatus =
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

export const RMA_ITEM_STATUSES: RmaItemStatus[] = [
  'Not Received', 'Received', 'Sent for Repair', 'In Repair',
  'Repaired Not Received', 'Repaired Received',
  'To Pack', 'Ready for Delivery', 'Out for Delivery', 'Delivered',
  'Estorno',
];

export const RMA_STATUS_LABELS: Record<RmaItemStatus, string> = {
  'Not Received': 'NÃO RECEBIDO',
  'Received': 'RECEBIDO',
  'Sent for Repair': 'ENVIADO PARA REPARO',
  'In Repair': 'EM REPARO',
  'Repaired Not Received': 'REPARADO E NÃO RECEBIDO',
  'Repaired Received': 'REPARADO E RECEBIDO',
  'To Pack': 'A EMBALAR',
  'Ready for Delivery': 'PRONTO P/ ENTREGA',
  'Out for Delivery': 'EM ENTREGA',
  'Delivered': 'ENTREGUE',
  'Estorno': 'ESTORNO',
};

export const RMA_STATUS_COLORS: Record<RmaItemStatus, string> = {
  'Not Received':           'bg-[hsl(var(--st-cancelled)/0.18)] text-[hsl(var(--st-cancelled))] border-[hsl(var(--st-cancelled)/0.5)]',
  'Received':               'bg-[hsl(var(--st-received)/0.18)] text-[hsl(var(--st-received))] border-[hsl(var(--st-received)/0.5)]',
  'Sent for Repair':        'bg-[hsl(var(--st-tobuy)/0.18)] text-[hsl(var(--st-tobuy))] border-[hsl(var(--st-tobuy)/0.5)]',
  'In Repair':              'bg-[hsl(var(--st-bought)/0.18)] text-[hsl(var(--st-bought))] border-[hsl(var(--st-bought)/0.5)]',
  'Repaired Not Received':  'bg-[hsl(var(--st-invoiced-pending)/0.18)] text-[hsl(var(--st-invoiced-pending))] border-[hsl(var(--st-invoiced-pending)/0.6)]',
  'Repaired Received':      'bg-[hsl(var(--st-invoiced-received)/0.4)] text-[hsl(22_85%_30%)] border-[hsl(var(--st-invoiced-received))]',
  'To Pack':                'bg-[hsl(var(--st-topack)/0.35)] text-[hsl(220_70%_30%)] border-[hsl(var(--st-topack))]',
  'Ready for Delivery':     'bg-[hsl(var(--st-ready)/0.18)] text-[hsl(var(--st-ready))] border-[hsl(var(--st-ready)/0.6)]',
  'Out for Delivery':       'bg-[hsl(var(--st-delivering)/0.4)] text-[hsl(140_70%_22%)] border-[hsl(var(--st-delivering))]',
  'Delivered':              'bg-[hsl(var(--st-delivered)/0.18)] text-[hsl(var(--st-delivered))] border-[hsl(var(--st-delivered)/0.6)]',
  'Estorno':                'bg-red-50 text-red-700 border-red-300',
};

export interface RmaItem {
  id: string;
  /** Source OrderItem id (for traceability) */
  sourceItemId: string;
  name: string;
  quantity: number;
  /** Free-text — who is fixing the item */
  repairedBy?: string;
  /** Supplier migrated from the originating product */
  supplier?: string;
  status: RmaItemStatus;
}

/** Freight/Delivery card used in both Orders and RMAs */
export interface FreightCard {
  id: string;
  deliveryPerson: string;
  value: number;
  deliveryDate?: string;
  pago?: boolean;
}
export type PaymentMethod = 'Credit Card' | 'Debit Card' | 'Boleto' | 'Pix' | 'TED' | 'Cash';
export type Company = '' | 'Lucky Store' | 'BTech' | 'AJJ';
export type Seller = string;

export const SELLERS: string[] = ['Alcides', 'Lucas', 'Pedro'];
export const PAYMENT_METHODS: PaymentMethod[] = ['Credit Card', 'Debit Card', 'Boleto', 'Pix', 'TED', 'Cash'];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  'Credit Card': 'Cartão de Crédito',
  'Debit Card': 'Cartão de Débito',
  'Boleto': 'Boleto',
  'Pix': 'Pix',
  'TED': 'TED',
  'Cash': 'Dinheiro',
};

export interface SubPurchase {
  id: string;
  selectedQuantity: number;
  supplier: string;
  buyer: string;
  purchaseDate?: string;
  productDeliveryDate?: string;
  receiptDate?: string;
  purchaseValue: number;
  paymentMethod: PaymentMethod | '';
  installments?: number;
  card?: string;
  status: ItemStatus;
}

export interface OrderItem {
  id: string;
  name: string;
  /** Anotações do item, escritas na tela de Produtos. Ficam no produto, e não
   *  na observação do pedido, para não misturar o que é de um item com o que é
   *  dos outros. */
  observations?: string;
  quantity: number;
  status: ItemStatus;
  projectedValue: number;
  /** Aggregated from subPurchases (sum). Kept on item for backwards-compat & quick reads. */
  purchaseValue: number;
  /**
   * Por quanto o cliente compra este item (unitário). É o que sai na coluna
   * "Valor de venda" do documento da OS.
   *
   * Não confundir com `projectedValue`, que é o CUSTO projetado — era ele que
   * a coluna lia antes, e por isso o papel mostrava custo no lugar de venda, e
   * zero quando a cotação só tinha o preço do cliente preenchido.
   */
  saleValue?: number;
  /** Optional product-level delivery date (ISO yyyy-mm-dd) — latest among sub-purchases. */
  productDeliveryDate?: string;
  /** Sub-purchasing breakdown: multiple supplier purchases fulfilling the total quantity. */
  subPurchases?: SubPurchase[];
}

export interface DirectSupplyOrderItem {
  id: string;
  name: string;
  quantity: number;
  /** Unit quote value (stored as valor_projetado in DB) */
  projectedValue: number;
  /** Unit purchase/cost value paid to supplier */
  purchaseValue: number;
  /** Unit sale value charged to customer (stored as valor_compra in DB for direct supply items) */
  closingValue: number;
  supplier: string;
  supplierPct: number;
  supplierFreight: number;
  supplierInvoice: string;
}

/** Sum of all purchase values from sub-purchases (falls back to item.purchaseValue if none). */
export function calcItemFinalValue(item: OrderItem): number {
  if (item.subPurchases && item.subPurchases.length > 0) {
    return item.subPurchases.reduce((s, sp) => s + (sp.purchaseValue || 0), 0);
  }
  return item.purchaseValue || 0;
}

/** Latest product delivery date among sub-purchases (ISO yyyy-mm-dd) */
export function calcItemLatestDelivery(item: OrderItem): string | undefined {
  if (!item.subPurchases || item.subPurchases.length === 0) return item.productDeliveryDate;
  const dates = item.subPurchases.map(sp => sp.productDeliveryDate).filter(Boolean) as string[];
  if (dates.length === 0) return item.productDeliveryDate;
  return dates.sort().slice(-1)[0];
}

/** Installment plan (date + value) used in the Pagamento section */
export interface PaymentInstallment {
  date: string;
  value: number;
}

export interface Order {
  id: string;
  os: string;
  /** Índice da cotação que originou o pedido, quando ele veio de uma.
   *  Vai para o cabeçalho do documento impresso — é o que liga a OS de volta
   *  à cotação que o cliente aprovou. */
  sourceQuoteNumber?: number | null;
  /** Condições comerciais combinadas na cotação de origem — previsão de
   *  entrega, forma e detalhes de pagamento, garantia. Não são campos do
   *  pedido: vêm da cotação junto com o número dela, para que o documento da
   *  OS mostre ao cliente o mesmo que ele viu ao fechar. Ausente no pedido
   *  criado do zero, e aí o bloco não sai no papel. */
  quoteTerms?: {
    deliveryForecast?: string | null;
    paymentMethod?: string | null;
    paymentDetails?: string | null;
    warranty?: string | null;
  } | null;
  /** Creation timestamp (ms) — used for default newest-first sort */
  createdAt: number;
  orderDate: string;
  customer: string;
  /** Client's company/enterprise name (b2b). When set, this is the primary identifier shown. */
  customerCompany?: string;
  cnpj: string;
  /** Pessoa de contato dentro do cliente.
   *  `customer` é a EMPRESA — é o que o formulário sempre gravou e o que o
   *  CNPJ acompanha. Este campo é a pessoa, que antes não tinha onde caber. */
  customerContact?: string;
  company: Company;
  seller: Seller;
  ocAfPed: string;
  /** Direct (triangulated) billing — supplier invoices client directly */
  directBilling: boolean;
  supplier: string;
  invoice: string;
  invoiceSupplier: string;
  paymentMethods: PaymentMethod[];
  installments: number;
  deliveryDate: string;
  status: OrderStatus;
  isRMA: boolean;
  /** Pagamento section */
  paymentDate?: string;
  penaltyValue?: number;
  interestValue?: number;
  paymentMethod?: PaymentMethod | '';
  paymentInstallments?: number;
  /** Multa/juros installment plan (Financeiro / Pagamento section). */
  paymentInstallmentPlan?: PaymentInstallment[];
  /** Order-value installment plan (Informações Gerais — cartão de crédito). */
  orderInstallmentPlan?: PaymentInstallment[];
  /** RMA-specific fields. Only present when isRMA = true. */
  rmaNumber?: string;
  rmaParentOrderId?: string;
  rmaItems?: RmaItem[];
  /** Freight cards for RMA orders */
  rmaFreight?: FreightCard[];
  /** RMA actual delivery date (returned/closed) */
  rmaActualDeliveryDate?: string;
  cancelled: boolean;
  observations: string;
  /** Financial section */
  initialProductCost: number;
  finalProductCost: number;
  /** Boleto cost (R$) */
  boletoCost: number;
  /** Gift cost (R$) */
  giftCost: number;
  creditCostPercent: number;
  creditCostValue: number;
  debitCostPercent: number;
  debitCostValue: number;
  purchaseTaxPercent: number;
  purchaseTaxValue: number;
  salesTaxPercent: number;
  salesTaxValue: number;
  /** Final sales value entered by user */
  salesValue: number;
  refundTotal?: number;
  items: OrderItem[];
  directSupplyItems: DirectSupplyOrderItem[];
  /** Freight cards for non-RMA orders */
  freight: FreightCard[];
}

/** Sum of freight card values */
export function calcFreightTotal(cards?: FreightCard[]): number {
  return (cards || []).reduce((s, c) => s + (c.value || 0), 0);
}

/** RMA priority order = the canonical RMA_ITEM_STATUSES list (lower index = lower priority/earlier stage) */
export function calcRmaParentStatus(items?: RmaItem[]): RmaItemStatus | null {
  if (!items || items.length === 0) return null;
  let lowest = RMA_ITEM_STATUSES.length; // sentinel max
  let result: RmaItemStatus = items[0].status;
  for (const it of items) {
    const idx = RMA_ITEM_STATUSES.indexOf(it.status);
    if (idx >= 0 && idx < lowest) { lowest = idx; result = it.status; }
  }
  return result;
}

/** Tailwind classes using HSL status tokens defined in index.css */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  
  'To Buy':                         'bg-[hsl(var(--st-tobuy)/0.18)] text-[hsl(var(--st-tobuy))] border-[hsl(var(--st-tobuy)/0.5)]',
  'Bought':                         'bg-[hsl(var(--st-bought)/0.18)] text-[hsl(var(--st-bought))] border-[hsl(var(--st-bought)/0.5)]',
  'Received':                       'bg-[hsl(var(--st-received)/0.18)] text-[hsl(var(--st-received))] border-[hsl(var(--st-received)/0.5)]',
  'To Invoice':                     'bg-[hsl(var(--st-toinvoice)/0.22)] text-[hsl(45_85%_28%)] border-[hsl(var(--st-toinvoice)/0.6)]',
  'Invoiced and Received':          'bg-[hsl(var(--st-invoiced-received)/0.4)] text-[hsl(22_85%_30%)] border-[hsl(var(--st-invoiced-received))]',
  'Invoiced and Awaiting Receipt':  'bg-[hsl(var(--st-invoiced-pending)/0.18)] text-[hsl(var(--st-invoiced-pending))] border-[hsl(var(--st-invoiced-pending)/0.6)]',
  'To Pack':                        'bg-[hsl(var(--st-topack)/0.35)] text-[hsl(220_70%_30%)] border-[hsl(var(--st-topack))]',
  'Ready for Delivery':             'bg-[hsl(var(--st-ready)/0.18)] text-[hsl(var(--st-ready))] border-[hsl(var(--st-ready)/0.6)]',
  'Out for Delivery':               'bg-[hsl(var(--st-delivering)/0.4)] text-[hsl(140_70%_22%)] border-[hsl(var(--st-delivering))]',
  'Delivered':                      'bg-[hsl(var(--st-delivered)/0.18)] text-[hsl(var(--st-delivered))] border-[hsl(var(--st-delivered)/0.6)]',
  'Delayed':                        'bg-[hsl(var(--st-delayed)/0.18)] text-[hsl(var(--st-delayed))] border-[hsl(var(--st-delayed)/0.6)]',
  'Cancelled':                      'bg-[hsl(var(--st-cancelled)/0.18)] text-[hsl(var(--st-cancelled))] border-[hsl(var(--st-cancelled)/0.6)]',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  
  'To Buy': 'A Comprar',
  'Bought': 'Comprado',
  'Received': 'Recebido',
  'To Invoice': 'A Faturar',
  'Invoiced and Received': 'Faturado e Recebido',
  'Invoiced and Awaiting Receipt': 'Faturado e Aguardando Recebimento',
  'To Pack': 'A Embalar',
  'Ready for Delivery': 'Pronto p/ Entrega',
  'Out for Delivery': 'Em Entrega',
  'Delivered': 'Entregue',
  'Delayed': 'Atrasado',
  'Cancelled': 'Cancelado',
};

export const ITEM_STATUS_COLORS: Record<ItemStatus, string> = {
  'To Buy': 'bg-[hsl(var(--st-tobuy)/0.18)] text-[hsl(var(--st-tobuy))] border-[hsl(var(--st-tobuy)/0.5)]',
  'Bought': 'bg-[hsl(var(--st-bought)/0.18)] text-[hsl(var(--st-bought))] border-[hsl(var(--st-bought)/0.5)]',
  'In Stock': 'bg-[hsl(var(--st-delivered)/0.18)] text-[hsl(var(--st-delivered))] border-[hsl(var(--st-delivered)/0.6)]',
};

const OPEN_STATUSES: OrderStatus[] = [
  'To Buy', 'Bought', 'Received', 'To Invoice',
  'Invoiced and Received', 'Invoiced and Awaiting Receipt',
  'To Pack', 'Ready for Delivery', 'Out for Delivery', 'Delayed',
];

/** Statuses that trigger the "delivery soon" warning when ≤ 3 days away */
export const WARN_STATUSES: OrderStatus[] = ['To Buy', 'Bought', 'Invoiced and Awaiting Receipt'];

export function isOpenOrder(status: OrderStatus) {
  return OPEN_STATUSES.includes(status);
}

/** Direct supply cost = Σ custo do fornecedor per item (purchase cost is tracked in finalProductCost) */
export function calcDirectSupplyCost(items?: DirectSupplyOrderItem[]): number {
  return (items || []).reduce((s, i) => {
    const custoFornecedor = ((i.closingValue - (i.purchaseValue || 0)) * i.quantity) * (i.supplierPct || 0) / 100 + (i.supplierFreight || 0);
    return s + custoFornecedor;
  }, 0);
}

/**
 * Receita da empresa (base para percentuais que incidem sobre "o que fica com a empresa").
 *
 * No faturamento direto a venda é dividida entre a parte do fornecedor (Custo Fornecedor
 * = margem × % fornecedor + frete do fornecedor) e a parte que fica com a empresa.
 * Impostos e taxas percentuais devem incidir SOMENTE sobre a parte da empresa —
 * nunca sobre empresa + fornecedor somados.
 *
 * Em pedidos sem fornecimento direto o resultado é igual ao próprio valor de venda.
 */
export function calcCompanyRevenue(salesValue: number, directSupplyItems?: DirectSupplyOrderItem[]): number {
  return (salesValue || 0) - calcDirectSupplyCost(directSupplyItems);
}

/** Final cost = sum of all monetary R$ values from the Financial Section */
export function calcFinalCost(o: Partial<Order>): number {
  return (o.finalProductCost || 0)
    + (o.boletoCost || 0)
    + calcFreightTotal(o.freight)
    + (o.giftCost || 0)
    + (o.creditCostValue || 0)
    + (o.debitCostValue || 0)
    + (o.purchaseTaxValue || 0)
    + (o.salesTaxValue || 0)
    + calcDirectSupplyCost(o.directSupplyItems);
}

/** Partial cost = same as Final but uses initialProductCost with purchase tax applied to it */
export function calcPartialCost(o: Partial<Order> & { initialProductCost: number; purchaseTaxPercent: number }): number {
  const purchaseTaxOnInitial = (o.purchaseTaxPercent || 0) * (o.initialProductCost || 0) / 100;
  return (o.initialProductCost || 0)
    + (o.boletoCost || 0)
    + calcFreightTotal(o.freight)
    + (o.giftCost || 0)
    + (o.creditCostValue || 0)
    + (o.debitCostValue || 0)
    + purchaseTaxOnInitial
    + (o.salesTaxValue || 0)
    + calcDirectSupplyCost(o.directSupplyItems);
}

export function calcProfit(o: Partial<Order>): number {
  return (o.salesValue || 0) - calcFinalCost(o);
}

/** Backwards-compat: the table's "Valor" column shows the Sales Value */
export function calcTotal(o: Partial<Order>): number {
  return o.salesValue || 0;
}

/**
 * Valor de Venda do pedido = soma do valor projetado de cada produto × quantidade
 * (itens normais + fornecimento direto).
 *
 * Fonte ÚNICA usada tanto pelos modais (OrderModal/ProductModal) quanto pela lista
 * de pedidos, para que os valores correspondentes fiquem sempre consistentes.
 * Aceita qualquer objeto com { projectedValue, quantity } — inclusive itens vindos
 * da API mapeados a partir de valor_projetado / quantidade.
 */
type ValuedItem = { projectedValue?: number; quantity?: number };
export function calcOrderSalesValue(items?: ValuedItem[], directSupplyItems?: ValuedItem[]): number {
  const sum = (arr?: ValuedItem[]) =>
    (arr || []).reduce((s, i) => s + (i.projectedValue || 0) * (i.quantity || 0), 0);
  return sum(items) + sum(directSupplyItems);
}

const baseOrder = (over: Partial<Order>): Order => ({
  id: '', os: '', createdAt: Date.now(), orderDate: '', customer: '', cnpj: '', company: '', seller: '',
  ocAfPed: '', directBilling: false, supplier: '', invoice: '', invoiceSupplier: '',
  paymentMethods: [], installments: 1, deliveryDate: '', status: 'To Buy',
  isRMA: false, cancelled: false, observations: '',
  initialProductCost: 0, finalProductCost: 0, boletoCost: 0, giftCost: 0,
  creditCostPercent: 0, creditCostValue: 0, debitCostPercent: 0, debitCostValue: 0,
  purchaseTaxPercent: 0, purchaseTaxValue: 0, salesTaxPercent: 0, salesTaxValue: 0,
  salesValue: 0, items: [], directSupplyItems: [], freight: [],
  ...over,
});


const sampleOrders: Order[] = [
  baseOrder({
    id: '1', os: '1001', orderDate: '2026-04-01', customer: 'Tech Solutions Ltda', cnpj: '12.345.678/0001-90',
    company: 'Lucky Store', seller: 'Alcides', ocAfPed: 'OC-9982', invoice: 'NF-001',
    paymentMethods: ['Credit Card'], installments: 3, deliveryDate: '2026-04-15', status: 'Bought',
    initialProductCost: 1500, finalProductCost: 1500,
    creditCostPercent: 2, creditCostValue: 60, salesTaxPercent: 5, salesTaxValue: 150, salesValue: 3000,
    items: [
      { id: 'i1', name: 'Notebook Dell Inspiron', quantity: 2, status: 'Bought', projectedValue: 1400, purchaseValue: 1350, productDeliveryDate: '2026-04-14' },
      { id: 'i2', name: 'Mouse Logitech MX Master', quantity: 5, status: 'In Stock', projectedValue: 100, purchaseValue: 90, productDeliveryDate: '2026-04-20' },
    ],
  }),
  baseOrder({
    id: '2', os: '1002', orderDate: '2026-04-05', customer: 'Escritório Digital', cnpj: '98.765.432/0001-10',
    company: 'BTech', seller: 'Lucas', ocAfPed: 'AF-221', invoice: 'NF-002',
    paymentMethods: ['Boleto'], deliveryDate: '2026-04-20', status: 'To Buy',
    initialProductCost: 3200, finalProductCost: 3200, salesTaxPercent: 8, salesTaxValue: 480, salesValue: 6000,
    items: [
      { id: 'i3', name: 'Monitor LG 27" 4K', quantity: 3, status: 'To Buy', projectedValue: 2000, purchaseValue: 0, productDeliveryDate: '2026-04-19' },
      { id: 'i4', name: 'Teclado Mecânico Redragon', quantity: 3, status: 'To Buy', projectedValue: 400, purchaseValue: 0, productDeliveryDate: '2026-04-19' },
    ],
  }),
  baseOrder({
    id: '3', os: '1003', orderDate: '2026-03-20', customer: 'InfoShop Comércio', cnpj: '45.678.912/0001-55',
    company: 'AJJ', seller: 'Pedro', ocAfPed: 'PED-7710', invoice: 'NF-003',
    paymentMethods: ['Pix'], deliveryDate: '2026-04-10', status: 'Delivered',
    initialProductCost: 800, finalProductCost: 800, salesValue: 1500,
    items: [
      { id: 'i5', name: 'Impressora HP LaserJet', quantity: 1, status: 'In Stock', projectedValue: 1500, purchaseValue: 800, productDeliveryDate: '2026-04-09' },
    ],
  }),
  baseOrder({
    id: '4', os: '1004', orderDate: '2026-04-10', customer: 'StartUp Hub', cnpj: '11.222.333/0001-44',
    company: 'BTech', seller: 'Alcides', deliveryDate: '2026-05-01', status: 'To Buy',
    paymentMethods: ['Credit Card'], installments: 6,
    initialProductCost: 5000, finalProductCost: 0, salesValue: 9500,
    items: [{ id: 'i6', name: 'Servidor Dell PowerEdge', quantity: 1, status: 'To Buy', projectedValue: 9500, purchaseValue: 0 }],
  }),
  baseOrder({
    id: '5', os: '1005', orderDate: '2026-04-12', customer: 'RMA Cliente Antigo', cnpj: '22.333.444/0001-55',
    company: 'Lucky Store', seller: 'Lucas', ocAfPed: 'PED-RMA-005', invoice: 'NF-RMA-005',
    paymentMethods: ['Boleto'], deliveryDate: '2026-04-25', status: 'Received', isRMA: true,
    salesValue: 0,
    items: [{ id: 'i7', name: 'Notebook em garantia', quantity: 1, status: 'In Stock', projectedValue: 0, purchaseValue: 0, productDeliveryDate: '2026-04-26' }],
  }),
];

interface OrderContextType {
  orders: Order[];
  addOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  deleteOrder: (id: string) => void;
  updateItemStatus: (orderId: string, itemId: string, status: ItemStatus) => void;
  /** Returns the next OS number as a string (auto-increment) */
  nextOS: () => string;
  /** Returns the next sequential RMA number for a given parent OS, e.g. "14-1", "14-2" */
  nextRmaNumber: (parentOs: string) => string;
}

const OrderContext = createContext<OrderContextType | null>(null);

const today = () => new Date().toISOString().slice(0, 10);

const applyDelayCheck = (o: Order): Order => {
  if (o.cancelled) return { ...o, status: 'Cancelled' };
  if (o.status === 'Delivered' || o.status === 'Cancelled') return o;
  if (o.status !== 'Delayed' && o.deliveryDate && o.deliveryDate < today()) {
    return { ...o, status: 'Delayed' };
  }
  return o;
};

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() => sampleOrders.map(applyDelayCheck));

  const nextOS = useCallback(() => {
    const max = orders.reduce((m, o) => {
      if (o.isRMA) return m;
      const n = parseInt(o.os, 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 1000);
    return String(max + 1);
  }, [orders]);

  const nextRmaNumber = useCallback((parentOs: string) => {
    const osNum = parentOs.replace(/^OS[-\s]?/i, '').replace(/^-+/, '');
    const prefix = `RMA-${osNum}-`;
    const max = orders.reduce((m, o) => {
      if (!o.isRMA || !o.rmaNumber || !o.rmaNumber.startsWith(prefix)) return m;
      const n = parseInt(o.rmaNumber.slice(prefix.length), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `RMA-${osNum}-${max + 1}`;
  }, [orders]);

  const addOrder = useCallback((order: Order) => {
    setOrders(prev => [...prev, applyDelayCheck(order)]);
  }, []);

  const updateOrder = useCallback((order: Order) => {
    setOrders(prev => prev.map(o => o.id === order.id ? applyDelayCheck(order) : o));
  }, []);

  const deleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  const updateItemStatus = useCallback((orderId: string, itemId: string, status: ItemStatus) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      return { ...o, items: o.items.map(item => item.id === itemId ? { ...item, status } : item) };
    }));
  }, []);

  return (
    <OrderContext.Provider value={{ orders, addOrder, updateOrder, deleteOrder, updateItemStatus, nextOS, nextRmaNumber }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrders must be used within OrderProvider');
  return ctx;
}
