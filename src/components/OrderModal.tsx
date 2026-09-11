import { useState, useEffect, useRef, Fragment, KeyboardEvent, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Plus, Trash2, Printer, CheckCircle2, Circle, ClipboardList, Banknote, Package, Truck, Receipt, AlertTriangle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatarNumeroOS } from '@/lib/numero-os';
import { toast } from 'sonner';
import {
  Order, OrderItem, DirectSupplyOrderItem, ItemStatus, PaymentMethod, Company, Seller, OrderStatus, FreightCard,
  PaymentInstallment,
  ITEM_STATUS_COLORS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS,
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  calcFinalCost, calcPartialCost, calcDirectSupplyCost, calcProfit, calcFreightTotal,
  calcItemFinalValue,
} from '@/store/OrderStore';
import type { OrderPrefill } from '@/components/AddOrderChooser';
import { StatusTimeline } from '@/components/StatusTimeline';
import { useCreateOrder, useUpdateOrder, useUpdateOrderStatus, orderKeys } from '@/api/hooks/useOrders';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiError } from '@/api/client';
import type { CreatePedidoPayload, UpdatePedidoPayload, PedidoStatus } from '@/types/api';
import { LOJA_IDS, VENDEDOR_IDS, FORMA_PAGAMENTO_MAP } from '@/api/storeConfig';
import { useVendedores } from '@/hooks/useVendedores';

const emptyOrder = (os: string): Partial<Order> => ({
  os, createdAt: Date.now(),
  orderDate: format(new Date(), 'yyyy-MM-dd'), customer: '', cnpj: '', company: '', seller: '',
  ocAfPed: '', directBilling: false, supplier: '', invoice: '',
  paymentMethods: [], installments: 1,
  deliveryDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
  status: 'To Buy', isRMA: false, cancelled: false, observations: '',
  initialProductCost: 0, finalProductCost: 0, boletoCost: 0, giftCost: 0,
  creditCostPercent: 0, creditCostValue: 0, debitCostPercent: 0, debitCostValue: 0,
  purchaseTaxPercent: 0, purchaseTaxValue: 0, salesTaxPercent: 0, salesTaxValue: 0,
  salesValue: 0, items: [], directSupplyItems: [], freight: [],
  paymentDate: '', penaltyValue: 0, interestValue: 0, paymentMethod: '',
  paymentInstallments: 1, paymentInstallmentPlan: [], orderInstallmentPlan: [],
});

function toBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function parseBRL(s: string): number {
  const cleaned = s.replace(/[R$\s.]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}
function handleEnterBlur(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
}

/* ---------- Header status badge colors (presentation only) ---------- */
const STATUS_HEX: Record<string, [string, string, string]> = {
  'To Buy':                        ['#d68a16', '#fff6e8', '#f4dcb0'],
  'Bought':                        ['#3f5bd9', '#eef0fc', '#cdd4f5'],
  'Received':                      ['#16807c', '#e6f3f1', '#cfe8e3'],
  'To Invoice':                    ['#d68a16', '#fff6e8', '#f4dcb0'],
  'Invoiced and Received':         ['#137a42', '#e8f6ee', '#c7e8d3'],
  'Invoiced and Awaiting Receipt': ['#d68a16', '#fff6e8', '#f4dcb0'],
  'To Pack':                       ['#3f5bd9', '#eef0fc', '#cdd4f5'],
  'Ready for Delivery':            ['#16807c', '#e6f3f1', '#cfe8e3'],
  'Out for Delivery':              ['#7c5cd6', '#f1ecfb', '#ddd2f4'],
  'Delivered':                     ['#137a42', '#e8f6ee', '#c7e8d3'],
  'Delayed':                       ['#d24545', '#fceeee', '#f4d0d0'],
  'Cancelled':                     ['#d24545', '#fceeee', '#f4d0d0'],
};

const ORDER_MODAL_CSS = `
  .opm-root{font-family:'Sora','Inter',system-ui,sans-serif}
  .opm-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px;padding-right:8px}
  .opm-head h1{font-size:21px;font-weight:700;display:flex;align-items:center;gap:12px;color:#16273f;font-family:'Space Grotesk',sans-serif;margin:0}
  .opm-oschip{font-size:12px;font-weight:700;color:#15807c;background:#e6f3f1;border:1px solid #cfe8e3;padding:5px 11px;border-radius:8px;letter-spacing:.02em}
  .opm-badge{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;padding:6px 13px;border-radius:999px;border:1px solid}
  .opm-badge .opm-dot{width:8px;height:8px;border-radius:50%;background:currentColor}
  .opm-meta{display:flex;gap:18px;color:#6b7787;font-size:13px;flex-wrap:wrap}
  .opm-meta b{color:#16273f;font-weight:600}

  .opm-editor{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}
  .opm-formcol{display:flex;flex-direction:column;gap:16px;min-width:0}

  .opm-card{background:#fff;border:1px solid #e7ebf0;border-radius:16px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 8px 24px -12px rgba(20,35,55,.16);overflow:hidden;scroll-margin-top:14px}
  .opm-card>h2{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#15807c;padding:14px 18px;border-bottom:1px solid #e7ebf0;display:flex;align-items:center;gap:10px;background:#fcfdfe;margin:0}
  .opm-card>h2 .opm-h2-action{margin-left:auto}
  .opm-card .opm-body{padding:18px}
  .opm-card.opm-amber{border-color:#f0d9a8}
  .opm-card.opm-amber>h2{color:#b9791a;background:#fffaf0;border-bottom-color:#f0d9a8}

  .opm-root input:focus-visible,
  .opm-root textarea:focus-visible,
  .opm-root [role="combobox"]:focus-visible{
    border-color:#16807c !important;
    box-shadow:0 0 0 3px rgba(22,128,124,.14) !important;
    outline:none !important;
  }

  .opm-aside{position:sticky;top:0;display:flex;flex-direction:column;gap:14px}
  .opm-sum{background:#fff;border:1px solid #e7ebf0;border-radius:16px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 8px 24px -12px rgba(20,35,55,.16);overflow:hidden}
  .opm-sum>h3{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7787;padding:15px 18px 0;margin:0}
  .opm-sumbody{padding:14px 18px 18px}
  .opm-line{display:flex;justify-content:space-between;align-items:center;padding:9px 0;font-size:14px;border-bottom:1px dashed #e7ebf0}
  .opm-line:last-of-type{border-bottom:0}
  .opm-line .k{color:#6b7787}
  .opm-line .v{font-weight:600;color:#16273f;font-variant-numeric:tabular-nums}
  .opm-result{margin-top:6px;background:linear-gradient(155deg,#11716d,#0c4f4d);border-radius:14px;padding:18px;color:#eafaf6;position:relative;overflow:hidden}
  .opm-result::after{content:"";position:absolute;right:-30px;bottom:-50px;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,rgba(31,157,87,.4),transparent 70%)}
  .opm-result .lk{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a9ded5;position:relative}
  .opm-result .lv{font-size:30px;font-weight:800;line-height:1;margin-top:6px;position:relative;font-family:'Space Grotesk',sans-serif;font-variant-numeric:tabular-nums}
  .opm-marg{margin-top:14px;position:relative}
  .opm-marg .top{display:flex;justify-content:space-between;font-size:12px;color:#bfe8df;margin-bottom:6px}
  .opm-marg .top b{color:#fff;font-weight:700}
  .opm-mtrack{height:9px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden}
  .opm-mtrack i{display:block;height:100%;border-radius:99px;transition:width .4s}
  .opm-jump{background:#fff;border:1px solid #e7ebf0;border-radius:16px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 8px 24px -12px rgba(20,35,55,.16);padding:8px}
  .opm-jump a{display:block;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;color:#6b7787;text-decoration:none;transition:.15s}
  .opm-jump a:hover{background:#f7f9fb;color:#16273f}

  @media (max-width:980px){
    .opm-editor{grid-template-columns:1fr}
    .opm-aside{position:static;order:-1}
    .opm-jump{display:none}
  }
`;

interface Props {
  open: boolean;
  onClose: () => void;
  order?: Order | null;
  onSave: (order: Order) => void;
  onDelete?: (id: string) => void;
  nextOS?: () => string;
  /** Optional pre-fill data when creating from a quote */
  prefill?: OrderPrefill | null;
}


/* ===== Documento de impressao (Imprimir -> Salvar como PDF) =================
   Mesma mecanica do QuoteModal: o documento e montado num #opm-print-root
   pendurado no <body>, e a impressao esconde todo o resto. Sem isso o navegador
   imprimiria o modal como ele esta na tela — caixas de input, botoes e tudo —
   e o DialogContent do Radix e position:fixed com altura travada, entao saia
   cortado no meio da pagina.

   Larguras de coluna sao fixas (table-layout:fixed) para a tabela nunca
   estourar a folha. O breakpoint de celular do app fica em 700px, ABAIXO dos
   734px uteis de uma A4, senao o papel herdaria o layout de duas colunas. */
const ORDER_PRINT_CSS = `
  #opm-print-root{display:none}
  @media print{
    @page{size:A4;margin:10mm}
    html,body{background:#fff !important}
    body>*{display:none !important}
    body>#opm-print-root{display:block !important}
  }
  .op-doc{font-family:'IBM Plex Sans','Inter',system-ui,sans-serif;color:#16273f;
    font-size:10.5px;line-height:1.5;background:#fff;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    display:flex;flex-direction:column;gap:8px}

  .op-top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;
    padding-bottom:9px;border-bottom:2px solid #16273f}
  .op-loja{display:flex;flex-direction:column;align-items:flex-start;gap:5px}
  .op-logo{display:block;width:auto;max-height:42px}
  .op-cnpj{font-size:10.5px;color:#5b6b82;font-variant-numeric:tabular-nums}
  .op-id{text-align:right;display:flex;flex-direction:column;gap:1px;align-items:flex-end}
  .op-tipo{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#5b6b82}
  .op-num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:24px;font-weight:600;
    line-height:1;font-variant-numeric:tabular-nums}
  .op-origem{font-size:10.5px;color:#5b6b82;font-variant-numeric:tabular-nums;margin-top:1px}
  .op-pill{display:inline-block;margin-top:4px;font-size:10px;font-weight:600;padding:2px 9px;
    border-radius:999px;border:1px solid #c7e8d3;background:#e8f6ee;color:#137a42}

  /* 3 colunas, e nao 4: com Empresa e Cliente separados sao 9 campos, que em 4
     colunas deixariam a ultima linha com um item e tres buracos. Em 3 fecham
     exatas, e cada campo fica mais largo — ajuda nome de empresa comprido. */
  .op-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:7px 16px}
  .op-meta>div{display:flex;flex-direction:column;min-width:0}
  .op-meta .k{font-size:9px;font-weight:600;letter-spacing:.11em;text-transform:uppercase;color:#93a3b6}
  .op-meta .v{font-size:11px;font-weight:500;overflow-wrap:anywhere}

  .op-sec{display:flex;flex-direction:column;gap:5px;break-inside:avoid}
  .op-sec>h2{margin:0;font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
    color:#15807c;display:flex;align-items:center;gap:9px}
  .op-sec>h2::after{content:"";flex:1;height:1px;background:#d9e1ea}

  /* Condicoes herdadas da cotacao. Mesmo desenho do .qp-terms do timbrado da
     cotacao — e o mesmo bloco, e o cliente reconhece de um papel para o outro. */
  .op-terms{border:1px solid #d9e1ea;border-radius:8px;padding:8px 12px;background:#fafcff;
    display:flex;flex-direction:column;gap:4px;break-inside:avoid}
  .op-terms>div{font-size:11px}
  .op-terms .k{color:#15807c;font-weight:700}
  .op-terms .v{color:#1f2d3d}

  .op-tbl{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
  .op-tbl thead{display:table-header-group}
  .op-tbl th{text-align:left;font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
    color:#5b6b82;padding:4px 6px;background:#f3f6fa;border-bottom:1px solid #d9e1ea}
  .op-tbl td{padding:4.5px 6px;border-bottom:1px solid #d9e1ea;vertical-align:top;overflow-wrap:anywhere}
  .op-tbl tbody tr{break-inside:avoid}
  .op-tbl .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  /* Numero nao quebra; TITULO quebra. Sem isto, "Valor de compra" e
     "Valor de venda" estouravam a coluna e um invadia o outro. */
  .op-tbl th.r{white-space:normal}
  .op-tbl .c{text-align:center}
  .op-tbl tfoot td{border-bottom:none;padding-top:5px;font-weight:600}
  .op-idx{font-family:'IBM Plex Mono',ui-monospace,monospace;color:#93a3b6}
  .op-box{display:inline-block;width:12px;height:12px;border:1.5px solid #5b6b82;border-radius:2.5px}
  /* sub-compra: recuada sob o item, sem borda propria para ler como continuacao */
  .op-sub td{border-bottom:none;padding-top:1px;padding-bottom:1px;color:#5b6b82;font-size:10px}
  .op-sub .op-de{padding-left:14px}
  .op-sub-fim td{border-bottom:1px solid #d9e1ea;padding-bottom:4.5px}

  .op-dupla{display:grid;grid-template-columns:1.35fr 1fr;gap:18px;align-items:start;break-inside:avoid}
  .op-custos{display:grid;grid-template-columns:repeat(2,1fr);gap:5px 14px}
  .op-campo{display:flex;justify-content:space-between;gap:8px;padding-bottom:3px;border-bottom:1px solid #d9e1ea}
  .op-campo .k{font-size:9.5px;color:#5b6b82}
  .op-campo .v{font-size:11.5px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}

  .op-resumo{display:flex;flex-direction:column;gap:1px;background:#d9e1ea;border:1px solid #d9e1ea;
    border-radius:6px;overflow:hidden}
  .op-resumo>div{background:#fff;padding:6px 10px;display:flex;justify-content:space-between;
    align-items:baseline;gap:10px}
  .op-resumo .k{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#93a3b6}
  .op-resumo .v{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
  .op-resumo .op-destaque{background:#0f5f5c;color:#eafaf6}
  .op-resumo .op-destaque .k{color:#9fd9d4}
  .op-resumo .op-destaque .v{font-size:16px}

  .op-obs{font-size:11px;color:#5b6b82;border:1px solid #d9e1ea;border-radius:6px;padding:7px 10px;min-height:30px}
  .op-assina{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:4px;break-inside:avoid}
  .op-assina div{border-top:1px solid #16273f;padding-top:5px;font-size:9.5px;color:#5b6b82;letter-spacing:.04em}
  .op-foot{margin-top:4px;padding-top:8px;border-top:1px solid #d9e1ea;
    font-size:7.5px;color:#93a3b6;line-height:1.5}
`;


/** Identificacao da loja no documento impresso.
 *
 *  O rodape era UMA STRING FIXA por loja, com "Fone/Fax +55 81 3228.8509" e o
 *  e-mail da empresa. Resultado: toda OS saia com o mesmo telefone e o mesmo
 *  e-mail, tivesse sido feita pelo Alcides, pelo Lucas ou pelo Pedro — o
 *  cliente ligava para um numero generico em vez de falar com quem atendeu.
 *  E o mesmo defeito que a cotacao tinha, so que aqui nem cartao existia.
 *
 *  Agora a linha e montada: CNPJ e endereco vem da loja, telefone e e-mail vem
 *  do VENDEDOR que assinou. Por isso `rodape` virou `endereco` — a parte fixa. */
const ENDERECO_GRUPO_OS =
  'Rua Marechal Deodoro Nr 300 SL 1107, Encruzilhada Recife, PE · CEP 52030-172';

const OP_LOJA: Record<string, { logo: string; cnpj: string; endereco: string; email: string }> = {
  'Lucky Store': {
    logo: '/quote-header.png',
    cnpj: '11.849.935/0001-63',
    endereco: ENDERECO_GRUPO_OS,
    // Usado so quando o vendedor da OS nao tem cadastro com contato: melhor um
    // e-mail da empresa do que um documento sem nenhuma forma de contato.
    email: 'contato@luckystore.com.br',
  },
  'BTech': {
    logo: '/btech-header.jpeg',
    cnpj: '54.677.704/0001-22',
    endereco: ENDERECO_GRUPO_OS,
    email: 'btechstore@outlook.com.br',
  },
  'AJJ': {
    logo: '/quote-header.png',
    cnpj: '11.849.935/0001-63',
    endereco: ENDERECO_GRUPO_OS,
    email: 'contato@luckystore.com.br',
  },
};

/** A linha do pe da OS: identificacao da empresa + contato de quem assinou. */
function rodapeDaOS(
  loja: { cnpj: string; endereco: string; email: string },
  vendedor?: { nome: string; email: string | null; phone: string | null },
): string {
  return [
    `CNPJ ${loja.cnpj}`,
    loja.endereco,
    vendedor?.phone,
    vendedor?.email || loja.email,
  ].filter(Boolean).join(' · ');
}

/** Ordem de servico em papel: documento, nao captura da tela. */
function OrderPrintTemplate({ form, valores, vendedor }: {
  /** O estado do modal e Partial<Order> — todo campo pode estar vazio enquanto
   *  o pedido esta sendo preenchido, e o papel tem que aguentar isso. */
  form: Partial<Order>;
  /** Cadastro do vendedor da OS — de onde saem o telefone e o e-mail do pe. */
  vendedor?: { nome: string; email: string | null; phone: string | null };
  valores: {
    custoInicial: number; custoFinal: number; freteTotal: number;
    creditoValor: number; debitoValor: number; impCompraValor: number; impVendaValor: number;
    custoTotal: number; lucro: number; margem: number;
  };
}) {
  const loja = OP_LOJA[form.company ?? ''] ?? OP_LOJA['Lucky Store'];
  const itens = form.items || [];
  const fretes = form.freight || [];
  const pct = (v?: number) => `${(v || 0).toString().replace('.', ',')}%`;
  // 'T12:00:00' evita que o fuso jogue a data para o dia anterior — mesmo
  // truque que o modal ja usa nos campos de data.
  const dt = (v?: string) => (v ? format(new Date(v + 'T12:00:00'), 'dd/MM/yyyy') : '—');

  // Condicoes combinadas na cotacao que gerou o pedido. Nao sao campos do
  // pedido: vem da cotacao junto com o numero dela. Sao as MESMAS quatro linhas
  // do timbrado da cotacao — o cliente fechava vendo garantia e previsao de
  // entrega, e a OS chegava a ele sem nenhuma das duas.
  //
  // Cada uma so entra se estiver preenchida, igual a cotacao faz: linha vazia
  // com travessao em documento que vai ao cliente e pior do que linha ausente.
  // Pedido criado do zero nao tem cotacao de origem, e o bloco inteiro some.
  const rotuloForma = (m?: string) =>
    (m ? (PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m) : '');
  const formasDePagamento = form.paymentMethod
    ? rotuloForma(form.paymentMethod)
    : (form.paymentMethods || []).map(rotuloForma).filter(Boolean).join(', ');

  const t = form.quoteTerms;
  const termos: [string, string][] = ([
    t?.deliveryForecast ? ['Previsão de Entrega', dt(t.deliveryForecast)] : null,
    t?.paymentMethod
      ? ['Forma de Pagamento',
         PAYMENT_METHOD_LABELS[t.paymentMethod as PaymentMethod] ?? t.paymentMethod]
      : null,
    t?.paymentDetails?.trim() ? ['Detalhes do Pagamento', t.paymentDetails.trim()] : null,
    t?.warranty?.trim() ? ['Garantia', t.warranty.trim()] : null,
  ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null);

  return (
    <div className="op-doc">
      <div className="op-top">
        <div className="op-loja">
          <img className="op-logo" src={loja.logo} alt={form.company} />
          <span className="op-cnpj">CNPJ {loja.cnpj}</span>
        </div>
        <div className="op-id">
          <span className="op-tipo">Ordem de Serviço</span>
          <span className="op-num">{formatarNumeroOS(form.os)}</span>
          {/* Só aparece quando o pedido veio de uma cotação. Fica aqui, no bloco
              de identidade do documento, e não na grade de dados abaixo: a grade
              tem 4 colunas por linha e um nono campo abriria uma linha nova com
              três buracos. Aqui ele espelha o CNPJ sob o logo, do outro lado. */}
          {form.sourceQuoteNumber != null && (
            <span className="op-origem">Cotação nº {form.sourceQuoteNumber}</span>
          )}
          <span className="op-pill">{form.status ? (ORDER_STATUS_LABELS[form.status] ?? form.status) : '—'}</span>
        </div>
      </div>

      <div className="op-meta">
        <div><span className="k">Empresa</span><span className="v">{form.customerCompany?.trim() || form.customer || '—'}</span></div>
        <div><span className="k">Cliente</span><span className="v">{form.customerContact || '—'}</span></div>
        <div><span className="k">CPF/CNPJ</span><span className="v">{form.cnpj || '—'}</span></div>
        <div><span className="k">Vendedor</span><span className="v">{form.seller || '—'}</span></div>
        <div><span className="k">OC/AF/PED</span><span className="v">{form.ocAfPed || '—'}</span></div>
        <div><span className="k">Data do pedido</span><span className="v">{dt(form.orderDate)}</span></div>
        <div><span className="k">Data de entrega</span><span className="v">{dt(form.deliveryDate)}</span></div>
        <div><span className="k">Nota fiscal</span><span className="v">{form.invoice || '—'}</span></div>
        <div><span className="k">Faturamento direto</span><span className="v">{form.directBilling ? 'Sim' : 'Não'}</span></div>
      </div>

      {termos.length > 0 && (
        <div className="op-sec">
          <h2>Condições da cotação{form.sourceQuoteNumber != null ? ` nº ${form.sourceQuoteNumber}` : ''}</h2>
          <section className="op-terms">
            {termos.map(([k, v]) => (
              <div key={k}><span className="k">{k}</span> - <span className="v">{v}</span></div>
            ))}
          </section>
        </div>
      )}

      <div className="op-sec">
        <h2>Itens do pedido</h2>
        <table className="op-tbl">
          <colgroup>
            <col style={{ width: '5%' }} /><col style={{ width: '34%' }} /><col style={{ width: '7%' }} />
            <col style={{ width: '20%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th><th>Produto</th><th className="c">Qtd</th>
              <th>Fornecedor</th><th className="r">Valor de compra</th><th className="r">Valor de venda</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 && (
              <tr><td colSpan={6} className="c">Nenhum item</td></tr>
            )}
            {itens.map((item, idx) => {
              const subs = item.subPurchases || [];
              // Fornecedor mora nas sub-compras: um item pode vir de mais de
              // uma. Com uma so, o nome cabe na propria linha do item; com
              // varias, cada sub-compra ja mostra o seu logo abaixo.
              const fornecedor = subs.length === 1 ? (subs[0].supplier || '—')
                : subs.length === 0 ? '—' : '';
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td className="op-idx">{String(idx + 1).padStart(2, '0')}</td>
                    <td>{item.name || '—'}</td>
                    <td className="c">{item.quantity || 0}</td>
                    <td>{fornecedor}</td>
                    <td className="r">{calcItemFinalValue(item) ? toBRL(calcItemFinalValue(item)) : '—'}</td>
                    <td className="r">{toBRL((item.projectedValue || 0) * (item.quantity || 0))}</td>
                  </tr>
                  {subs.length > 1 && subs.map((sc, k) => (
                    <tr key={sc.id} className={`op-sub${k === subs.length - 1 ? ' op-sub-fim' : ''}`}>
                      <td />
                      <td className="op-de">↳ {sc.buyer ? `${sc.buyer} · ` : ''}{dt(sc.purchaseDate)}</td>
                      <td className="c">{sc.selectedQuantity || 0}</td>
                      <td>{sc.supplier || '—'}</td>
                      <td className="r">{sc.purchaseValue ? toBRL(sc.purchaseValue) : '—'}</td>
                      <td className="r" />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              {/* Um numero por coluna de dinheiro: o que foi pago aos
                  fornecedores e o que foi cobrado do cliente. Somados a partir
                  das MESMAS linhas impressas acima — o total do rodape do
                  documento tem que fechar com o que esta na folha. */}
              <td colSpan={4} className="r">Totais</td>
              <td className="r">{toBRL(itens.reduce((s, i) => s + calcItemFinalValue(i), 0))}</td>
              <td className="r">{toBRL(itens.reduce((s, i) => s + (i.projectedValue || 0) * (i.quantity || 0), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {fretes.length > 0 && (
        <div className="op-sec">
          <h2>Frete</h2>
          <table className="op-tbl">
            <colgroup>
              <col style={{ width: '6%' }} /><col style={{ width: '48%' }} /><col style={{ width: '16%' }} />
              <col style={{ width: '20%' }} /><col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr><th>#</th><th>Entregador</th><th className="r">Valor</th><th>Data</th><th className="c">Pago</th></tr>
            </thead>
            <tbody>
              {fretes.map((f, idx) => (
                <tr key={f.id}>
                  <td className="op-idx">{String(idx + 1).padStart(2, '0')}</td>
                  <td>{f.deliveryPerson || '—'}</td>
                  <td className="r">{toBRL(f.value || 0)}</td>
                  <td>{dt(f.deliveryDate)}</td>
                  <td className="c">{f.pago ? '✓' : <span className="op-box" />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2} className="r">Total</td><td className="r">{toBRL(valores.freteTotal)}</td><td colSpan={2} /></tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="op-dupla">
        <div className="op-sec">
          <h2>Financeiro</h2>
          <div className="op-custos">
            <div className="op-campo"><span className="k">Custo inicial produto</span><span className="v">{toBRL(valores.custoInicial)}</span></div>
            <div className="op-campo"><span className="k">Custo final produto</span><span className="v">{toBRL(valores.custoFinal)}</span></div>
            <div className="op-campo"><span className="k">Custo boleto</span><span className="v">{toBRL(form.boletoCost || 0)}</span></div>
            <div className="op-campo"><span className="k">Frete</span><span className="v">{toBRL(valores.freteTotal)}</span></div>
            <div className="op-campo"><span className="k">Brinde</span><span className="v">{toBRL(form.giftCost || 0)}</span></div>
            <div className="op-campo"><span className="k">Crédito · {pct(form.creditCostPercent)}</span><span className="v">{toBRL(valores.creditoValor)}</span></div>
            <div className="op-campo"><span className="k">Débito · {pct(form.debitCostPercent)}</span><span className="v">{toBRL(valores.debitoValor)}</span></div>
            <div className="op-campo"><span className="k">Imp. compra · {pct(form.purchaseTaxPercent)}</span><span className="v">{toBRL(valores.impCompraValor)}</span></div>
          </div>
        </div>
        <div className="op-sec">
          <h2>Resumo</h2>
          <div className="op-resumo">
            <div><span className="k">Valor de venda</span><span className="v">{toBRL(form.salesValue || 0)}</span></div>
            <div><span className="k">Custo total</span><span className="v">{toBRL(valores.custoTotal)}</span></div>
            <div><span className="k">Margem</span><span className="v">{(form.salesValue || 0) > 0 ? `${valores.margem.toFixed(1)}%` : '—'}</span></div>
            <div className="op-destaque"><span className="k">Lucro do pedido</span><span className="v">{toBRL(valores.lucro)}</span></div>
          </div>
        </div>
      </div>

      <div className="op-sec">
        <h2>Pagamento e observações</h2>
        <div className="op-meta">
          {/* Saia cru: "Credit Card" no papel que vai ao cliente. O mapa de
              rotulos ja existia e era usado so na tela. */}
          <div><span className="k">Forma</span><span className="v">{formasDePagamento || '—'}</span></div>
          <div><span className="k">Parcelas</span><span className="v">{form.paymentInstallments || form.installments || 1}</span></div>
          <div><span className="k">Data pagamento</span><span className="v">{dt(form.paymentDate)}</span></div>
          <div><span className="k">Multa · Juros</span><span className="v">{toBRL(form.penaltyValue || 0)} · {toBRL(form.interestValue || 0)}</span></div>
        </div>
        <div className="op-obs">{form.observations?.trim() || '—'}</div>
      </div>

      <div className="op-assina">
        <div>Separado por</div><div>Conferido por</div><div>Data</div>
      </div>

      <div className="op-foot">{rodapeDaOS(loja, vendedor)}</div>
    </div>
  );
}

/** Chave da tentativa de salvar, mandada no header Idempotency-Key.
 *
 * crypto.randomUUID exige contexto seguro (https ou localhost). Em producao
 * sempre tem; o fallback e para nao ficar sem chave num http de rede interna,
 * onde o valor seria `undefined` e a protecao simplesmente sumiria. Nao precisa
 * ser criptografico: precisa nao repetir. */
function novaChaveIdempotencia(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return `os-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function OrderModal({ open, onClose, order, onSave, nextOS, prefill }: Props) {
  const [form, setForm] = useState<Partial<Order>>(() => emptyOrder(nextOS?.() || ''));
  const [sourceQuoteId, setSourceQuoteId] = useState<string | undefined>(undefined);
  const isEdit = !!order;

  const qc = useQueryClient();
  const { data: vendedoresData } = useVendedores();
  const vendedores = vendedoresData?.items ?? [];
  // Mesmo motivo do QuoteModal: /vendedores traz todas as lojas e o mesmo nome
  // se repete entre elas, entao casar so pelo nome gravava o pedido no cadastro
  // do vendedor de outra empresa. Procura dentro da loja escolhida primeiro.
  const vendedorPorNome = (nome: string, empresa?: string) => {
    const idLoja = empresa ? LOJA_IDS[empresa] : undefined;
    const naLoja = idLoja
      ? vendedores.find(v => v.nome === nome && v.id_loja === idLoja)
      : undefined;
    return naLoja ?? vendedores.find(v => v.nome === nome);
  };
  const vendorIdByName = (nome: string, empresa?: string) =>
    vendedorPorNome(nome, empresa)?.id ?? VENDEDOR_IDS[nome] ?? '';

  /** Quem assinou esta OS — o pé do documento traz o telefone e o e-mail dele.
   *
   *  Resolve pelo NOME porque o pedido não guarda o id do vendedor (a cotação
   *  guarda; o pedido não). Com um cadastro por pessoa isso é suficiente. */
  const vendedorDaOS = vendedorPorNome(form.seller ?? '', form.company as string | undefined);

  const { mutate: createOrder, isPending: isCreating } = useCreateOrder();
  const { mutate: updateOrder, isPending: isUpdating } = useUpdateOrder(order?.id ?? '');
  const { mutate: updateOrderStatus, isPending: isUpdatingStatus } = useUpdateOrderStatus(order?.id ?? '');
  const isPending = isCreating || isUpdating || isUpdatingStatus;

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingDsField, setEditingDsField] = useState<{ id: string; field: string } | null>(null);
  const [editingDsValue, setEditingDsValue] = useState('');
  const [orderDateOpen, setOrderDateOpen] = useState(false);
  const [deliveryDateOpen, setDeliveryDateOpen] = useState(false);

  /* Chave da tentativa de salvar em curso. Nasce no primeiro clique em "Criar
   * Pedido" e sobrevive a falha, de proposito: se o pedido foi criado e so a
   * resposta se perdeu, o segundo clique manda a MESMA chave e o backend
   * devolve o pedido que ja existe, em vez de abrir outro e gastar mais um
   * numero de OS.
   *
   * Zerada em dois pontos, e os dois importam. No sucesso, porque o proximo
   * pedido e outro pedido. E na troca de formulario (o useEffect abaixo),
   * porque senao uma tentativa que ficou em duvida contaminaria o pedido
   * SEGUINTE: o vendedor abriria um pedido novo, salvaria, e receberia de volta
   * o pedido antigo. */
  const chaveTentativa = useRef<string | null>(null);

  useEffect(() => {
    if (order) {
      setForm({ ...order, freight: order.freight || [], directSupplyItems: order.directSupplyItems || [] });
      setSourceQuoteId(undefined);
    } else if (prefill) {
      setForm({
        ...emptyOrder(nextOS?.() || ''),
        customer: prefill.customer,
        customerCompany: prefill.customerCompany || '',
        customerContact: prefill.customerContact || '',
        cnpj: prefill.cnpj,
        company: prefill.company,
        seller: prefill.seller,
        salesValue: prefill.salesValue,
        directBilling: prefill.directBilling ?? false,
        items: prefill.items.map(i => ({
          id: i.id, name: i.name, quantity: i.quantity, status: 'To Buy' as ItemStatus,
          projectedValue: i.projectedValue, purchaseValue: 0,
        })),
        directSupplyItems: (prefill.directSupplyItems || []).map(i => ({ ...i })),
      });
      setSourceQuoteId(prefill.sourceQuoteId);
    } else {
      setForm(emptyOrder(nextOS?.() || ''));
      setSourceQuoteId(undefined);
    }
    setEditingField(null);
    chaveTentativa.current = null;
  }, [order, open, nextOS, prefill]);

  const set = (k: keyof Order, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  /* ---------------- Derived calculations ---------------- */
  const derivedInitialProductCost = useMemo(
    () => {
      const regular = (form.items || []).reduce((s, i) => s + (i.projectedValue || 0) * (i.quantity || 0), 0);
      const ds = (form.directSupplyItems || []).reduce((s, i) => s + (i.projectedValue || 0) * (i.quantity || 0), 0);
      return regular + ds;
    },
    [form.items, form.directSupplyItems]
  );
  const derivedFinalProductCost = useMemo(
    () => {
      // item.purchaseValue já é o total comprado (soma das sub-compras, ver
      // OrderStore.tsx SubPurchase/OrderItem) — só ds items usam valor por unidade.
      const regular = (form.items || []).reduce((s, i) => s + (i.purchaseValue || 0), 0);
      const ds = (form.directSupplyItems || []).reduce((s, i) => s + (i.purchaseValue || 0) * (i.quantity || 0), 0);
      return regular + ds;
    },
    [form.items, form.directSupplyItems]
  );
  const derivedFreightTotal = useMemo(() => calcFreightTotal(form.freight), [form.freight]);

  const dsItems = form.directSupplyItems || [];
  /** Parte da venda que vai para o fornecedor direto (margem × % + frete). */
  const directSupplyCost = useMemo(() => calcDirectSupplyCost(form.directSupplyItems), [form.directSupplyItems]);
  /**
   * Base dos percentuais que incidem sobre "o que fica com a empresa".
   * No faturamento direto a venda é dividida entre fornecedor e empresa — o imposto
   * de venda incide apenas sobre a parte da empresa, não sobre o valor cheio.
   */
  const companyRevenue = (form.salesValue || 0) - directSupplyCost;

  const computed = useMemo(() => {
    const sales = form.salesValue || 0;
    const finalProd = derivedFinalProductCost;
    return {
      creditCostValue: ((form.creditCostPercent || 0) * sales) / 100,
      debitCostValue: ((form.debitCostPercent || 0) * sales) / 100,
      purchaseTaxValue: ((form.purchaseTaxPercent || 0) * finalProd) / 100,
      salesTaxValue: ((form.salesTaxPercent || 0) * companyRevenue) / 100,
    };
  }, [form.salesValue, companyRevenue, derivedFinalProductCost, form.creditCostPercent, form.debitCostPercent, form.purchaseTaxPercent, form.salesTaxPercent]);

  const finalCost = calcFinalCost({
    ...form, finalProductCost: derivedFinalProductCost, freight: form.freight, ...computed,
    directSupplyItems: dsItems,
  });
  const partialCost = calcPartialCost({
    ...form, initialProductCost: derivedInitialProductCost,
    purchaseTaxPercent: form.purchaseTaxPercent || 0,
    freight: form.freight, ...computed, directSupplyItems: dsItems,
  });
  const profit = calcProfit({
    ...form, finalProductCost: derivedFinalProductCost, freight: form.freight, ...computed,
    directSupplyItems: dsItems,
  });

  /* ---------------- Items ---------------- */
  const addItem = () => {
    const items = [...(form.items || []), {
      id: crypto.randomUUID(), name: '', quantity: 1, status: 'To Buy' as ItemStatus,
      projectedValue: 0, purchaseValue: 0,
    }];
    set('items', items);
  };

  const updateItem = (id: string, field: keyof OrderItem, value: any) => {
    set('items', (form.items || []).map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeItem = (id: string) => {
    set('items', (form.items || []).filter(i => i.id !== id));
  };

  /* ---------------- Freight ---------------- */
  const addFreight = () => set('freight', [...(form.freight || []), {
    id: crypto.randomUUID(), deliveryPerson: '', value: 0,
    deliveryDate: format(new Date(), 'yyyy-MM-dd'),
  } as FreightCard]);
  const updateFreight = (id: string, field: keyof FreightCard, value: any) => {
    set('freight', (form.freight || []).map(f => f.id === id ? { ...f, [field]: value } : f));
  };
  const removeFreight = (id: string) => set('freight', (form.freight || []).filter(f => f.id !== id));

  /* ---------------- Direct supply items ---------------- */
  const addDsItem = () => set('directSupplyItems', [...(form.directSupplyItems || []), {
    id: crypto.randomUUID(), name: '', quantity: 1, projectedValue: 0, purchaseValue: 0, closingValue: 0,
    supplier: '', supplierPct: 0, supplierFreight: 0, supplierInvoice: '',
  } as DirectSupplyOrderItem]);
  const updateDsItem = (id: string, field: keyof DirectSupplyOrderItem, value: any) => {
    set('directSupplyItems', (form.directSupplyItems || []).map(i => i.id === id ? { ...i, [field]: value } : i));
  };
  const removeDsItem = (id: string) => set('directSupplyItems', (form.directSupplyItems || []).filter(i => i.id !== id));

  /* ---------------- Payment methods ---------------- */
  const togglePayment = (m: PaymentMethod) => {
    const cur = form.paymentMethods || [];
    set('paymentMethods', cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m]);
  };
  const hasCredit = (form.paymentMethods || []).includes('Credit Card') || (form.paymentMethods || []).includes('Boleto');

  /* ---------------- Cancellation ---------------- */
  const handleCancelToggle = (v: boolean) => {
    setForm(prev => ({
      ...prev,
      cancelled: v,
      status: v ? 'Cancelled' : (prev.status === 'Cancelled' ? 'To Buy' : prev.status),
    }));
  };

  /* ---------------- Save (with validation) ---------------- */
  const handleSave = () => {
    // Empresa e Vendedor entram aqui porque o backend os exige (id_loja e
    // id_vendedor sao NOT NULL). Em branco eles viravam '' no payload e o
    // Pydantic devolvia 422 de uuid_parsing — erro tecnico na cara do vendedor,
    // depois de ele ja ter preenchido o formulario inteiro.
    const missing: string[] = [];
    if (!form.orderDate) missing.push('Data do Pedido');
    if (!form.deliveryDate) missing.push('Data de Entrega');
    if (!(form.customer || '').trim()) missing.push('Empresa do cliente');
    if (!(form.ocAfPed || '').trim()) missing.push('OC/AF/PED');
    if (!(form.company || '').trim()) missing.push('Empresa');
    if (!(form.seller || '').trim()) missing.push('Vendedor');
    if (missing.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${missing.join(', ')}`);
      return;
    }

    // Backend exige valor_projetado > 0 (ProdutoCreate.valor_projetado = Field(gt=0)).
    // Antes, item sem Custo Projetado preenchido virava silenciosamente R$0,01 (Math.max(0.01, ...))
    // e ficava assim pra sempre, corrompendo o Custo Inicial do pedido sem o vendedor perceber.
    const semCustoProjetado = [
      ...(form.items || []),
      ...(form.directSupplyItems || []),
    ].filter(i => !(i.projectedValue > 0));
    if (semCustoProjetado.length > 0) {
      const nomes = semCustoProjetado.map(i => i.name || 'item sem nome').join(', ');
      toast.error(`Informe o Custo Projetado (maior que zero) para: ${nomes}`);
      return;
    }

    const o: Order = {
      id: order?.id || crypto.randomUUID(),
      os: form.os || '',
      createdAt: form.createdAt || Date.now(),
      orderDate: form.orderDate || '',
      customer: form.customer || '',
      cnpj: form.cnpj || '',
      company: (form.company || '') as Company,
      seller: (form.seller || '') as Seller,
      ocAfPed: form.ocAfPed || '',
      directBilling: !!form.directBilling,
      supplier: form.supplier || '',
      invoice: form.invoice || '',
      invoiceSupplier: form.invoiceSupplier || '',
      paymentMethods: form.paymentMethods || [],
      installments: form.installments || 1,
      deliveryDate: form.deliveryDate || '',
      status: form.cancelled ? 'Cancelled' : (form.status || 'To Buy'),
      isRMA: !!form.isRMA,
      cancelled: !!form.cancelled,
      observations: form.observations || '',
      initialProductCost: derivedInitialProductCost,
      finalProductCost: derivedFinalProductCost,
      boletoCost: form.boletoCost || 0,
      giftCost: form.giftCost || 0,
      creditCostPercent: form.creditCostPercent || 0,
      creditCostValue: computed.creditCostValue,
      debitCostPercent: form.debitCostPercent || 0,
      debitCostValue: computed.debitCostValue,
      purchaseTaxPercent: form.purchaseTaxPercent || 0,
      purchaseTaxValue: computed.purchaseTaxValue,
      salesTaxPercent: form.salesTaxPercent || 0,
      salesTaxValue: computed.salesTaxValue,
      salesValue: form.salesValue || 0,
      items: form.items || [],
      directSupplyItems: form.directSupplyItems || [],
      freight: form.freight || [],
      paymentDate: form.paymentDate || '',
      penaltyValue: form.penaltyValue || 0,
      interestValue: form.interestValue || 0,
      paymentMethod: (form.paymentMethod || '') as PaymentMethod | '',
      paymentInstallments: form.paymentInstallments || 1,
      paymentInstallmentPlan: form.paymentInstallmentPlan || [],
      orderInstallmentPlan: form.orderInstallmentPlan || [],
    };

    const onApiError = (err: unknown) => toast.error(getApiError(err));

    const pagamentoPayload = {
      data_pagamento: o.paymentDate || undefined,
      multa: o.penaltyValue ? String(o.penaltyValue) : undefined,
      juros: o.interestValue ? String(o.interestValue) : undefined,
      forma_pagamento_efetiva: o.paymentMethod
        ? (FORMA_PAGAMENTO_MAP[o.paymentMethod as string] ?? o.paymentMethod)
        : undefined,
      num_parcelas_efetivas: o.paymentInstallments > 1 ? o.paymentInstallments : undefined,
      plano_parcelas: o.paymentInstallmentPlan?.length ? o.paymentInstallmentPlan : undefined,
      plano_parcelas_pedido: o.orderInstallmentPlan?.length ? o.orderInstallmentPlan : undefined,
    };

    const custoPayload = {
      custo_produto_inicial: String(derivedInitialProductCost),
      custo_produto_final: String(derivedFinalProductCost),
      custo_boleto: String(o.boletoCost || 0),
      brinde: String(o.giftCost || 0),
      pct_custo_credito: String(o.creditCostPercent || 0),
      custo_credito: String(computed.creditCostValue),
      pct_custo_debito: String(o.debitCostPercent || 0),
      custo_debito: String(computed.debitCostValue),
      pct_imposto_compra: String(o.purchaseTaxPercent || 0),
      imposto_compra: String(computed.purchaseTaxValue),
      pct_imposto_venda: String(o.salesTaxPercent || 0),
      imposto_venda: String(computed.salesTaxValue),
    };

    if (isEdit) {
      const payload: UpdatePedidoPayload = {
        data_pedido: o.orderDate,
        data_entrega: o.deliveryDate,
        valor_venda: String(o.salesValue),
        parcelas: o.installments || undefined,
        observacao: o.observations || undefined,
        numero_nf: o.invoice || undefined,
        nota_fiscal_fornecedor: o.invoiceSupplier || undefined,
        numero_oc: o.ocAfPed || undefined,
        is_direct_billing: o.directBilling,
        fornecedor_principal: o.supplier || undefined,
        formas_pagamento: o.paymentMethods.map(m => ({ forma: FORMA_PAGAMENTO_MAP[m] ?? m })),
        custo: custoPayload,
        ...pagamentoPayload,
      };
      const statusChanged = order && o.status !== order.status;
      const sellerId = vendorIdByName((o.seller as string) ?? '', o.company);

      // ── Item diff ───────────────────────────────────────────────────────────
      const origItems = order?.items ?? [];
      const toAdd = o.items.filter(i => !origItems.some(orig => orig.id === i.id));
      const toDelete = origItems.filter(orig => !o.items.some(i => i.id === orig.id));
      const toUpdateStatus = o.items.filter(i => {
        const orig = origItems.find(orig => orig.id === i.id);
        return orig && orig.status !== i.status;
      });
      const toUpdateValues = o.items.filter(i => {
        const orig = origItems.find(orig => orig.id === i.id);
        return orig && (orig.quantity !== i.quantity
          || orig.projectedValue !== i.projectedValue || orig.purchaseValue !== i.purchaseValue);
      });

      // ── DS item diff ────────────────────────────────────────────────────────
      const origDsItems = order?.directSupplyItems ?? [];
      const dsChanged = origDsItems.length !== o.directSupplyItems.length
        || o.directSupplyItems.some(curr => {
          const orig = origDsItems.find(x => x.id === curr.id);
          return !orig || orig.name !== curr.name || orig.quantity !== curr.quantity
            || orig.projectedValue !== curr.projectedValue || orig.purchaseValue !== curr.purchaseValue
            || orig.closingValue !== curr.closingValue
            || orig.supplier !== curr.supplier || orig.supplierPct !== curr.supplierPct
            || orig.supplierFreight !== curr.supplierFreight || orig.supplierInvoice !== curr.supplierInvoice;
        });

      // ── Frete diff ──────────────────────────────────────────────────────────
      const origFretes = order?.freight ?? [];
      const fretesToAdd = o.freight.filter(f => !origFretes.some(orig => orig.id === f.id));
      const fretesToDelete = origFretes.filter(orig => !o.freight.some(f => f.id === orig.id));
      const fretesToUpdate = o.freight.filter(f => {
        const orig = origFretes.find(orig => orig.id === f.id);
        return orig && (orig.value !== f.value || orig.deliveryPerson !== f.deliveryPerson || orig.deliveryDate !== f.deliveryDate || orig.pago !== f.pago);
      });

      const freteBody = (f: FreightCard) => ({
        entregador: f.deliveryPerson || null,
        valor: f.value || 0,
        data_frete: f.deliveryDate || o.deliveryDate,
        pago: f.pago ?? false,
      });

      const syncItems = async (pedidoId: string) => {
        await Promise.all([
          ...toAdd.map(item => apiClient.post(`/pedidos/${pedidoId}/items`, {
            id_vendedor: sellerId,
            descricao: item.name || 'Item',
            quantidade: item.quantity || 1,
            valor_projetado: Math.max(0.01, item.projectedValue),
            valor_compra: item.purchaseValue > 0 ? item.purchaseValue : undefined,
            status: item.status,
          })),
          ...toDelete.map(item => apiClient.delete(`/pedidos/${pedidoId}/items/${item.id}`)),
          ...toUpdateStatus.map(item =>
            apiClient.patch(`/pedidos/${pedidoId}/items/${item.id}/status`, { new_status: item.status })
          ),
          ...toUpdateValues.map(item =>
            apiClient.put(`/pedidos/${pedidoId}/items/${item.id}`, {
              quantidade: item.quantity || 1,
              valor_projetado: Math.max(0.01, item.projectedValue),
              valor_compra: item.purchaseValue > 0 ? item.purchaseValue : undefined,
            })
          ),
          ...(dsChanged ? origDsItems.map(item => apiClient.delete(`/pedidos/${pedidoId}/items/${item.id}`)) : []),
          ...(dsChanged ? o.directSupplyItems.map(item => apiClient.post(`/pedidos/${pedidoId}/items`, {
            id_vendedor: sellerId,
            descricao: item.name || 'Item',
            quantidade: item.quantity || 1,
            valor_projetado: Math.max(0.01, item.projectedValue),
            preco_custo: item.purchaseValue > 0 ? item.purchaseValue : undefined,
            valor_compra: item.closingValue > 0 ? item.closingValue : undefined,
            status: 'To Buy',
            is_direct_supply: true,
            porcentagem_fornecedor: item.supplierPct != null ? String(item.supplierPct) : undefined,
            frete_fornecedor: item.supplierFreight != null ? String(item.supplierFreight) : undefined,
            nota_fiscal_item: item.supplierInvoice || undefined,
            fornecedor: item.supplier || undefined,
          })) : []),
          ...fretesToAdd.map(f => apiClient.post(`/pedidos/${pedidoId}/fretes`, freteBody(f))),
          ...fretesToDelete.map(f => apiClient.delete(`/pedidos/${pedidoId}/fretes/${f.id}`)),
          ...fretesToUpdate.map(f => apiClient.put(`/pedidos/${pedidoId}/fretes/${f.id}`, freteBody(f))),
        ]);
      };
      const finish = async () => {
        const hasChanges = toAdd.length || toDelete.length || toUpdateStatus.length || toUpdateValues.length
          || dsChanged
          || fretesToAdd.length || fretesToDelete.length || fretesToUpdate.length;
        if (hasChanges) {
          try { await syncItems(o.id); } catch (err) { toast.error(getApiError(err)); }
        }
        qc.invalidateQueries({ queryKey: orderKeys.lists() });
        qc.invalidateQueries({ queryKey: ['financial-orders'] });
        toast.success('Pedido atualizado com sucesso');
        onSave(o);
        onClose();
      };
      updateOrder(payload, {
        onSuccess: () => {
          if (statusChanged) {
            updateOrderStatus({ new_status: o.status as PedidoStatus }, { onSuccess: () => { finish(); }, onError: onApiError });
          } else {
            finish();
          }
        },
        onError: onApiError,
      });
    } else {
      const payload: CreatePedidoPayload = {
        id_loja: LOJA_IDS[o.company] ?? '',
        id_vendedor: vendorIdByName(o.seller ?? '', o.company),
        id_cotacao: sourceQuoteId || undefined,
        nome_cliente: o.customer,
        contato_cliente: (o.customerContact || '').trim() || undefined,
        cpf_cnpj: o.cnpj || undefined,
        data_pedido: o.orderDate,
        data_entrega: o.deliveryDate,
        status: o.status as PedidoStatus,
        valor_venda: String(o.salesValue),
        parcelas: o.installments || undefined,
        observacao: o.observations || undefined,
        numero_nf: o.invoice || undefined,
        nota_fiscal_fornecedor: o.invoiceSupplier || undefined,
        numero_oc: o.ocAfPed || undefined,
        is_direct_billing: o.directBilling,
        fornecedor_principal: o.supplier || undefined,
        formas_pagamento: o.paymentMethods.map(m => ({ forma: FORMA_PAGAMENTO_MAP[m] ?? m })),
        custo: custoPayload,
        ...pagamentoPayload,
      };
      if (!chaveTentativa.current) chaveTentativa.current = novaChaveIdempotencia();
      createOrder({ payload, idempotencyKey: chaveTentativa.current }, {
        onSuccess: async (data) => {
          chaveTentativa.current = null;
          const newId = data.id;
          const vendedorId = String(data.id_vendedor);
          let savedItems = o.items;
          if (o.items.length > 0) {
            try {
              const results = await Promise.all(
                o.items.map(item =>
                  apiClient.post(`/pedidos/${newId}/items`, {
                    id_vendedor: vendedorId,
                    descricao: item.name || 'Item',
                    quantidade: item.quantity || 1,
                    valor_projetado: Math.max(0.01, item.projectedValue),
                    valor_compra: item.purchaseValue > 0 ? item.purchaseValue : undefined,
                    status: item.status,
                  }).then(r => r.data)
                )
              );
              savedItems = results.map((r, i) => ({ ...o.items[i], id: r.id }));
            } catch (err) {
              toast.error(getApiError(err));
            }
          }
          let savedDsItems = o.directSupplyItems;
          if (o.directSupplyItems.length > 0) {
            try {
              const results = await Promise.all(
                o.directSupplyItems.map(item =>
                  apiClient.post(`/pedidos/${newId}/items`, {
                    id_vendedor: vendedorId,
                    descricao: item.name || 'Item',
                    quantidade: item.quantity || 1,
                    valor_projetado: Math.max(0.01, item.projectedValue),
                    preco_custo: item.purchaseValue > 0 ? item.purchaseValue : undefined,
                    valor_compra: item.closingValue > 0 ? item.closingValue : undefined,
                    status: 'To Buy',
                    is_direct_supply: true,
                    porcentagem_fornecedor: item.supplierPct != null ? String(item.supplierPct) : undefined,
                    frete_fornecedor: item.supplierFreight != null ? String(item.supplierFreight) : undefined,
                    nota_fiscal_item: item.supplierInvoice || undefined,
                    fornecedor: item.supplier || undefined,
                  }).then(r => r.data)
                )
              );
              savedDsItems = results.map((r, i) => ({ ...o.directSupplyItems[i], id: r.id }));
            } catch (err) {
              toast.error(getApiError(err));
            }
          }
          if (o.freight.length > 0) {
            try {
              await Promise.all(
                o.freight.map(f => apiClient.post(`/pedidos/${newId}/fretes`, {
                  entregador: f.deliveryPerson || null,
                  valor: f.value || 0,
                  data_frete: f.deliveryDate || o.deliveryDate,
                  pago: f.pago ?? false,
                }))
              );
            } catch (err) {
              toast.error(getApiError(err));
            }
          }
          qc.invalidateQueries({ queryKey: orderKeys.lists() });
          qc.invalidateQueries({ queryKey: ['financial-orders'] });
          toast.success('Pedido criado com sucesso');
          onSave({ ...o, id: newId, items: savedItems, directSupplyItems: savedDsItems });
          onClose();
        },
        onError: onApiError,
      });
    }
  };

  /* ---------------- Currency input renderer ---------------- */
  const renderCurrencyInput = (
    key: keyof Order,
    label: string,
    opts: { readOnly?: boolean; muted?: boolean } = {},
  ) => {
    const isEditing = editingField === key;
    const numVal = (form[key] as number) || 0;
    return (
      <div key={key}>
        <Label>{label}</Label>
        <Input
          readOnly={opts.readOnly}
          className={cn('bg-[#FBFCFE] border-[#E2E8F1]', opts.muted && 'bg-muted')}
          value={isEditing ? editingValue : toBRL(numVal)}
          onFocus={() => { if (opts.readOnly) return; setEditingField(key); setEditingValue(numVal ? String(numVal) : ''); }}
          onBlur={() => { if (opts.readOnly) return; set(key, parseBRL(editingValue) || parseFloat(editingValue) || 0); setEditingField(null); }}
          onChange={e => setEditingValue(e.target.value)}
          onKeyDown={handleEnterBlur}
        />
      </div>
    );
  };

  /* ---------------- Presentation-only derived values ---------------- */
  const curStatus = (form.status || 'To Buy') as OrderStatus;
  const [stColor, stBg, stBorder] = STATUS_HEX[curStatus] || STATUS_HEX['To Buy'];
  const marginPct = (form.salesValue || 0) > 0 ? (profit / (form.salesValue || 1)) * 100 : 0;
  const marginBarW = Math.max(0, Math.min(marginPct, 100));
  const partialProfit = (form.salesValue || 0) - partialCost;
  const partialMarginPct = (form.salesValue || 0) > 0 ? (partialProfit / (form.salesValue || 1)) * 100 : 0;
  const partialMarginBarW = Math.max(0, Math.min(partialMarginPct, 100));

  // Container do documento impresso: uma instancia no <body>, recriada a cada
  // montagem e limpando qualquer "#opm-print-root" orfao (hot-reload deixa um
  // com dados antigos). Mesma abordagem do QuoteModal.
  const printRootRef = useRef<HTMLDivElement | null>(null);
  if (printRootRef.current === null && typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.id = 'opm-print-root';
    printRootRef.current = el;
  }
  useEffect(() => {
    const el = printRootRef.current;
    if (!el) return;
    document.querySelectorAll('#opm-print-root').forEach(n => { if (n !== el) n.remove(); });
    document.body.appendChild(el);
    return () => { el.remove(); };
  }, []);

  // Os mesmos numeros que os cartoes da tela mostram — o papel nao pode divergir
  // do que o vendedor acabou de ver.
  const valoresImpressao = {
    custoInicial: derivedInitialProductCost,
    custoFinal: derivedFinalProductCost,
    freteTotal: derivedFreightTotal,
    creditoValor: computed.creditCostValue,
    debitoValor: computed.debitCostValue,
    impCompraValor: computed.purchaseTaxValue,
    impVendaValor: computed.salesTaxValue,
    custoTotal: finalCost,
    lucro: profit,
    margem: marginPct,
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto bg-[#eef1f5] opm-root print:max-w-full print:max-h-none print:shadow-none">
        <style>{ORDER_MODAL_CSS}</style>
        <DialogHeader className="sr-only">
          <DialogTitle>{isEdit ? `Editar Pedido ${form.os}` : `Novo Pedido ${form.os}`}</DialogTitle>
        </DialogHeader>

        {/* ============== PAGE HEADER ============== */}
        <div className="opm-head">
          <h1><span className="opm-oschip">{form.os || '—'}</span> {isEdit ? 'Editar Pedido' : 'Novo Pedido'}</h1>
          <span className="opm-badge" style={{ color: stColor, background: stBg, borderColor: stBorder }}>
            <span className="opm-dot" />{ORDER_STATUS_LABELS[curStatus]}
          </span>
          <div className="opm-meta">
            <span>Cliente <b>{form.customer || '—'}</b></span>
            <span>Empresa <b>{form.company || '—'}</b></span>
            <span>Vendedor <b>{form.seller || '—'}</b></span>
          </div>
        </div>

        {/* ============== 2-COLUMN EDITOR ============== */}
        <div className="opm-editor">
          <div className="opm-formcol">

        {/* ============== 1. INFORMAÇÕES GERAIS ============== */}
        <section className="opm-card" id="sec-geral">
          <h2><ClipboardList className="h-[15px] w-[15px]" /> Informações Gerais</h2>
          <div className="opm-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>OS (auto)</Label>
              <Input readOnly className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" value={form.os || ''} />
            </div>
            <div>
              <Label>Data do Pedido <span className="text-destructive">*</span></Label>
              <Popover open={orderDateOpen} onOpenChange={setOrderDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.orderDate ? format(new Date(form.orderDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={form.orderDate ? new Date(form.orderDate + 'T12:00:00') : undefined}
                    onSelect={d => { if (d) set('orderDate', format(d, 'yyyy-MM-dd')); setOrderDateOpen(false); }}
                    locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Data de Entrega <span className="text-destructive">*</span></Label>
              <Popover open={deliveryDateOpen} onOpenChange={setDeliveryDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.deliveryDate ? format(new Date(form.deliveryDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={form.deliveryDate ? new Date(form.deliveryDate + 'T12:00:00') : undefined}
                    onSelect={d => { if (d) set('deliveryDate', format(d, 'yyyy-MM-dd')); setDeliveryDateOpen(false); }}
                    locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || 'To Buy'} onValueChange={v => set('status', v as OrderStatus)}>
                <SelectTrigger className={cn('border', form.status && ORDER_STATUS_COLORS[form.status as OrderStatus])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map(s => (
                    <SelectItem key={s} value={s}>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', ORDER_STATUS_COLORS[s])}>{ORDER_STATUS_LABELS[s]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.customerCompany ? (
              <>
                <div>
                  <Label>Empresa <span className="text-destructive">*</span></Label>
                  <Input readOnly value={form.customerCompany} className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" />
                </div>
                <div>
                  <Label>Cliente</Label>
                  <Input className="bg-[#FBFCFE] border-[#E2E8F1]" value={form.customerContact || ''} onChange={e => set('customerContact', e.target.value)} onKeyDown={handleEnterBlur} placeholder="Pessoa de contato" />
                </div>
              </>
            ) : (
              <>
                {/* O campo que antes se chamava "Cliente" virou "Empresa": e o
                    mesmo destino de sempre (clientes.nome, que acompanha o
                    CNPJ), so com o nome certo. O "Cliente" agora e a pessoa. */}
                <div>
                  <Label>Empresa <span className="text-destructive">*</span></Label>
                  <Input className="bg-[#FBFCFE] border-[#E2E8F1]" value={form.customer || ''} onChange={e => set('customer', e.target.value)} onKeyDown={handleEnterBlur} />
                </div>
                <div>
                  <Label>Cliente</Label>
                  <Input className="bg-[#FBFCFE] border-[#E2E8F1]" value={form.customerContact || ''} onChange={e => set('customerContact', e.target.value)} onKeyDown={handleEnterBlur} placeholder="Pessoa de contato" />
                </div>
              </>
            )}
            <div>
              <Label>CPF/CNPJ</Label>
              <Input className="bg-[#FBFCFE] border-[#E2E8F1]" value={form.cnpj || ''} onChange={e => set('cnpj', e.target.value)} onKeyDown={handleEnterBlur} />
            </div>
            <div>
              <Label>OC/AF/PED <span className="text-destructive">*</span></Label>
              <Input className="bg-[#FBFCFE] border-[#E2E8F1]" value={form.ocAfPed || ''} onChange={e => set('ocAfPed', e.target.value)} onKeyDown={handleEnterBlur} placeholder="Ex: OC-1234" />
            </div>
            <div>
              <Label>Empresa</Label>
              <Select value={form.company || ''} onValueChange={v => set('company', v)}>
                <SelectTrigger className="bg-[#FBFCFE] border-[#E2E8F1]"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Lucky Store">Lucky Store</SelectItem>
                  <SelectItem value="BTech">BTech</SelectItem>
                  <SelectItem value="AJJ">AJJ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Vendedor</Label>
              <Select value={form.seller || ''} onValueChange={v => set('seller', v)}>
                <SelectTrigger className="bg-[#FBFCFE] border-[#E2E8F1]"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {renderCurrencyInput('salesValue', 'Valor de Venda')}

            <div>
              <Label>Nota Fiscal</Label>
              <Input className="bg-[#FBFCFE] border-[#E2E8F1]" value={form.invoice || ''} onChange={e => set('invoice', e.target.value)} onKeyDown={handleEnterBlur} placeholder="Número da NF" />
            </div>

            {/* Direct billing toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <Switch checked={!!form.directBilling} onCheckedChange={v => set('directBilling', v)} />
                <span className="text-sm font-medium">Faturamento Direto?</span>
              </label>
            </div>
          </div>

          {/* Payment methods */}
          <div className="mt-4">
            <Label className="mb-2 block">Forma de Pagamento</Label>
            <div className="flex flex-wrap gap-3">
              {PAYMENT_METHODS.map(m => (
                <label key={m} className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-white cursor-pointer hover:bg-muted/50">
                  <Checkbox
                    checked={(form.paymentMethods || []).includes(m)}
                    onCheckedChange={() => togglePayment(m)}
                  />
                  <span className="text-sm">{PAYMENT_METHOD_LABELS[m]}</span>
                </label>
              ))}
              {hasCredit && (
                <div className="flex items-center gap-2 px-3 py-1 border rounded-md bg-[#F4F7FB]">
                  <Label className="text-sm whitespace-nowrap">Parcelas:</Label>
                  <Input
                    type="number" min={1} max={24}
                    className="w-20 bg-[#FBFCFE] border-[#E2E8F1]"
                    value={form.installments || 1}
                    onChange={e => set('installments', parseInt(e.target.value) || 1)}
                    onKeyDown={handleEnterBlur}
                  />
                </div>
              )}
            </div>
          </div>
          </div>{/* /opm-body sec-geral */}
        </section>

        {/* ============== 2b. ITENS DE FORNECIMENTO DIRETO ============== */}
        {form.directBilling && (
          <section className="opm-card opm-amber" id="sec-ds">
            <h2>
              <Package className="h-[15px] w-[15px]" /> Itens de Fornecimento Direto
              <Button size="sm" onClick={addDsItem} className="opm-h2-action bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white">
                <Plus className="h-4 w-4 mr-1" /> Adicionar Item
              </Button>
            </h2>
            <div className="opm-body">
            <div className="space-y-2">
              {dsItems.map(item => {
                const custoFornecedor = ((item.closingValue || 0) - (item.purchaseValue || 0)) * (item.quantity || 0) * (item.supplierPct || 0) / 100 + (item.supplierFreight || 0);
                const dsEditing = (field: string) => editingDsField?.id === item.id && editingDsField?.field === field;
                const dsFocus = (field: string, raw: number) => { setEditingDsField({ id: item.id, field }); setEditingDsValue(raw ? String(raw) : ''); };
                const dsBlurBRL = (field: keyof typeof item) => { updateDsItem(item.id, field, parseBRL(editingDsValue) || parseFloat(editingDsValue) || 0); setEditingDsField(null); };
                const dsBlurPct = () => { updateDsItem(item.id, 'supplierPct', parseFloat(editingDsValue.replace(',', '.')) || 0); setEditingDsField(null); };
                return (
                  <div key={item.id} className="border rounded-md p-2 bg-white space-y-2">
                    <div className="grid gap-2 items-start grid-cols-12">
                      <div className="col-span-4">
                        <Input placeholder="Nome" className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={item.name || ''} onChange={e => updateDsItem(item.id, 'name', e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">Produto</span>
                      </div>
                      <div className="col-span-1">
                        <Input type="number" min={1} className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={item.quantity || ''} onChange={e => updateDsItem(item.id, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)} onBlur={() => { if (!item.quantity) updateDsItem(item.id, 'quantity', 1); }} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">Qtd</span>
                      </div>
                      <div className="col-span-2">
                        <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={dsEditing('projectedValue') ? editingDsValue : toBRL(item.projectedValue || 0)}
                          onFocus={() => dsFocus('projectedValue', item.projectedValue || 0)}
                          onBlur={() => dsBlurBRL('projectedValue')}
                          onChange={e => setEditingDsValue(e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">Val. Projetado</span>
                      </div>
                      <div className="col-span-2">
                        <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={dsEditing('purchaseValue') ? editingDsValue : toBRL(item.purchaseValue || 0)}
                          onFocus={() => dsFocus('purchaseValue', item.purchaseValue || 0)}
                          onBlur={() => dsBlurBRL('purchaseValue')}
                          onChange={e => setEditingDsValue(e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">Val. Compra</span>
                      </div>
                      <div className="col-span-2">
                        <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={dsEditing('closingValue') ? editingDsValue : toBRL(item.closingValue || 0)}
                          onFocus={() => dsFocus('closingValue', item.closingValue || 0)}
                          onBlur={() => dsBlurBRL('closingValue')}
                          onChange={e => setEditingDsValue(e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">Val. Venda</span>
                      </div>
                      <div className="col-span-1 flex items-start justify-center pt-1">
                        <Button variant="ghost" size="icon" onClick={() => removeDsItem(item.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <div>
                        <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={item.supplier || ''} onChange={e => updateDsItem(item.id, 'supplier', e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">Fornecedor</span>
                      </div>
                      <div>
                        <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={dsEditing('supplierPct') ? editingDsValue : (item.supplierPct ? `${(item.supplierPct).toFixed(2).replace('.', ',')}%` : '')}
                          onFocus={() => dsFocus('supplierPct', item.supplierPct || 0)}
                          onBlur={dsBlurPct}
                          onChange={e => setEditingDsValue(e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">% Fornecedor</span>
                      </div>
                      <div>
                        <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={dsEditing('supplierFreight') ? editingDsValue : toBRL(item.supplierFreight || 0)}
                          onFocus={() => dsFocus('supplierFreight', item.supplierFreight || 0)}
                          onBlur={() => dsBlurBRL('supplierFreight')}
                          onChange={e => setEditingDsValue(e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">Frete Fornecedor</span>
                      </div>
                      <div>
                        <Input readOnly className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" value={toBRL(custoFornecedor)} />
                        <span className="text-[10px] text-muted-foreground">Custo Fornecedor</span>
                      </div>
                      <div>
                        <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={item.supplierInvoice || ''} onChange={e => updateDsItem(item.id, 'supplierInvoice', e.target.value)} onKeyDown={handleEnterBlur} />
                        <span className="text-[10px] text-muted-foreground">NF Fornecedor</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {dsItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum item de fornecimento direto adicionado</p>
              )}
            </div>
            </div>{/* /opm-body sec-ds */}
          </section>
        )}

        {/* ============== 3. ITENS ============== */}
        <section className="opm-card" id="sec-itens">
          <h2>
            <Package className="h-[15px] w-[15px]" /> Itens do Pedido
            <Button size="sm" onClick={addItem} className="opm-h2-action bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Item
            </Button>
          </h2>
          <div className="opm-body">
          <div className="space-y-2">
            {(form.items || []).map(item => {
              const itEditing = (field: string) => editingDsField?.id === item.id && editingDsField?.field === field;
              const itFocus = (field: string, raw: number) => { setEditingDsField({ id: item.id, field }); setEditingDsValue(raw ? String(raw) : ''); };
              const itBlurBRL = (field: 'projectedValue' | 'purchaseValue') => { updateItem(item.id, field, parseBRL(editingDsValue) || parseFloat(editingDsValue) || 0); setEditingDsField(null); };
              return (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center border border-[#E2E8F1] rounded-lg p-2 bg-[#F8FAFD]">
                  <Input placeholder="Nome do Item" className="col-span-4 bg-[#FBFCFE] border-[#E2E8F1]"
                    value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} onKeyDown={handleEnterBlur} />
                  <Input type="number" min="1" placeholder="Qtd" className="col-span-1 bg-[#FBFCFE] border-[#E2E8F1]"
                    value={item.quantity || ''} onChange={e => updateItem(item.id, 'quantity', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)} onBlur={() => { if (!item.quantity) updateItem(item.id, 'quantity', 1); }} onKeyDown={handleEnterBlur} />
                  <Select value={item.status} onValueChange={v => updateItem(item.id, 'status', v)}>
                    <SelectTrigger className={cn('col-span-2 border', ITEM_STATUS_COLORS[item.status])}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['To Buy', 'Bought', 'In Stock'] as ItemStatus[]).map(s => (
                        <SelectItem key={s} value={s}>
                          <span className={cn('px-1 rounded text-xs font-medium', ITEM_STATUS_COLORS[s])}>
                            {s === 'To Buy' ? 'A Comprar' : s === 'Bought' ? 'Comprado' : 'Em Estoque'}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="col-span-2">
                    <Input placeholder="Custo Projetado R$" className="bg-[#FBFCFE] border-[#E2E8F1]"
                      value={itEditing('projectedValue') ? editingDsValue : toBRL(item.projectedValue || 0)}
                      onFocus={() => itFocus('projectedValue', item.projectedValue || 0)}
                      onBlur={() => itBlurBRL('projectedValue')}
                      onChange={e => setEditingDsValue(e.target.value)} onKeyDown={handleEnterBlur} />
                    <span className="text-[10px] text-muted-foreground">Custo Projetado</span>
                  </div>
                  <div className="col-span-2">
                    {item.subPurchases && item.subPurchases.length > 0 ? (
                      <Input readOnly placeholder="Valor de Compra R$" className="bg-[#F4F7FB] border-[#E2E8F1]"
                        title="Sincronizado a partir do Modal de Produto"
                        value={toBRL(item.purchaseValue || 0)} />
                    ) : (
                      <Input placeholder="Valor de Compra R$" className="bg-[#FBFCFE] border-[#E2E8F1]"
                        value={itEditing('purchaseValue') ? editingDsValue : toBRL(item.purchaseValue || 0)}
                        onFocus={() => itFocus('purchaseValue', item.purchaseValue || 0)}
                        onBlur={() => itBlurBRL('purchaseValue')}
                        onChange={e => setEditingDsValue(e.target.value)} onKeyDown={handleEnterBlur} />
                    )}
                    <span className="text-[10px] text-muted-foreground">Val. Compra</span>
                  </div>
                  <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {(form.items || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum item adicionado</p>
            )}
          </div>
          </div>{/* /opm-body sec-itens */}
        </section>

        {/* ============== 3b. FRETE ============== */}
        <section className="opm-card" id="sec-frete">
          <h2>
            <Truck className="h-[15px] w-[15px]" /> Frete
            <Button size="sm" onClick={addFreight} className="opm-h2-action bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Frete
            </Button>
          </h2>
          <div className="opm-body">
          <div className="space-y-2">
            {(form.freight || []).map((f, idx) => (
              <FreightRow key={f.id} idx={idx} card={f}
                onChange={(k, v) => updateFreight(f.id, k, v)}
                onRemove={() => removeFreight(f.id)} />
            ))}
            {(form.freight || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3">Nenhum frete adicionado</p>
            )}
          </div>
          <div className="mt-3 text-right text-sm font-semibold text-[#15807c]">
            Total: {toBRL(derivedFreightTotal)}
          </div>
          </div>{/* /opm-body sec-frete */}
        </section>

        {/* ============== 3b-bis. FINANCEIRO ============== */}
        {/* Depois de Itens e Frete de proposito: quase tudo aqui e derivado deles
           (Custo Inicial/Final vem dos produtos, Frete vem da secao Frete), entao
           preencher esta secao antes so mostrava campos zerados. */}
        <section className="opm-card" id="sec-financeiro">
          <h2><Banknote className="h-[15px] w-[15px]" /> Financeiro</h2>
          <div className="opm-body">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>Custo Inicial Produto</Label>
              <Input readOnly value={toBRL(derivedInitialProductCost)} className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" />
            </div>
            <div>
              <Label>Custo Final Produto </Label>
              <Input readOnly value={toBRL(derivedFinalProductCost)} className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" />
            </div>
            {renderCurrencyInput('boletoCost', 'Custo Boleto')}
            <div>
              <Label>Frete <span className="text-xs text-muted-foreground">(soma da seção Frete)</span></Label>
              <Input readOnly value={toBRL(derivedFreightTotal)} className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" />
            </div>
            {renderCurrencyInput('giftCost', 'Brinde')}
            {form.directBilling && (
              <div>
                <Label>Custo Fornecimento Direto <span className="text-xs text-muted-foreground">(auto)</span></Label>
                <Input readOnly value={toBRL(directSupplyCost)} className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" />
              </div>
            )}
          </div>

          {/* Bidirectional %↔R$ rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <BiPctRow
              label="Custo Crédito — sobre Valor de Venda"
              base={form.salesValue || 0}
              percent={form.creditCostPercent || 0}
              value={computed.creditCostValue}
              onPercentChange={p => set('creditCostPercent', p)}
              onValueChange={v => {
                const base = form.salesValue || 0;
                set('creditCostPercent', base > 0 ? (v / base) * 100 : 0);
              }}
            />
            <BiPctRow
              label="Custo Débito — sobre Valor de Venda"
              base={form.salesValue || 0}
              percent={form.debitCostPercent || 0}
              value={computed.debitCostValue}
              onPercentChange={p => set('debitCostPercent', p)}
              onValueChange={v => {
                const base = form.salesValue || 0;
                set('debitCostPercent', base > 0 ? (v / base) * 100 : 0);
              }}
            />
            <BiPctRow
              label="Imposto Compra — sobre Custo Final Produto"
              base={derivedFinalProductCost}
              percent={form.purchaseTaxPercent || 0}
              value={computed.purchaseTaxValue}
              onPercentChange={p => set('purchaseTaxPercent', p)}
              onValueChange={v => {
                const base = derivedFinalProductCost;
                set('purchaseTaxPercent', base > 0 ? (v / base) * 100 : 0);
              }}
            />
            <BiPctRow
              label={form.directBilling
                ? 'Imposto Venda — sobre Receita da Empresa (venda − parte do fornecedor)'
                : 'Imposto Venda — sobre Valor de Venda'}
              base={companyRevenue}
              percent={form.salesTaxPercent || 0}
              value={computed.salesTaxValue}
              onPercentChange={p => set('salesTaxPercent', p)}
              onValueChange={v => {
                const base = companyRevenue;
                set('salesTaxPercent', base > 0 ? (v / base) * 100 : 0);
              }}
            />
          </div>
          </div>{/* /opm-body sec-financeiro */}
        </section>

        {/* ============== 3c. PAGAMENTO ============== */}
        <div id="sec-pagamento" style={{ scrollMarginTop: 14 }}>
          <PagamentoSection form={form} set={set} />
        </div>

        {/* ============== 4. CANCELAMENTO ============== */}
        <section className="opm-card" id="sec-cancel">
          <h2><AlertTriangle className="h-[15px] w-[15px]" /> Cancelamento &amp; Observações</h2>
          <div className="opm-body">
          <div className="flex items-center gap-3 mb-3">
            <Switch checked={!!form.cancelled} onCheckedChange={handleCancelToggle} />
            <span className="text-sm font-medium">Pedido Cancelado?</span>
            {form.cancelled && (
              <span className={cn('px-2 py-0.5 rounded text-xs font-semibold border', ORDER_STATUS_COLORS['Cancelled'])}>Cancelado</span>
            )}
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              className="bg-[#FBFCFE] border-[#E2E8F1] min-h-48 resize-y"
              value={form.observations || ''}
              onChange={e => set('observations', e.target.value)}
              placeholder="Anotações sobre o pedido..."
            />
          </div>
          </div>{/* /opm-body sec-cancel */}
        </section>

        {/* ============== HISTÓRICO DE STATUS ============== */}
        {isEdit && order?.id && (
          <StatusTimeline pedidoId={order.id} />
        )}

          </div>{/* /opm-formcol */}

          {/* ============== STICKY SUMMARY ASIDE ============== */}
          <aside className="opm-aside">
            <div className="opm-sum">
              <h3>Resumo de Valores</h3>
              <div className="opm-sumbody">
                <div className="opm-line"><span className="k">Valor de Venda</span><span className="v">{toBRL(form.salesValue || 0)}</span></div>
                {form.directBilling && (
                  <>
                    <div className="opm-line">
                      <span className="k">Parte do Fornecedor</span>
                      <span className="v" style={{ color: '#b07a1f' }}>-{toBRL(directSupplyCost)}</span>
                    </div>
                    <div className="opm-line">
                      <span className="k" style={{ fontWeight: 700 }}>Receita da Empresa</span>
                      <span className="v" style={{ fontWeight: 700 }}>{toBRL(companyRevenue)}</span>
                    </div>
                  </>
                )}
                {(form.refundTotal ?? 0) > 0 && (
                  <div className="opm-line"><span className="k" style={{ color: '#d24545' }}>Valor Estornado</span><span className="v" style={{ color: '#d24545' }}>-{toBRL(form.refundTotal!)}</span></div>
                )}
                {(form.refundTotal ?? 0) > 0 && (
                  <div className="opm-line"><span className="k" style={{ fontWeight: 700 }}>Saldo do Pedido</span><span className="v" style={{ fontWeight: 700 }}>{toBRL((form.salesValue || 0) - (form.refundTotal || 0))}</span></div>
                )}
                <div className="opm-line"><span className="k">Custo parcial</span><span className="v">{toBRL(partialCost)}</span></div>
                <div className="opm-result">
                  <div className="lk">Lucro parcial</div>
                  <div className="lv" style={{ color: partialProfit >= 0 ? '#eafaf6' : '#ffd2d2' }}>{toBRL(partialProfit)}</div>
                  <div className="opm-marg">
                    <div className="top"><span>Margem</span><b>{(form.salesValue || 0) > 0 ? `${partialMarginPct.toFixed(1)}%` : '—'}</b></div>
                    <div className="opm-mtrack">
                      <i style={{ width: `${partialMarginBarW}%`, background: partialProfit >= 0 ? 'linear-gradient(90deg,#7be3a8,#1fd07a)' : 'linear-gradient(90deg,#f1a3a3,#e05a5a)' }} />
                    </div>
                  </div>
                </div>
                <div className="opm-line"><span className="k">Custo final</span><span className="v">{toBRL(finalCost)}</span></div>
                <div className="opm-result">
                  <div className="lk">Lucro do pedido</div>
                  <div className="lv" style={{ color: profit >= 0 ? '#eafaf6' : '#ffd2d2' }}>{toBRL(profit)}</div>
                  <div className="opm-marg">
                    <div className="top"><span>Margem</span><b>{(form.salesValue || 0) > 0 ? `${marginPct.toFixed(1)}%` : '—'}</b></div>
                    <div className="opm-mtrack">
                      <i style={{ width: `${marginBarW}%`, background: profit >= 0 ? 'linear-gradient(90deg,#7be3a8,#1fd07a)' : 'linear-gradient(90deg,#f1a3a3,#e05a5a)' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="opm-actions print:hidden">
              <Button
                onClick={handleSave}
                disabled={isPending}
                className="w-full h-12 text-[15px] font-bold text-white border-0"
                style={{ background: 'linear-gradient(135deg,#3f8fd6,#3565c9)', boxShadow: '0 12px 26px -12px rgba(53,101,201,.8)', borderRadius: 13 }}
              >
                {isPending ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Criar Pedido')}
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full h-11" style={{ borderColor: '#e7ebf0', borderRadius: 13 }}>
                Cancelar
              </Button>
              <Button variant="outline" onClick={() => window.print()} className="w-full h-11" style={{ borderColor: '#e7ebf0', borderRadius: 13 }}>
                <Printer className="h-4 w-4 mr-1.5" /> Imprimir
              </Button>
            </div>

            <nav className="opm-jump">
              <a href="#sec-geral">Informações Gerais</a>
              {form.directBilling && <a href="#sec-ds">Fornecimento Direto</a>}
              <a href="#sec-itens">Itens do Pedido</a>
              <a href="#sec-frete">Frete</a>
              <a href="#sec-financeiro">Financeiro</a>
              <a href="#sec-pagamento">Pagamento</a>
              <a href="#sec-cancel">Cancelamento</a>
            </nav>
          </aside>

        </div>{/* /opm-editor */}
      </DialogContent>

      {/* Documento de impressao — montado no <body>; so ele vai para o papel */}
      {open && printRootRef.current && createPortal(
        <>
          <style>{ORDER_PRINT_CSS}</style>
          <OrderPrintTemplate form={form} valores={valoresImpressao} vendedor={vendedorDaOS} />
        </>,
        printRootRef.current,
      )}
    </Dialog>
  );
}

/* ---------- Bidirectional %↔R$ row ---------- */
function BiPctRow({ label, base, percent, value, onPercentChange, onValueChange }: {
  label: string;
  base: number;
  percent: number;
  value: number;
  onPercentChange: (p: number) => void;
  onValueChange: (v: number) => void;
}) {
  const [pctEditing, setPctEditing] = useState(false);
  const [pctDraft, setPctDraft] = useState('');
  const [valEditing, setValEditing] = useState(false);
  const [valDraft, setValDraft] = useState('');
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder="%"
          className="bg-[#FBFCFE] border-[#E2E8F1]"
          value={pctEditing ? pctDraft : (percent ? `${percent.toFixed(2).replace('.', ',')}%` : '')}
          onFocus={() => { setPctEditing(true); setPctDraft(percent ? String(percent) : ''); }}
          onBlur={() => { onPercentChange(parseFloat(pctDraft.replace(',', '.')) || 0); setPctEditing(false); }}
          onChange={e => setPctDraft(e.target.value)}
          onKeyDown={handleEnterBlur}
        />
        <Input
          placeholder="R$"
          className="bg-[#FBFCFE] border-[#E2E8F1]"
          value={valEditing ? valDraft : toBRL(value)}
          onFocus={() => { setValEditing(true); setValDraft(value ? String(value) : ''); }}
          onBlur={() => { onValueChange(parseBRL(valDraft) || parseFloat(valDraft) || 0); setValEditing(false); }}
          onChange={e => setValDraft(e.target.value)}
          onKeyDown={handleEnterBlur}
        />
      </div>
      {base > 0 ? null : <p className="text-xs text-muted-foreground mt-1">Defina o valor base para editar em R$.</p>}
    </div>
  );
}

/* ---------- Freight row component ---------- */
function FreightRow({ idx, card, onChange, onRemove }: {
  idx: number; card: FreightCard;
  onChange: (k: keyof FreightCard, v: any) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <div className="grid grid-cols-12 gap-2 items-center border border-[#E2E8F1] rounded-lg p-2 bg-[#F8FAFD]">
      <span className="col-span-1 text-xs font-bold text-[#15807c]">#{idx + 1}</span>
      <Input placeholder="Entregador" className="col-span-3 bg-[#FBFCFE] border-[#E2E8F1]"
        value={card.deliveryPerson} onChange={e => onChange('deliveryPerson', e.target.value)} onKeyDown={handleEnterBlur} />
      <div className="col-span-3">
        <Input placeholder="R$ 0,00" className="bg-[#FBFCFE] border-[#E2E8F1]"
          value={editing ? draft : toBRL(card.value || 0)}
          onFocus={() => { setEditing(true); setDraft(card.value ? String(card.value) : ''); }}
          onBlur={() => { onChange('value', parseBRL(draft) || parseFloat(draft) || 0); setEditing(false); }}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleEnterBlur} />
      </div>
      <div className="col-span-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {card.deliveryDate ? format(new Date(card.deliveryDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Data'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single"
              selected={card.deliveryDate ? new Date(card.deliveryDate + 'T12:00:00') : undefined}
              onSelect={d => { onChange('deliveryDate', d ? format(d, 'yyyy-MM-dd') : undefined); setOpen(false); }}
              locale={ptBR} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>
      <Button variant="ghost" size="icon" className="col-span-1"
        title={card.pago ? 'Pago' : 'Não pago'}
        onClick={() => onChange('pago', !card.pago)}>
        {card.pago
          ? <CheckCircle2 className="h-5 w-5 text-green-600" />
          : <Circle className="h-5 w-5 text-muted-foreground" />}
      </Button>
      <Button variant="ghost" size="icon" className="col-span-1" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

/* ---------- Pagamento section ---------- */
function PagamentoSection({ form, set }: { form: Partial<Order>; set: (k: keyof Order, v: any) => void }) {
  const [payDateOpen, setPayDateOpen] = useState(false);

  // ── Conjunto A: parcelas do VALOR DO PEDIDO (Informações Gerais → Crédito) ──
  const orderIsCredit = (form.paymentMethods || []).includes('Credit Card') || (form.paymentMethods || []).includes('Boleto');
  const orderN = orderIsCredit ? (form.installments || 0) : 0;
  const orderPlan = form.orderInstallmentPlan || [];
  const baseValue = form.salesValue || 0;

  useEffect(() => {
    if (!orderIsCredit) return;
    if (orderPlan.length === orderN) return;
    const valuePer = orderN > 0 ? +(baseValue / orderN).toFixed(2) : 0;
    const next: PaymentInstallment[] = Array.from({ length: orderN }, (_, i) =>
      orderPlan[i] || { date: '', value: valuePer }
    );
    set('orderInstallmentPlan', next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderN, orderIsCredit]);

  const setOrderInst = (i: number, patch: Partial<PaymentInstallment>) => {
    set('orderInstallmentPlan', orderPlan.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  };

  // ── Conjunto B: parcelas de MULTA/JUROS (Financeiro → Crédito) ──
  const chargeIsCredit = form.paymentMethod === 'Credit Card' || form.paymentMethod === 'Boleto';
  const chargeN = chargeIsCredit ? (form.paymentInstallments || 0) : 0;
  const chargePlan = form.paymentInstallmentPlan || [];
  const multa = form.penaltyValue || 0;
  const juros = form.interestValue || 0;

  useEffect(() => {
    if (!chargeIsCredit) return;
    if (chargePlan.length === chargeN) return;
    const valuePer = chargeN > 0 ? +(((multa + juros) || 0) / chargeN).toFixed(2) : 0;
    const next: PaymentInstallment[] = Array.from({ length: chargeN }, (_, i) =>
      chargePlan[i] || { date: '', value: valuePer }
    );
    set('paymentInstallmentPlan', next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeN, chargeIsCredit]);

  const setChargeInst = (i: number, patch: Partial<PaymentInstallment>) => {
    set('paymentInstallmentPlan', chargePlan.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  };

  // multa/juros divididos proporcionalmente ao valor de cada parcela do conjunto B
  const totalChargePlan = chargePlan.reduce((s, p) => s + (p.value || 0), 0);
  const shareOf = (total: number, p: PaymentInstallment) =>
    chargePlan.length === 0 ? 0 : totalChargePlan > 0 ? (p.value || 0) / totalChargePlan * total : total / chargePlan.length;

  return (
    <section className="opm-card">
      <h2><Receipt className="h-[15px] w-[15px]" /> Pagamento</h2>
      <div className="opm-body space-y-4">

        {/* ── A) Parcelas do valor do pedido (Informações Gerais) ── */}
        {orderIsCredit && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="m-0 text-xs font-bold uppercase tracking-widest text-[#5B6B82]">Parcelas do Pedido</Label>
              <span className="text-xs text-muted-foreground">{orderPlan.length} parcela(s) · valor do pedido (Informações Gerais)</span>
            </div>
            {orderPlan.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-5 bg-[#F8FAFD] border border-dashed border-[#E2E8F1] rounded-xl">
                Informe o número de parcelas na seção <strong>Informações Gerais</strong> para gerar os blocos.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {orderPlan.map((p, i) => (
                  <div key={i} className="border border-[#E2E8F1] rounded-xl p-3 bg-[#F8FAFD]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase text-[#2F6BFF]">Parcela {i + 1}</span>
                      <span className="text-[10px] text-muted-foreground">de {orderPlan.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Valor (R$)</Label>
                        <Input type="number" step="0.01" placeholder="Valor da parcela" className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={p.value || ''} onChange={e => setOrderInst(i, { value: parseFloat(e.target.value) || 0 })} onKeyDown={handleEnterBlur} />
                      </div>
                      <div>
                        <Label className="text-xs">Data de Pagamento</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {p.date ? format(new Date(p.date + 'T12:00:00'), 'dd/MM/yyyy') : 'Data'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single"
                              selected={p.date ? new Date(p.date + 'T12:00:00') : undefined}
                              onSelect={d => setOrderInst(i, { date: d ? format(d, 'yyyy-MM-dd') : '' })}
                              locale={ptBR} className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Multa, Juros, Forma de Pagamento (+ Parcelas quando crédito) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {!orderIsCredit && (
            <div>
              <Label>Data Pagamento</Label>
              <Popover open={payDateOpen} onOpenChange={setPayDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.paymentDate ? format(new Date(form.paymentDate + 'T12:00:00'), 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single"
                    selected={form.paymentDate ? new Date(form.paymentDate + 'T12:00:00') : undefined}
                    onSelect={d => { if (d) set('paymentDate', format(d, 'yyyy-MM-dd')); setPayDateOpen(false); }}
                    locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div>
            <Label>Multa (R$)</Label>
            <Input type="number" step="0.01" className="bg-[#FBFCFE] border-[#E2E8F1]"
              value={form.penaltyValue || ''} onChange={e => set('penaltyValue', parseFloat(e.target.value) || 0)} onKeyDown={handleEnterBlur} />
          </div>
          <div>
            <Label>Juros (R$)</Label>
            <Input type="number" step="0.01" className="bg-[#FBFCFE] border-[#E2E8F1]"
              value={form.interestValue || ''} onChange={e => set('interestValue', parseFloat(e.target.value) || 0)} onKeyDown={handleEnterBlur} />
          </div>
          <div>
            <Label>Forma de Pagamento</Label>
            <Select value={form.paymentMethod || ''} onValueChange={v => set('paymentMethod', v)}>
              <SelectTrigger className="bg-[#FBFCFE] border-[#E2E8F1]"><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {chargeIsCredit && (
            <div>
              <Label>Parcelas (multa/juros)</Label>
              <Input type="number" min={1} className="bg-[#FBFCFE] border-[#E2E8F1]"
                value={form.paymentInstallments || ''} onChange={e => set('paymentInstallments', parseInt(e.target.value) || 1)} onKeyDown={handleEnterBlur} />
            </div>
          )}
        </div>

        {/* ── B) Parcelas de multa/juros (Financeiro) ── */}
        {chargeIsCredit && chargePlan.length > 0 && (multa > 0 || juros > 0) && (
          <div className="pt-4 border-t border-[#E2E8F1]">
            <div className="flex items-center justify-between mb-3">
              <Label className="m-0 text-xs font-bold uppercase tracking-widest text-[#5B6B82]">Parcelas de Multa/Juros</Label>
              <span className="text-xs text-muted-foreground">{chargePlan.length} parcela(s) · multa + juros proporcionais</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {chargePlan.map((p, i) => {
                const mShare = shareOf(multa, p);
                const jShare = shareOf(juros, p);
                return (
                  <div key={i} className="border border-[#E2E8F1] rounded-xl p-3 bg-[#F8FAFD]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase text-[#16807c]">Parcela {i + 1}</span>
                      <span className="text-[10px] text-muted-foreground">de {chargePlan.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Peso (R$)</Label>
                        <Input type="number" step="0.01" placeholder="Peso da parcela" className="bg-[#FBFCFE] border-[#E2E8F1]"
                          value={p.value || ''} onChange={e => setChargeInst(i, { value: parseFloat(e.target.value) || 0 })} onKeyDown={handleEnterBlur} />
                      </div>
                      <div>
                        <Label className="text-xs">Data de Pagamento</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {p.date ? format(new Date(p.date + 'T12:00:00'), 'dd/MM/yyyy') : 'Data'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single"
                              selected={p.date ? new Date(p.date + 'T12:00:00') : undefined}
                              onSelect={d => setChargeInst(i, { date: d ? format(d, 'yyyy-MM-dd') : '' })}
                              locale={ptBR} className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#E2E8F1] flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {multa > 0 && <>Multa {toBRL(mShare)} </>}
                        {juros > 0 && <>Juros {toBRL(jShare)}</>}
                      </span>
                      <span className="font-semibold text-[#16273F]">Total {toBRL(mShare + jShare)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>{/* /opm-body */}
    </section>
  );
}

