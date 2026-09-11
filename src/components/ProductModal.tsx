import { useState, useEffect, useMemo, KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Plus, Trash2, AlertTriangle, Printer, ClipboardList, ShoppingBag, Wallet, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { apiClient, getApiError } from '@/api/client';
import { orderKeys } from '@/api/hooks/useOrders';
import { ItemStatusTimeline } from '@/components/StatusTimeline';
import {
  Order, OrderItem, SubPurchase, ItemStatus, PaymentMethod,
  ITEM_STATUS_COLORS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  calcItemFinalValue, calcItemLatestDelivery,
} from '@/store/OrderStore';
import { useVendedores } from '@/hooks/useVendedores';

const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  'To Buy': 'A Comprar', 'Bought': 'Comprado', 'In Stock': 'Em Estoque',
};

/* ---------- Header status badge colors (presentation only) ---------- */
const STATUS_HEX: Record<ItemStatus, [string, string, string]> = {
  'To Buy':   ['#7c5cd6', '#f1ecfb', '#ddd2f4'],
  'Bought':   ['#a05e00', '#fff4e5', '#f0d9a8'],
  'In Stock': ['#137a42', '#e8f6ee', '#c7e8d3'],
};

const PRODUCT_MODAL_CSS = `
  .pm-root{font-family:'Sora','Inter',system-ui,sans-serif}
  .pm-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px;padding-right:8px}
  .pm-head h1{font-size:22px;font-weight:700;display:flex;align-items:center;gap:12px;color:#16273f;font-family:'Space Grotesk',sans-serif;margin:0}
  .pm-oschip{font-size:12px;font-weight:700;color:#15807c;background:#e6f3f1;border:1px solid #cfe8e3;padding:5px 11px;border-radius:8px;letter-spacing:.02em}
  .pm-badge{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;padding:6px 13px;border-radius:999px;border:1px solid}
  .pm-badge .pm-dot{width:8px;height:8px;border-radius:50%;background:currentColor}
  .pm-meta{display:flex;gap:18px;color:#6b7787;font-size:13px;flex-wrap:wrap}
  .pm-meta b{color:#16273f;font-weight:600}

  .pm-editor{display:grid;grid-template-columns:1fr 330px;gap:20px;align-items:start}
  .pm-formcol{display:flex;flex-direction:column;gap:20px;min-width:0}

  .pm-card{background:#fff;border:1px solid #e7ebf0;border-radius:18px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 10px 28px -14px rgba(20,35,55,.18);overflow:hidden;scroll-margin-top:14px}
  .pm-card>h2{font-size:14px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#15807c;padding:18px 22px;border-bottom:1px solid #e7ebf0;display:flex;align-items:center;gap:11px;background:#fcfdfe;margin:0}
  .pm-card>h2 .pm-pill{font-size:11px;font-weight:700;background:#eef2f5;color:#6b7787;padding:3px 10px;border-radius:999px;letter-spacing:0;text-transform:none}
  .pm-card>h2 .pm-h2-action{margin-left:auto}
  .pm-card .pm-body{padding:22px}

  .pm-sub{border:1px solid #e7ebf0;border-radius:14px;padding:16px;background:#fcfdfe}
  .pm-sub+.pm-sub{margin-top:12px}
  .pm-subhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .pm-subhead .t{font-size:12px;font-weight:700;letter-spacing:.06em;color:#15807c;text-transform:uppercase}
  .pm-empty{text-align:center;color:#6b7787;padding:24px;font-size:13.5px;background:#f7f9fb;border-radius:12px;border:1px dashed #e7ebf0}

  .pm-root input:focus-visible,
  .pm-root textarea:focus-visible,
  .pm-root [role="combobox"]:focus-visible{
    border-color:#16807c !important;
    box-shadow:0 0 0 3px rgba(22,128,124,.14) !important;
    outline:none !important;
  }

  .pm-aside{position:sticky;top:0;display:flex;flex-direction:column;gap:14px}
  .pm-sum{background:#fff;border:1px solid #e7ebf0;border-radius:18px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 10px 28px -14px rgba(20,35,55,.18);overflow:hidden}
  .pm-sum>h3{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7787;padding:16px 20px 0;margin:0}
  .pm-sumbody{padding:14px 20px 18px}
  .pm-line{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;font-size:14px;border-bottom:1px dashed #e7ebf0}
  .pm-line:last-of-type{border-bottom:0}
  .pm-line .k{color:#6b7787}
  .pm-line .v{font-weight:600;color:#16273f;font-variant-numeric:tabular-nums}
  .pm-result{margin-top:8px;background:linear-gradient(155deg,#11716d,#0c4f4d);border-radius:14px;padding:18px;color:#eafaf6;position:relative;overflow:hidden}
  .pm-result::after{content:"";position:absolute;right:-30px;bottom:-50px;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,rgba(31,157,87,.4),transparent 70%)}
  .pm-result .lk{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#a9ded5;position:relative;display:flex;align-items:center;gap:7px}
  .pm-result .lv{font-size:31px;font-weight:800;line-height:1;margin-top:6px;position:relative;font-family:'Space Grotesk',sans-serif;font-variant-numeric:tabular-nums}
  .pm-result .note{font-size:12px;color:#bfe8df;margin-top:10px;position:relative}
  .pm-bar{height:9px;border-radius:99px;background:rgba(255,255,255,.18);overflow:hidden;margin-top:12px;position:relative}
  .pm-bar i{display:block;height:100%;border-radius:99px;transition:width .4s}
  .pm-jump{background:#fff;border:1px solid #e7ebf0;border-radius:18px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 10px 28px -14px rgba(20,35,55,.18);padding:8px}
  .pm-jump a{display:block;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;color:#6b7787;text-decoration:none;transition:.15s}
  .pm-jump a:hover{background:#f7f9fb;color:#16273f}

  @media (max-width:980px){
    .pm-editor{grid-template-columns:1fr}
    .pm-aside{position:static;order:-1}
    .pm-jump{display:none}
  }

  @media print{
    .pm-actions,.pm-jump,.pm-h2-action{display:none !important}
    .pm-editor{grid-template-columns:1fr !important;gap:14px}
    .pm-aside{position:static !important;order:2}
    .pm-card,.pm-sum,.pm-sub{box-shadow:none !important;break-inside:avoid}
  }
`;

function toBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(iso?: string) {
  if (!iso) return 'Selecionar';
  return format(new Date(iso + 'T12:00:00'), 'dd/MM/yyyy');
}
function handleEnterBlur(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
}

const emptySub = (): SubPurchase => ({
  id: crypto.randomUUID(),
  selectedQuantity: 1,
  supplier: '',
  buyer: '',
  purchaseDate: undefined,
  productDeliveryDate: undefined,
  receiptDate: undefined,
  purchaseValue: 0,
  paymentMethod: '',
  card: '',
  status: 'To Buy',
});

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  item: OrderItem | null;
  onSave: (updatedOrder: Order) => void;
}

export function ProductModal({ open, onClose, order, item, onSave }: Props) {
  const qc = useQueryClient();
  const { data: vendedoresData } = useVendedores();
  const vendedores = vendedoresData?.items ?? [];
  const [subs, setSubs] = useState<SubPurchase[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setSubs(item.subPurchases ? [...item.subPurchases] : []);
      setObservacoes(item.observations ?? '');
    }
  }, [item, open]);

  const totalSelected = useMemo(() => subs.reduce((s, sp) => s + (sp.selectedQuantity || 0), 0), [subs]);
  const projected = item?.projectedValue || 0;
  const finalValue = useMemo(() => subs.reduce((s, sp) => s + (sp.purchaseValue || 0), 0), [subs]);
  const savings = projected - finalValue;
  const overQuantity = item ? totalSelected > (item.quantity || 0) : false;

  if (!order || !item) return null;

  const updateSub = (id: string, field: keyof SubPurchase, value: any) => {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  const addSub = () => setSubs(prev => [...prev, emptySub()]);
  const removeSub = (id: string) => setSubs(prev => prev.filter(s => s.id !== id));

  const handleSave = async () => {
    const updatedItem: OrderItem = {
      ...item,
      observations: observacoes,
      subPurchases: subs,
    };
    updatedItem.purchaseValue = calcItemFinalValue(updatedItem);
    updatedItem.productDeliveryDate = calcItemLatestDelivery(updatedItem);

    const updatedOrder: Order = {
      ...order,
      items: order.items.map(i => i.id === item.id ? updatedItem : i),
    };
    updatedOrder.finalProductCost = updatedOrder.items.reduce((s, i) => s + (i.purchaseValue || 0), 0)
      + (updatedOrder.directSupplyItems || []).reduce((s, i) => s + i.purchaseValue * i.quantity, 0);
    updatedOrder.purchaseTaxValue = updatedOrder.finalProductCost * (updatedOrder.purchaseTaxPercent || 0) / 100;

    const firstSub = subs[0];
    const dominantStatus: ItemStatus = subs.some(s => s.status === 'To Buy')
      ? 'To Buy'
      : subs.some(s => s.status === 'Bought')
      ? 'Bought'
      : subs.length > 0 ? 'In Stock' : item.status;
    updatedItem.status = dominantStatus;

    const payload: Record<string, unknown> = {};
    // Sempre vai, inclusive vazio: e assim que apagar a anotacao funciona. O
    // backend usa exclude_none, entao string vazia limpa e null seria ignorado.
    payload.observacao = observacoes;
    payload.sub_compras = subs;
    if (subs.length > 0) payload.valor_compra = updatedItem.purchaseValue;
    payload.status = dominantStatus;
    if (firstSub?.supplier) payload.fornecedor = firstSub.supplier;
    if (firstSub?.purchaseDate) payload.data_compra = firstSub.purchaseDate;
    if (updatedItem.productDeliveryDate) payload.prazo_entrega = updatedItem.productDeliveryDate;
    if (firstSub?.receiptDate) payload.data_recebimento = firstSub.receiptDate;

    setSaving(true);
    try {
      await apiClient.put(`/pedidos/${order.id}/items/${item.id}`, payload);
    } catch (err) {
      toast.error(getApiError(err));
      setSaving(false);
      return;
    }
    setSaving(false);
    toast.success('Produto atualizado com sucesso!');
    onSave(updatedOrder);
    onClose();
    qc.invalidateQueries({ queryKey: orderKeys.lists() });
    qc.invalidateQueries({ queryKey: orderKeys.detail(order.id) });
    qc.invalidateQueries({ queryKey: orderKeys.itemHistory(order.id, item.id) });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['financial-orders'] });
  };

  const [stColor, stBg, stBorder] = STATUS_HEX[item.status] || STATUS_HEX['To Buy'];
  const over = savings < 0;
  const ecoPct = projected > 0 ? Math.abs(savings) / projected * 100 : 0;
  const ecoBarW = Math.min(ecoPct, 100);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto bg-[#eef1f5] pm-root print:max-w-full print:max-h-none print:shadow-none">
        <style>{PRODUCT_MODAL_CSS}</style>
        <DialogHeader className="sr-only">
          <DialogTitle>Produto: {item.name} (OS #{order.os})</DialogTitle>
        </DialogHeader>

        {/* ============== PAGE HEADER ============== */}
        <div className="pm-head">
          <h1><span className="pm-oschip">{order.os}</span> Produto: {item.name}</h1>
          <span className="pm-badge" style={{ color: stColor, background: stBg, borderColor: stBorder }}>
            <span className="pm-dot" />{ITEM_STATUS_LABELS[item.status]}
          </span>
          <div className="pm-meta">
            <span>Cliente <b>{order.customer || '—'}</b></span>
            <span>Vendedor <b>{order.seller || '—'}</b></span>
            <span>Empresa <b>{order.company || '—'}</b></span>
          </div>
        </div>

        {/* ============== 2-COLUMN EDITOR ============== */}
        <div className="pm-editor">
          <div className="pm-formcol">

        {/* ============== 1. INFORMAÇÕES GERAIS ============== */}
        <section className="pm-card" id="sec-geral">
          <h2><ClipboardList className="h-4 w-4" /> Informações Gerais</h2>
          <div className="pm-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>OS Pai</Label><Input readOnly value={order.os} className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" /></div>
            <div><Label>Quantidade Total</Label><Input readOnly value={item.quantity} className="bg-[#F4F7FB] border-[#E2E8F1]" /></div>
            <div><Label>Valor Projetado</Label><Input readOnly value={toBRL(projected)} className="bg-[#F4F7FB] border-[#E2E8F1]" /></div>
            <div><Label>Cliente</Label><Input readOnly value={order.customer} className="bg-[#F4F7FB] border-[#E2E8F1]" /></div>
            <div><Label>CPF/CNPJ</Label><Input readOnly value={order.cnpj || '—'} className="bg-[#F4F7FB] border-[#E2E8F1]" /></div>
            <div><Label>Vendedor</Label><Input readOnly value={order.seller || '—'} className="bg-[#F4F7FB] border-[#E2E8F1]" /></div>
            <div><Label>Empresa</Label><Input readOnly value={order.company || '—'} className="bg-[#F4F7FB] border-[#E2E8F1]" /></div>
            <div><Label>Data do Pedido</Label><Input readOnly value={fmtDate(order.orderDate)} className="bg-[#F4F7FB] border-[#E2E8F1]" /></div>
          </div>
          </div>
        </section>

        {/* ============== 2. DETALHES — SUB-COMPRAS ============== */}
        <section className="pm-card" id="sec-compras">
          <h2>
            <ShoppingBag className="h-4 w-4" /> Detalhes das Compras
            <span className={cn(
              'pm-pill',
              overQuantity && 'bg-[hsl(var(--st-cancelled)/0.15)] text-[hsl(var(--st-cancelled))]'
            )}>
              Selecionado: {totalSelected} / {item.quantity}
            </span>
            {overQuantity && (
              <span className="flex items-center gap-1 text-xs text-[hsl(var(--st-cancelled))] font-medium normal-case tracking-normal">
                <AlertTriangle className="h-3.5 w-3.5" /> Excede quantidade
              </span>
            )}
            <Button size="sm" onClick={addSub} className="pm-h2-action bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Compra
            </Button>
          </h2>
          <div className="pm-body">
          <div className="space-y-3">
            {subs.length === 0 && (
              <div className="pm-empty">Nenhuma sub-compra adicionada</div>
            )}
            {subs.map((sp, idx) => (
              <div key={sp.id} className="pm-sub">
                <div className="pm-subhead">
                  <span className="t">Compra #{idx + 1}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeSub(sp.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label>Qtd. Selecionada</Label>
                    <Input type="number" min={1} max={item.quantity} className="bg-[#FBFCFE] border-[#E2E8F1]"
                      value={sp.selectedQuantity || ''}
                      onChange={e => updateSub(sp.id, 'selectedQuantity', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                      onBlur={() => { if (!sp.selectedQuantity) updateSub(sp.id, 'selectedQuantity', 1); }}
                      onKeyDown={handleEnterBlur} />
                  </div>
                  <div>
                    <Label>Fornecedor</Label>
                    <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                      value={sp.supplier}
                      onChange={e => updateSub(sp.id, 'supplier', e.target.value)}
                      onKeyDown={handleEnterBlur} />
                  </div>
                  <div>
                    <Label>Comprador</Label>
                    <Select value={sp.buyer || ''} onValueChange={v => updateSub(sp.id, 'buyer', v)}>
                      <SelectTrigger className="bg-[#FBFCFE] border-[#E2E8F1]"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={sp.status} onValueChange={v => updateSub(sp.id, 'status', v as ItemStatus)}>
                      <SelectTrigger className={cn('border', ITEM_STATUS_COLORS[sp.status])}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['To Buy', 'Bought', 'In Stock'] as ItemStatus[]).map(s => (
                          <SelectItem key={s} value={s}>
                            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', ITEM_STATUS_COLORS[s])}>{ITEM_STATUS_LABELS[s]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <DateField label="Data da Compra" value={sp.purchaseDate} onChange={d => updateSub(sp.id, 'purchaseDate', d)} />
                  <DateField label="Entrega do Produto" value={sp.productDeliveryDate} onChange={d => updateSub(sp.id, 'productDeliveryDate', d)} />
                  <DateField label="Data de Recebimento" value={sp.receiptDate} onChange={d => updateSub(sp.id, 'receiptDate', d)} />

                  <div>
                    <Label>Valor de Compra (R$)</Label>
                    <Input type="number" step="0.01" className="bg-[#FBFCFE] border-[#E2E8F1]"
                      value={sp.purchaseValue || ''}
                      onChange={e => updateSub(sp.id, 'purchaseValue', parseFloat(e.target.value) || 0)}
                      onKeyDown={handleEnterBlur} />
                  </div>
                  <div>
                    <Label>Cartão</Label>
                    <Input className="bg-[#FBFCFE] border-[#E2E8F1]"
                      value={sp.card || ''}
                      onChange={e => updateSub(sp.id, 'card', e.target.value)}
                      onKeyDown={handleEnterBlur}
                      placeholder="Ex.: Nubank, Itaú..." />
                  </div>
                  <div className={cn(sp.paymentMethod === 'Credit Card' ? 'md:col-span-1' : 'md:col-span-1')}>
                    <Label>Forma de Pagamento</Label>
                    <Select value={sp.paymentMethod || ''} onValueChange={v => updateSub(sp.id, 'paymentMethod', v as PaymentMethod)}>
                      <SelectTrigger className="bg-[#FBFCFE] border-[#E2E8F1]"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(sp.paymentMethod === 'Credit Card' || sp.paymentMethod === 'Boleto') && (
                    <div>
                      <Label>Parcelas</Label>
                      <Input type="number" min={1} max={24} className="bg-[#FBFCFE] border-[#E2E8F1]"
                        value={sp.installments || 1}
                        onChange={e => updateSub(sp.id, 'installments', parseInt(e.target.value) || 1)}
                        onKeyDown={handleEnterBlur} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </div>{/* /pm-body sec-compras */}
        </section>

        {/* ============== OBSERVAÇÕES ============== */}
        <section className="pm-card" id="sec-obs">
          <h2><FileText className="h-4 w-4" /> Observações</h2>
          <div className="pm-body">
            {/* Do item, e nao do pedido: aqui vai o que e daquele produto —
                fornecedor que ligou, prazo que mudou, por que a compra parou.
                Na observacao do pedido isso se misturava com a dos outros
                itens. Sem limite de caracteres, como as outras. */}
            <Textarea
              className="bg-[#FBFCFE] border-[#E2E8F1] min-h-48 resize-y"
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Anotações sobre este produto..."
            />
          </div>
        </section>

        {/* ============== HISTÓRICO DE STATUS ============== */}
        {order.id && item.id && (
          <ItemStatusTimeline pedidoId={order.id} itemId={item.id} />
        )}

          </div>{/* /pm-formcol */}

          {/* ============== STICKY SUMMARY ASIDE ============== */}
          <aside className="pm-aside">
            <div className="pm-sum">
              <h3>Resumo de Valores</h3>
              <div className="pm-sumbody">
                <div className="pm-line"><span className="k">Valor Projetado</span><span className="v">{toBRL(projected)}</span></div>
                <div className="pm-line"><span className="k">Valor Final <span style={{ fontSize: 11 }}>(sub-compras)</span></span><span className="v">{toBRL(finalValue)}</span></div>
                <div className="pm-result">
                  <div className="lk">
                    {over ? <><AlertTriangle className="h-3.5 w-3.5" /> Estouro</> : <><Wallet className="h-3.5 w-3.5" /> Economia</>}
                  </div>
                  <div className="lv" style={{ color: over ? '#ffd2d2' : '#eafaf6' }}>{toBRL(savings)}</div>
                  <div className="note">{over ? `${ecoPct.toFixed(0)}% acima do projetado` : `${ecoPct.toFixed(0)}% abaixo do projetado`}</div>
                  <div className="pm-bar">
                    <i style={{ width: `${ecoBarW}%`, background: over ? 'linear-gradient(90deg,#f1a3a3,#e05a5a)' : 'linear-gradient(90deg,#7be3a8,#1fd07a)' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="pm-actions flex flex-col gap-2.5 print:hidden">
              <Button
                onClick={handleSave}
                disabled={saving || overQuantity}
                className="w-full h-12 text-[15px] font-bold text-white border-0"
                style={{ background: 'linear-gradient(135deg,#3f8fd6,#3565c9)', boxShadow: '0 12px 26px -12px rgba(53,101,201,.8)', borderRadius: 13 }}
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
              <Button variant="outline" onClick={() => window.print()} className="w-full h-11" style={{ borderColor: '#e7ebf0', borderRadius: 13 }}>
                <Printer className="h-4 w-4 mr-1.5" /> Imprimir
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full h-11" style={{ borderColor: '#e7ebf0', borderRadius: 13 }}>
                Cancelar
              </Button>
            </div>

            <nav className="pm-jump">
              <a href="#sec-geral">Informações Gerais</a>
              <a href="#sec-compras">Detalhes das Compras</a>
              <a href="#sec-obs">Observações</a>
            </nav>
          </aside>

        </div>{/* /pm-editor */}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Date sub-component ---------- */
function DateField({ label, value, onChange }: { label: string; value?: string; onChange: (iso: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(new Date(value + 'T12:00:00'), 'dd/MM/yyyy') : 'Selecionar'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value ? new Date(value + 'T12:00:00') : undefined}
            onSelect={d => { onChange(d ? format(d, 'yyyy-MM-dd') : undefined); setOpen(false); }}
            locale={ptBR}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
