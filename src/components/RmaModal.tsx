import { useState, useEffect, useMemo, KeyboardEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, CalendarIcon, Search, ChevronRight, Plus, Trash2,
  Printer, RotateCcw, ClipboardList, Wrench, Truck,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Order, ItemStatus, RmaItem, RmaItemStatus, FreightCard,
  Company, Seller, calcFreightTotal,
} from '@/store/OrderStore';
import { useCreateRma } from '@/api/hooks/useRma';
import { useVendedores } from '@/hooks/useVendedores';
import { getApiError } from '@/api/client';
import type { CreateRmaPayload, ItemRmaStatus } from '@/types/api';
import { useOrdersQuery, PedidoListItem } from '@/hooks/use-orders-query';

/* ---------- Item status options (shared visual definition) ---------- */
const ITEM_STATUS_OPTIONS: { value: ItemRmaStatus; label: string; color: string }[] = [
  { value: 'Not Received',          label: 'Não Recebido',          color: 'bg-slate-50 text-slate-600 border-slate-300' },
  { value: 'Received',              label: 'Recebido',              color: 'bg-blue-50 text-blue-700 border-blue-300' },
  { value: 'Sent for Repair',       label: 'Enviado para Reparo',   color: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
  { value: 'In Repair',             label: 'Em Reparo',             color: 'bg-orange-50 text-orange-700 border-orange-300' },
  { value: 'Repaired Not Received', label: 'Reparado Não Recebido', color: 'bg-purple-50 text-purple-700 border-purple-300' },
  { value: 'Repaired Received',     label: 'Reparado Recebido',     color: 'bg-teal-50 text-teal-700 border-teal-300' },
  { value: 'To Pack',               label: 'A Embalar',             color: 'bg-cyan-50 text-cyan-700 border-cyan-300' },
  { value: 'Ready for Delivery',    label: 'Pronto p/ Entrega',     color: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
  { value: 'Out for Delivery',      label: 'Em Entrega',            color: 'bg-amber-50 text-amber-700 border-amber-300' },
  { value: 'Delivered',             label: 'Entregue',              color: 'bg-green-100 text-green-800 border-green-400' },
  { value: 'Estorno',               label: 'Estorno',               color: 'bg-red-50 text-red-700 border-red-300' },
];

const itemStatusColor = (s: string) =>
  ITEM_STATUS_OPTIONS.find(o => o.value === s)?.color ?? 'bg-muted text-muted-foreground border-border';

/* ---------- CSS injected into the form-step dialog ---------- */
const RMA_MODAL_CSS = `
  .rm-root{font-family:'Sora','Inter',system-ui,sans-serif}
  .rm-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px;padding-right:8px}
  .rm-head h1{font-size:22px;font-weight:700;display:flex;align-items:center;gap:12px;color:#16273f;font-family:'Space Grotesk',sans-serif;margin:0}
  .rm-oschip{font-size:12px;font-weight:700;color:#15807c;background:#e6f3f1;border:1px solid #cfe8e3;padding:5px 11px;border-radius:8px;letter-spacing:.02em}
  .rm-meta{display:flex;gap:18px;color:#6b7787;font-size:13px;flex-wrap:wrap}
  .rm-meta b{color:#16273f;font-weight:600}

  .rm-editor{display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start}
  .rm-formcol{display:flex;flex-direction:column;gap:20px;min-width:0}

  .rm-card{background:#fff;border:1px solid #e7ebf0;border-radius:18px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 10px 28px -14px rgba(20,35,55,.18);overflow:hidden;scroll-margin-top:14px}
  .rm-card>h2{font-size:14px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#15807c;padding:18px 22px;border-bottom:1px solid #e7ebf0;display:flex;align-items:center;gap:11px;background:#fcfdfe;margin:0}
  .rm-card>h2 .rm-count{color:#6b7787;font-weight:600;letter-spacing:0;text-transform:none}
  .rm-card>h2 .rm-h2-action{margin-left:auto}
  .rm-card .rm-body{padding:22px}

  .rm-ditem{border:1px solid #e7ebf0;border-radius:14px;padding:18px;background:#fcfdfe}
  .rm-ditem+.rm-ditem{margin-top:14px}
  .rm-itemhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
  .rm-itemhead .t{font-size:12px;font-weight:700;letter-spacing:.06em;color:#15807c;text-transform:uppercase}
  .rm-empty{text-align:center;color:#6b7787;padding:22px;font-size:13.5px;background:#f7f9fb;border-radius:12px;border:1px dashed #e7ebf0}
  .rm-fretetotal{text-align:right;font-weight:700;color:#15807c;margin-top:14px;font-size:14px;font-variant-numeric:tabular-nums}

  .rm-root input:focus-visible,
  .rm-root textarea:focus-visible,
  .rm-root [role="combobox"]:focus-visible{
    border-color:#16807c !important;
    box-shadow:0 0 0 3px rgba(22,128,124,.14) !important;
    outline:none !important;
  }

  .rm-aside{position:sticky;top:0;display:flex;flex-direction:column;gap:14px}
  .rm-sum{background:#fff;border:1px solid #e7ebf0;border-radius:18px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 10px 28px -14px rgba(20,35,55,.18);overflow:hidden}
  .rm-sum>h3{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7787;padding:16px 20px 4px;margin:0}
  .rm-sumbody{padding:8px 20px 18px}
  .rm-line{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;font-size:13.5px;border-bottom:1px dashed #e7ebf0}
  .rm-line:last-child{border-bottom:0}
  .rm-line .k{color:#6b7787}
  .rm-line .v{font-weight:600;color:#16273f;text-align:right;font-variant-numeric:tabular-nums}
  .rm-jump{background:#fff;border:1px solid #e7ebf0;border-radius:18px;box-shadow:0 1px 2px rgba(20,35,55,.05),0 10px 28px -14px rgba(20,35,55,.18);padding:8px}
  .rm-jump a{display:block;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;color:#6b7787;text-decoration:none;transition:.15s}
  .rm-jump a:hover{background:#f7f9fb;color:#16273f}

  @media (max-width:920px){
    .rm-editor{grid-template-columns:1fr}
    .rm-aside{position:static;order:-1}
    .rm-jump{display:none}
  }

  @media print{
    .rm-actions,.rm-jump,.rm-del,.rm-h2-action{display:none !important}
    .rm-editor{grid-template-columns:1fr !important;gap:14px}
    .rm-aside{position:static !important;order:2}
    .rm-card,.rm-sum,.rm-ditem{box-shadow:none !important;break-inside:avoid}
  }
`;

/* ---------- Utilities ---------- */
function toBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function parseBRL(s: string): number { return parseFloat(s.replace(/[R$\s.]/g, '').replace(',', '.')) || 0; }
function fmtDate(iso?: string | null) {
  if (!iso) return 'Selecionar';
  return format(new Date(iso + 'T12:00:00'), 'dd/MM/yyyy');
}
function handleEnterBlur(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
}

type Step = 'pick-order' | 'pick-items' | 'pick-sub-purchase' | 'form';

interface LocalSubPurchase {
  id: string;
  supplier: string;
  purchaseDate?: string;
  purchaseValue: number;
  quantity: number;
}

interface LocalParentItem {
  id: string;
  name: string;
  quantity: number;
  status: ItemStatus;
  projectedValue: number;
  purchaseValue: number;
  supplier: string;
  subPurchases: LocalSubPurchase[];
}

interface RmaParent {
  id: string;
  os: string;
  customer: string;
  cnpj: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  orders?: Order[];
  rma?: Order | null;
  onSave: (rma: Order) => void;
  nextRmaNumber: (parentOs: string) => string;
}

export function RmaModal({ open, onClose, orders, rma, onSave, nextRmaNumber }: Props) {
  const isEdit = !!rma;
  const [step, setStep] = useState<Step>(isEdit ? 'form' : 'pick-order');

  const { mutate: createRma, isPending } = useCreateRma();
  const { data: vendedoresData } = useVendedores();
  const vendedores = vendedoresData?.items ?? [];

  /* ---------- Step 1: delivered orders from API ---------- */
  const [orderSearch, setOrderSearch] = useState('');
  const [deliveredPage, setDeliveredPage] = useState(1);
  const {
    data: deliveredData,
    isLoading: deliveredLoading,
    isError: deliveredError,
    refetch: deliveredRefetch,
  } = useOrdersQuery(
    { page: deliveredPage, limit: 20, status: 'Delivered', sort_by: 'data_entrega', sort_dir: 'desc' },
    { enabled: open && !isEdit }
  );

  const filteredDelivered = useMemo(() => {
    const items = deliveredData?.items ?? [];
    const q = orderSearch.toLowerCase().trim();
    if (!q) return items;
    return items.filter(o =>
      o.numero_os.toLowerCase().includes(q) ||
      (o.nome_cliente ?? '').toLowerCase().includes(q)
    );
  }, [deliveredData, orderSearch]);

  /* ---------- Step 2: item selection ---------- */
  const [localParentItems, setLocalParentItems] = useState<LocalParentItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  /* ---------- Step 2.5: sub-purchase selection ---------- */
  const [selectedSubPurchaseIds, setSelectedSubPurchaseIds] = useState<Record<string, string>>({});

  /* ---------- Form state ---------- */
  const [parent, setParent] = useState<RmaParent | null>(null);
  const [rmaNumberDisplay, setRmaNumberDisplay] = useState('');
  const [registrationDate, setRegistrationDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const [actualDeliveryDate, setActualDeliveryDate] = useState<string>('');
  const [seller, setSeller] = useState<Seller>('');
  const [company, setCompany] = useState<Company>('');
  const [rmaItems, setRmaItems] = useState<RmaItem[]>([]);
  const [freight, setFreight] = useState<FreightCard[]>([]);
  const [observations, setObservations] = useState('');
  const [regDateOpen, setRegDateOpen] = useState(false);
  const [delDateOpen, setDelDateOpen] = useState(false);
  const [actualDelDateOpen, setActualDelDateOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (rma) {
      setParent({
        id: rma.rmaParentOrderId || rma.id,
        os: rma.rmaNumber || rma.os,
        customer: rma.customer,
        cnpj: rma.cnpj || '',
      });
      setStep('form');
      setRmaNumberDisplay(rma.rmaNumber || rma.os);
      setRegistrationDate(rma.orderDate);
      setDeliveryDate(rma.deliveryDate);
      setActualDeliveryDate(rma.rmaActualDeliveryDate || '');
      setSeller(rma.seller);
      setCompany(rma.company);
      setRmaItems(rma.rmaItems ? rma.rmaItems.map(i => ({ ...i })) : []);
      setFreight(rma.rmaFreight ? rma.rmaFreight.map(f => ({ ...f })) : []);
      setObservations(rma.observations || '');
    } else {
      setStep('pick-order');
      setOrderSearch('');
      setDeliveredPage(1);
      setParent(null);
      setLocalParentItems([]);
      setSelectedItemIds(new Set());
      setSelectedSubPurchaseIds({});
      setRegistrationDate(format(new Date(), 'yyyy-MM-dd'));
      setDeliveryDate(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
      setActualDeliveryDate('');
      setSeller('');
      setCompany('');
      setRmaItems([]);
      setFreight([]);
      setObservations('');
      setRmaNumberDisplay('');
    }
  }, [open, rma]);

  const choosePicked = (o: PedidoListItem) => {
    setParent({ id: o.id, os: o.numero_os, customer: o.nome_cliente ?? '', cnpj: '' });
    setCompany((o.nome_loja ?? '') as Company);
    setSeller((o.nome_vendedor ?? '') as Seller);
    setRmaNumberDisplay(nextRmaNumber(o.numero_os));
    const apiItems: LocalParentItem[] = (o.produtos ?? []).map(p => ({
      id: p.id,
      name: p.descricao,
      quantity: p.quantidade,
      status: p.status as ItemStatus,
      projectedValue: parseFloat(String(p.valor_projetado)) || 0,
      purchaseValue: parseFloat(String(p.valor_compra ?? '0')) || 0,
      supplier: p.fornecedor ?? '',
      subPurchases: (p.sub_compras ?? []).map(sc => ({
        id: sc.id,
        supplier: sc.supplier,
        purchaseDate: sc.purchaseDate,
        purchaseValue: sc.purchaseValue,
        quantity: sc.selectedQuantity,
      })),
    }));
    setLocalParentItems(apiItems);
    setSelectedItemIds(new Set());
    setSelectedSubPurchaseIds({});
    setRmaItems([]);
    setStep('pick-items');
  };

  const toggleItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const itemsNeedingSubSelection = useMemo(() => {
    return localParentItems.filter(i => selectedItemIds.has(i.id) && i.subPurchases.length > 1);
  }, [localParentItems, selectedItemIds]);

  const goToSubPurchaseOrForm = () => {
    if (itemsNeedingSubSelection.length > 0) {
      setStep('pick-sub-purchase');
    } else {
      buildRmaItemsAndGoToForm();
    }
  };

  const buildRmaItemsAndGoToForm = () => {
    if (localParentItems.length > 0) {
      const picked = localParentItems.filter(i => selectedItemIds.has(i.id));
      setRmaItems(picked.map<RmaItem>(i => {
        const subId = selectedSubPurchaseIds[i.id];
        const sub = subId ? i.subPurchases.find(s => s.id === subId) : null;
        const suffix = sub ? ` (${sub.supplier})` : '';
        return {
          id: crypto.randomUUID(),
          sourceItemId: i.id,
          name: i.name + suffix,
          quantity: sub ? sub.quantity : i.quantity,
          repairedBy: '',
          supplier: sub ? sub.supplier : i.supplier,
          status: 'Not Received',
        };
      }));
    }
    setStep('form');
  };

  /* ---------- Back navigation ---------- */
  const goBack = () => {
    if (step === 'form' && itemsNeedingSubSelection.length > 0) setStep('pick-sub-purchase');
    else if (step === 'form') setStep('pick-items');
    else if (step === 'pick-sub-purchase') setStep('pick-items');
    else if (step === 'pick-items') setStep('pick-order');
  };

  /* ---------- RMA items (form step) ---------- */
  const addRmaItem = () => setRmaItems(prev => [...prev, {
    id: crypto.randomUUID(),
    sourceItemId: '',
    name: '',
    quantity: 1,
    repairedBy: '',
    supplier: '',
    status: 'Not Received' as RmaItemStatus,
  }]);
  const removeRmaItem = (id: string) => setRmaItems(prev => prev.filter(i => i.id !== id));
  const updateRmaItem = (id: string, field: keyof RmaItem, value: any) =>
    setRmaItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  /* ---------- Freight ---------- */
  const addFreight = () => setFreight(prev => [...prev, {
    id: crypto.randomUUID(), deliveryPerson: '', value: 0, deliveryDate: undefined,
  }]);
  const updateFreight = (id: string, field: keyof FreightCard, value: any) =>
    setFreight(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  const removeFreight = (id: string) => setFreight(prev => prev.filter(f => f.id !== id));
  const freightTotal = useMemo(() => calcFreightTotal(freight), [freight]);

  /* ---------- Save ---------- */
  const handleSave = () => {
    if (!parent || rmaItems.length === 0) return;
    const rmaNumber = isEdit ? (rma!.rmaNumber || rma!.os) : nextRmaNumber(parent.os);
    const newOrder: Order = {
      id: rma?.id || crypto.randomUUID(),
      os: rmaNumber,
      createdAt: rma?.createdAt || Date.now(),
      orderDate: registrationDate,
      customer: parent.customer,
      cnpj: parent.cnpj,
      company,
      seller,
      ocAfPed: '',
      directBilling: false,
      supplier: '',
      invoice: '',
      invoiceSupplier: '',
      paymentMethods: [],
      installments: 1,
      deliveryDate,
      rmaActualDeliveryDate: actualDeliveryDate || undefined,
      status: 'To Pack',
      isRMA: true,
      rmaNumber,
      rmaParentOrderId: parent.id,
      cancelled: false,
      observations: observations || `RMA do pedido ${parent.os}`,
      initialProductCost: 0, finalProductCost: 0,
      boletoCost: 0, giftCost: 0,
      creditCostPercent: 0, creditCostValue: 0,
      debitCostPercent: 0, debitCostValue: 0,
      purchaseTaxPercent: 0, purchaseTaxValue: 0,
      salesTaxPercent: 0, salesTaxValue: 0,
      salesValue: 0,
      items: [],
      directSupplyItems: [],
      freight: [],
      rmaItems,
      rmaFreight: freight,
    };

    if (isEdit) {
      onSave(newOrder);
      onClose();
      return;
    }

    const payload: CreateRmaPayload = {
      id_pedido_origem: parent.id,
      prazo_entrega: deliveryDate || undefined,
      itens: rmaItems.map(i => ({ descricao: i.name, quantidade: i.quantity, fornecedor: i.supplier || undefined })),
    };

    createRma(payload, {
      onSuccess: () => {
        toast.success('RMA criado com sucesso');
        onSave(newOrder);
        onClose();
      },
      onError: (err) => toast.error(getApiError(err)),
    });
  };

  const isFormStep = step === 'form';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className={cn(
        'overflow-y-auto',
        isFormStep
          ? 'w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] bg-[#eef1f5] rm-root print:max-w-full print:max-h-none'
          : 'max-w-4xl max-h-[90vh] bg-card',
      )}>
        {isFormStep ? (
          <DialogHeader className="sr-only">
            <DialogTitle>{isEdit ? `Editar RMA — ${rmaNumberDisplay}` : `Novo RMA — ${rmaNumberDisplay}`}</DialogTitle>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#16273F] flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {!isEdit && step !== 'pick-order' && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {step === 'pick-order' && 'Novo RMA — Selecionar Pedido Entregue'}
              {step === 'pick-items' && `RMA — Selecionar Itens (Pedido #${parent?.os})`}
              {step === 'pick-sub-purchase' && `RMA — Especificar Compra (Pedido #${parent?.os})`}
            </DialogTitle>
          </DialogHeader>
        )}

        {/* ===== STEP 1: pick order ===== */}
        {step === 'pick-order' && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar OS ou Cliente..."
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                onKeyDown={handleEnterBlur}
                className="pl-9 bg-white"
                autoFocus
              />
            </div>
            {deliveredError && (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between">
                  <span>Falha ao carregar pedidos entregues.</span>
                  <Button variant="outline" size="sm" onClick={() => deliveredRefetch()}>Tentar novamente</Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#F8FAFD]">
                    <TableHead>OS</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Data Entrega</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveredLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredDelivered.map(o => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => choosePicked(o)}>
                      <TableCell className="font-medium">{o.numero_os}</TableCell>
                      <TableCell>{o.nome_cliente || '—'}</TableCell>
                      <TableCell>{o.nome_loja || '—'}</TableCell>
                      <TableCell>{o.nome_vendedor || '—'}</TableCell>
                      <TableCell>{fmtDate(o.data_entrega)}</TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                  {!deliveredLoading && filteredDelivered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum pedido entregue encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {(deliveredData?.pages ?? 1) > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
                <span>{deliveredData?.total ?? 0} pedidos entregues</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={deliveredPage <= 1}
                    onClick={() => setDeliveredPage(p => p - 1)}>Anterior</Button>
                  <span>Página {deliveredPage} de {deliveredData?.pages ?? 1}</span>
                  <Button variant="outline" size="sm" disabled={deliveredPage >= (deliveredData?.pages ?? 1)}
                    onClick={() => setDeliveredPage(p => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== STEP 2: pick items ===== */}
        {step === 'pick-items' && parent && (
          <>
            <p className="text-sm text-muted-foreground">
              Cliente: <span className="font-medium text-foreground">{parent.customer || '—'}</span>
              {parent.cnpj && <> · CPF/CNPJ: <span className="font-medium text-foreground">{parent.cnpj}</span></>}
            </p>
            {localParentItems.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#F8FAFD]">
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localParentItems.map(it => (
                      <TableRow key={it.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleItem(it.id)}>
                        <TableCell>
                          <Checkbox checked={selectedItemIds.has(it.id)} onCheckedChange={() => toggleItem(it.id)} />
                        </TableCell>
                        <TableCell>{it.name}</TableCell>
                        <TableCell>{it.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                Nenhum produto encontrado para este pedido no sistema local.
                <br />
                Você poderá adicionar os itens manualmente na próxima etapa.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                onClick={goToSubPurchaseOrForm}
                disabled={localParentItems.length > 0 && selectedItemIds.size === 0}
                className="bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white"
              >
                {localParentItems.length > 0
                  ? `Próximo (${selectedItemIds.size} ${selectedItemIds.size === 1 ? 'item' : 'itens'})`
                  : 'Continuar'}
              </Button>
            </div>
          </>
        )}

        {/* ===== STEP 2.5: pick sub-purchase ===== */}
        {step === 'pick-sub-purchase' && parent && (
          <>
            <p className="text-sm text-muted-foreground">
              Os itens abaixo foram comprados de múltiplos fornecedores. Selecione qual compra está sendo trocada.
            </p>
            <div className="space-y-4">
              {itemsNeedingSubSelection.map(item => (
                <div key={item.id} className="border border-[#E2E8F1] rounded-xl p-4">
                  <h4 className="text-sm font-bold text-[#16273F] mb-3">{item.name} (Qtd: {item.quantity})</h4>
                  <div className="space-y-2">
                    {item.subPurchases.map(sp => (
                      <label
                        key={sp.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          selectedSubPurchaseIds[item.id] === sp.id
                            ? 'border-[#2F6BFF] bg-[#EEF2FF]'
                            : 'border-[#E2E8F1] bg-[#F8FAFD] hover:bg-[#F0F4FA]'
                        )}
                        onClick={() => setSelectedSubPurchaseIds(prev => ({ ...prev, [item.id]: sp.id }))}
                      >
                        <input
                          type="radio"
                          name={`sub-${item.id}`}
                          checked={selectedSubPurchaseIds[item.id] === sp.id}
                          onChange={() => setSelectedSubPurchaseIds(prev => ({ ...prev, [item.id]: sp.id }))}
                          className="accent-[#2F6BFF]"
                        />
                        <div className="flex-1">
                          <span className="font-semibold text-sm">{sp.supplier || 'Fornecedor não informado'}</span>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Qtd: {sp.quantity}
                            {sp.purchaseDate && <> · Compra: {format(new Date(sp.purchaseDate + 'T12:00:00'), 'dd/MM/yyyy')}</>}
                            {sp.purchaseValue > 0 && <> · Valor: {toBRL(sp.purchaseValue)}</>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                onClick={buildRmaItemsAndGoToForm}
                disabled={itemsNeedingSubSelection.some(i => !selectedSubPurchaseIds[i.id])}
                className="bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white"
              >
                Próximo
              </Button>
            </div>
          </>
        )}

        {/* ===== STEP 3: form (two-column design matching RmaEditModal) ===== */}
        {step === 'form' && parent && (
          <>
            <style>{RMA_MODAL_CSS}</style>

            {/* Page header */}
            <div className="rm-head">
              <h1>
                <span className="rm-oschip">{rmaNumberDisplay}</span>
                {isEdit ? 'Editar RMA' : 'Novo RMA'}
              </h1>
              <div className="rm-meta">
                <span>Pedido origem <b>{parent.os}</b></span>
                <span>Cliente <b>{parent.customer || '—'}</b></span>
              </div>
              <Button
                variant="outline" size="icon"
                onClick={() => window.print()}
                className="ml-auto"
                style={{ borderColor: '#e7ebf0', borderRadius: 11, width: 40, height: 40, color: '#6b7787' }}
                title="Imprimir"
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>

            {/* 2-column editor */}
            <div className="rm-editor">
              <div className="rm-formcol">

                {/* Informações Gerais */}
                <section className="rm-card" id="sec-geral">
                  <h2><ClipboardList className="h-4 w-4" /> Informações Gerais</h2>
                  <div className="rm-body">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label>Nº RMA (auto)</Label>
                        <Input readOnly className="bg-[#F4F7FB] border-[#E2E8F1] font-semibold" value={rmaNumberDisplay} />
                      </div>
                      <div>
                        <Label>Pedido Origem</Label>
                        <Input readOnly value={parent.os} className="bg-[#F4F7FB] border-[#E2E8F1]" />
                      </div>
                      <div>
                        <Label>Cliente</Label>
                        <Input readOnly value={parent.customer} className="bg-[#F4F7FB] border-[#E2E8F1]" />
                      </div>
                      <div>
                        <Label>CPF/CNPJ</Label>
                        <Input readOnly value={parent.cnpj || '—'} className="bg-[#F4F7FB] border-[#E2E8F1]" />
                      </div>
                      <div>
                        <Label>Data de Registro *</Label>
                        <Popover open={regDateOpen} onOpenChange={setRegDateOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                              <CalendarIcon className="mr-2 h-4 w-4" />{fmtDate(registrationDate)}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single"
                              selected={registrationDate ? new Date(registrationDate + 'T12:00:00') : undefined}
                              onSelect={d => { if (d) setRegistrationDate(format(d, 'yyyy-MM-dd')); setRegDateOpen(false); }}
                              locale={ptBR} className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label>Empresa *</Label>
                        <Select value={company || ''} onValueChange={v => setCompany(v as Company)}>
                          <SelectTrigger className="bg-[#FBFCFE] border-[#E2E8F1]"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Lucky Store">Lucky Store</SelectItem>
                            <SelectItem value="BTech">BTech</SelectItem>
                            <SelectItem value="AJJ">AJJ</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Vendedor *</Label>
                        <Select value={seller || ''} onValueChange={v => setSeller(v as Seller)}>
                          <SelectTrigger className="bg-[#FBFCFE] border-[#E2E8F1]"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>
                            {vendedores.map(v => <SelectItem key={v.id} value={v.nome}>{v.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Prazo de Entrega *</Label>
                        <Popover open={delDateOpen} onOpenChange={setDelDateOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                              <CalendarIcon className="mr-2 h-4 w-4" />{fmtDate(deliveryDate)}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single"
                              selected={deliveryDate ? new Date(deliveryDate + 'T12:00:00') : undefined}
                              onSelect={d => { if (d) setDeliveryDate(format(d, 'yyyy-MM-dd')); setDelDateOpen(false); }}
                              locale={ptBR} className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label>Data de Entrega Real</Label>
                        <Popover open={actualDelDateOpen} onOpenChange={setActualDelDateOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal bg-white">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {actualDeliveryDate ? fmtDate(actualDeliveryDate) : 'Selecionar'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single"
                              selected={actualDeliveryDate ? new Date(actualDeliveryDate + 'T12:00:00') : undefined}
                              onSelect={d => { setActualDeliveryDate(d ? format(d, 'yyyy-MM-dd') : ''); setActualDelDateOpen(false); }}
                              locale={ptBR} className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Itens do RMA */}
                <section className="rm-card" id="sec-itens">
                  <h2>
                    <Wrench className="h-4 w-4" /> Itens do RMA
                    <span className="rm-count">({rmaItems.length})</span>
                    <Button size="sm" onClick={addRmaItem} className="rm-h2-action bg-[#15807c] hover:bg-[#0f5d5b] text-white">
                      <Plus className="h-4 w-4 mr-1" /> Adicionar Item
                    </Button>
                  </h2>
                  <div className="rm-body">
                    {rmaItems.length === 0 && (
                      <div className="rm-empty">Nenhum item adicionado. Clique em "Adicionar Item" para inserir produtos.</div>
                    )}
                    {rmaItems.map((it, idx) => (
                      <div key={it.id} className="rm-ditem">
                        <div className="rm-itemhead">
                          <span className="t">Item #{idx + 1}</span>
                          <Button variant="ghost" size="icon" className="rm-del" onClick={() => removeRmaItem(it.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                          <div className="md:col-span-2">
                            <Label>Produto</Label>
                            <Input className="bg-[#FBFCFE] border-[#E2E8F1]" value={it.name}
                              onChange={e => updateRmaItem(it.id, 'name', e.target.value)} onKeyDown={handleEnterBlur} />
                          </div>
                          <div>
                            <Label>Quantidade</Label>
                            <Input type="number" min={1} className="bg-[#FBFCFE] border-[#E2E8F1]" value={it.quantity}
                              onChange={e => updateRmaItem(it.id, 'quantity', parseInt(e.target.value) || 1)} onKeyDown={handleEnterBlur} />
                          </div>
                          <div>
                            <Label>Status</Label>
                            <Select value={it.status} onValueChange={v => updateRmaItem(it.id, 'status', v as RmaItemStatus)}>
                              <SelectTrigger className={cn('border', itemStatusColor(it.status))}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ITEM_STATUS_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', opt.color)}>{opt.label}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-2">
                            <Label>Reparado por</Label>
                            <Input
                              className="bg-[#FBFCFE] border-[#E2E8F1]"
                              value={it.repairedBy || ''}
                              onChange={e => updateRmaItem(it.id, 'repairedBy', e.target.value)}
                              onKeyDown={handleEnterBlur}
                              placeholder="Fornecedor / técnico"
                            />
                          </div>
                          <div>
                            <Label>Fornecedor</Label>
                            <Input
                              className="bg-[#FBFCFE] border-[#E2E8F1]"
                              value={it.supplier || ''}
                              onChange={e => updateRmaItem(it.id, 'supplier', e.target.value)}
                              onKeyDown={handleEnterBlur}
                              placeholder="Fornecedor de origem"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Devoluções / Estorno (info only on creation) */}
                <section className="rm-card" id="sec-devolucao">
                  <h2><RotateCcw className="h-4 w-4" /> Devoluções / Estorno</h2>
                  <div className="rm-body">
                    <div className="rm-empty">
                      Os dados de estorno (valor, data e motivo) devem ser preenchidos após a criação do RMA, ao editar cada item individualmente.
                    </div>
                  </div>
                </section>

                {/* Fretes */}
                <section className="rm-card" id="sec-fretes">
                  <h2>
                    <Truck className="h-4 w-4" /> Fretes
                    <span className="rm-count">({freight.length})</span>
                    <Button size="sm" onClick={addFreight} className="rm-h2-action bg-[#15807c] hover:bg-[#0f5d5b] text-white">
                      <Plus className="h-4 w-4 mr-1" /> Adicionar Frete
                    </Button>
                  </h2>
                  <div className="rm-body">
                    {freight.length === 0 && (
                      <div className="rm-empty">Nenhum frete adicionado</div>
                    )}
                    <div className="space-y-2">
                      {freight.map((f, idx) => (
                        <RmaFreightRow key={f.id} idx={idx} card={f}
                          onChange={(k, v) => updateFreight(f.id, k, v)}
                          onRemove={() => removeFreight(f.id)} />
                      ))}
                    </div>
                    {freight.length > 0 && (
                      <div className="rm-fretetotal">Total: {toBRL(freightTotal)}</div>
                    )}
                  </div>
                </section>

                {/* Observações */}
                <section className="rm-card" id="sec-obs">
                  <h2>Observações</h2>
                  <div className="rm-body">
                    <Textarea
                      className="bg-[#FBFCFE] border-[#E2E8F1] min-h-24"
                      value={observations}
                      onChange={e => setObservations(e.target.value)}
                      placeholder="Anotações sobre este RMA..."
                    />
                  </div>
                </section>

              </div>{/* /rm-formcol */}

              {/* Sticky summary aside */}
              <aside className="rm-aside">
                <div className="rm-sum">
                  <h3>Resumo do RMA</h3>
                  <div className="rm-sumbody">
                    <div className="rm-line"><span className="k">Nº RMA</span><span className="v">{rmaNumberDisplay || '—'}</span></div>
                    <div className="rm-line"><span className="k">Pedido origem</span><span className="v">{parent.os}</span></div>
                    <div className="rm-line"><span className="k">Cliente</span><span className="v">{parent.customer || '—'}</span></div>
                    {company && <div className="rm-line"><span className="k">Empresa</span><span className="v">{company}</span></div>}
                    {seller && <div className="rm-line"><span className="k">Vendedor</span><span className="v">{seller}</span></div>}
                    <div className="rm-line"><span className="k">Prazo</span><span className="v">{deliveryDate ? fmtDate(deliveryDate) : '—'}</span></div>
                    <div className="rm-line"><span className="k">Itens</span><span className="v">{rmaItems.length}</span></div>
                    {freightTotal > 0 && (
                      <div className="rm-line"><span className="k">Total Fretes</span><span className="v">{toBRL(freightTotal)}</span></div>
                    )}
                  </div>
                </div>

                <div className="rm-actions flex flex-col gap-2.5 print:hidden">
                  <Button
                    onClick={handleSave}
                    disabled={isPending || rmaItems.length === 0}
                    className="w-full h-12 text-[15px] font-bold text-white border-0"
                    style={{ background: 'linear-gradient(135deg,#1f7a6f,#0f5d5b)', boxShadow: '0 12px 26px -12px rgba(15,93,91,.8)', borderRadius: 13 }}
                  >
                    {isPending ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Criar RMA')}
                  </Button>
                  <Button variant="outline" onClick={() => window.print()}
                    className="w-full h-11" style={{ border: '1.5px solid #15807c', color: '#15807c', borderRadius: 13 }}>
                    <Printer className="h-4 w-4 mr-1.5" /> Imprimir
                  </Button>
                  <Button variant="outline" onClick={onClose} className="w-full h-11" style={{ borderColor: '#e7ebf0', borderRadius: 13 }}>
                    Cancelar
                  </Button>
                </div>

                <nav className="rm-jump">
                  <a href="#sec-geral">Informações Gerais</a>
                  <a href="#sec-itens">Itens do RMA</a>
                  <a href="#sec-devolucao">Devoluções / Estorno</a>
                  <a href="#sec-fretes">Fretes</a>
                  <a href="#sec-obs">Observações</a>
                </nav>
              </aside>

            </div>{/* /rm-editor */}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- RMA Freight row ---------- */
function RmaFreightRow({ idx, card, onChange, onRemove }: {
  idx: number; card: FreightCard;
  onChange: (k: keyof FreightCard, v: any) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <div className="grid grid-cols-12 gap-2 items-center rm-ditem" style={{ padding: 12 }}>
      <span className="col-span-1 text-xs font-bold" style={{ color: '#15807c' }}>#{idx + 1}</span>
      <Input placeholder="Entregador" className="col-span-4 bg-[#FBFCFE] border-[#E2E8F1]"
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
      <Button variant="ghost" size="icon" className="col-span-1 rm-del" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
