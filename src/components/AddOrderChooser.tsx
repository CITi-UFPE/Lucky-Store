import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search, ChevronRight, FilePlus, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Quote, QUOTE_PHASE_LABELS, QUOTE_PHASE_COLORS } from '@/store/QuoteStore';
import type { DirectSupplyOrderItem } from '@/store/OrderStore';
import { apiClient } from '@/api/client';
import { LOJA_IDS, VENDEDOR_IDS } from '@/api/storeConfig';
import type { CotacaoResponse, PaginatedResponse } from '@/types/api';

const LOJA_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(LOJA_IDS).map(([name, id]) => [id, name])
);
const VENDEDOR_BY_ID: Record<string, string> = Object.fromEntries(
  Object.entries(VENDEDOR_IDS).map(([name, id]) => [id, name])
);

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return format(new Date(iso + 'T12:00:00'), 'dd/MM/yyyy');
}
function toBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function getCotacaoPhase(c: CotacaoResponse) {
  if (c.status_caida) return 'dropped';
  if (c.status_fechada) return 'closed';
  if (c.status_em_fechamento) return 'forClosing';
  if (c.status_enviada) return 'sent';
  return null;
}

export interface OrderPrefill {
  /** Cotação de origem, quando o pedido é criado a partir de uma cotação */
  sourceQuoteId?: string;
  /** A EMPRESA. */
  customer: string;
  customerCompany?: string;
  /** A pessoa de contato dentro dela. */
  customerContact?: string;
  cnpj: string;
  company: Quote['company'];
  seller: Quote['seller'];
  salesValue: number;
  directBilling: boolean;
  items: { id: string; name: string; quantity: number; projectedValue: number }[];
  directSupplyItems: DirectSupplyOrderItem[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  quotes?: Quote[];
  onChooseNew: () => void;
  onChooseFromQuote: (prefill: OrderPrefill) => void;
}

type Step = 'choose' | 'pick-quote' | 'pick-items';

export function AddOrderChooser({ open, onClose, onChooseNew, onChooseFromQuote }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<CotacaoResponse | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [quotePage, setQuotePage] = useState(1);

  const {
    data: quotesData,
    isLoading: quotesLoading,
    isError: quotesError,
    refetch: quotesRefetch,
  } = useQuery<PaginatedResponse<CotacaoResponse>>({
    queryKey: ['quotes', 'list', 'chooser', quotePage],
    queryFn: () =>
      apiClient.get('/quotes', {
        params: { page: quotePage, limit: 20, sort_by: 'data_cotacao', sort_dir: 'desc', eligible_for_order: true },
      }).then(r => r.data),
    enabled: open && step === 'pick-quote',
    staleTime: 60_000,
  });

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      onClose();
      setTimeout(() => {
        setStep('choose');
        setPicked(null);
        setSelectedItemIds(new Set());
        setSearch('');
        setQuotePage(1);
      }, 200);
    }
  };

  const eligibleQuotes = useMemo(() => {
    const items = quotesData?.items ?? [];
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter(qt =>
      qt.cliente.toLowerCase().includes(q) ||
      (qt.cnpj_cliente ?? '').toLowerCase().includes(q) ||
      (LOJA_BY_ID[qt.id_loja] ?? '').toLowerCase().includes(q)
    );
  }, [quotesData, search]);

  const pickQuote = (qt: CotacaoResponse) => {
    setPicked(qt);
    setSelectedItemIds(new Set((qt.itens ?? []).map(i => i.id)));
    setStep('pick-items');
  };

  const toggleItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmFromQuote = () => {
    if (!picked) return;
    const chosen = (picked.itens ?? []).filter(i => selectedItemIds.has(i.id));
    const regularItems = chosen.filter(i => !i.is_direct_supply);
    const dsItems = chosen.filter(i => i.is_direct_supply);
    const hasDirect = picked.itens?.some(i => i.is_direct_supply) ?? false;
    const prefill: OrderPrefill = {
      sourceQuoteId: picked.id,
      // Empresa e pessoa vao separadas. Antes eram fundidas aqui — escolhia a
      // empresa se existisse, senao o contato — e o pedido nascia sem saber
      // qual das duas coisas tinha recebido.
      customer: (picked.b2b_company?.trim()) ? picked.b2b_company : picked.cliente,
      customerContact: (picked.b2b_company?.trim()) ? (picked.cliente ?? '') : '',
      cnpj: picked.cnpj_cliente ?? '',
      company: (LOJA_BY_ID[picked.id_loja] ?? '') as Quote['company'],
      seller: (VENDEDOR_BY_ID[picked.id_vendedor] ?? '') as Quote['seller'],
      salesValue: parseFloat(picked.valor_total ?? '0') || 0,
      directBilling: hasDirect,
      items: regularItems.map(i => ({
        id: crypto.randomUUID(),
        name: i.descricao,
        quantity: i.quantidade,
        projectedValue: parseFloat(i.valor_unitario) || 0,
      })),
      directSupplyItems: dsItems.map(i => {
        const closingVal = i.valor_fechamento ? (parseFloat(i.valor_fechamento) || 0) : (parseFloat(i.valor_unitario) || 0);
        return {
          id: crypto.randomUUID(),
          name: i.descricao,
          quantity: i.quantidade,
          projectedValue: parseFloat(i.valor_unitario) || 0,
          purchaseValue: 0,
          closingValue: closingVal,
          supplier: i.fornecedor || '',
          supplierPct: parseFloat(i.porcentagem_fornecedor ?? '0') || 0,
          supplierFreight: parseFloat(i.frete_fornecedor ?? '0') || 0,
          supplierInvoice: '',
        };
      }),
    };
    onChooseFromQuote(prefill);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="text-secondary text-xl flex items-center gap-2">
            {step !== 'choose' && (
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => setStep(step === 'pick-items' ? 'pick-quote' : 'choose')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {step === 'choose' && 'Adicionar Pedido'}
            {step === 'pick-quote' && 'Selecionar Cotação'}
            {step === 'pick-items' && `Selecionar Itens — ${picked?.b2b_company?.trim() || picked?.cliente}`}
          </DialogTitle>
        </DialogHeader>

        {step === 'choose' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-4">
            <button
              onClick={() => setStep('pick-quote')}
              className="border-2 border-secondary/30 hover:border-secondary hover:bg-secondary/5 rounded-xl p-6 text-left transition-all group"
            >
              <FileText className="h-8 w-8 text-secondary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-secondary uppercase text-sm tracking-wide">Cadastrar a partir de cotação</h3>
              <p className="text-sm text-muted-foreground mt-2">Pré-preencha o pedido com dados de uma cotação fechada ou caída.</p>
            </button>
            <button
              onClick={() => { onChooseNew(); handleOpenChange(false); }}
              className="border-2 border-secondary/30 hover:border-secondary hover:bg-secondary/5 rounded-xl p-6 text-left transition-all group"
            >
              <FilePlus className="h-8 w-8 text-secondary mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-secondary uppercase text-sm tracking-wide">Cadastrar novo pedido</h3>
              <p className="text-sm text-muted-foreground mt-2">Abrir um pedido em branco e preencher manualmente.</p>
            </button>
          </div>
        )}

        {step === 'pick-quote' && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente, CPF/CNPJ, empresa..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="pl-9 bg-white"
                autoFocus
              />
            </div>
            {quotesError && (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between">
                  <span>Falha ao carregar cotações.</span>
                  <Button variant="outline" size="sm" onClick={() => quotesRefetch()}>Tentar novamente</Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/10">
                    <TableHead>Cliente</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : eligibleQuotes.map(qt => {
                    const phase = getCotacaoPhase(qt);
                    return (
                      <TableRow key={qt.id} className="cursor-pointer hover:bg-muted/50" onClick={() => pickQuote(qt)}>
                        <TableCell className="font-medium">{qt.b2b_company?.trim() || qt.cliente}</TableCell>
                        <TableCell>{LOJA_BY_ID[qt.id_loja] || '—'}</TableCell>
                        <TableCell>{fmtDate(qt.data_cotacao)}</TableCell>
                        <TableCell>
                          {phase && (
                            <span className={cn('px-2 py-0.5 rounded text-xs font-semibold border',
                              QUOTE_PHASE_COLORS[phase as keyof typeof QUOTE_PHASE_COLORS])}>
                              {QUOTE_PHASE_LABELS[phase as keyof typeof QUOTE_PHASE_LABELS]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {qt.valor_total ? toBRL(parseFloat(qt.valor_total)) : '—'}
                        </TableCell>
                        <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    );
                  })}
                  {!quotesLoading && eligibleQuotes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma cotação fechada ou caída encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {(quotesData?.pages ?? 1) > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
                <span>{quotesData?.total ?? 0} cotações</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={quotePage <= 1}
                    onClick={() => setQuotePage(p => p - 1)}>Anterior</Button>
                  <span>Página {quotePage} de {quotesData?.pages ?? 1}</span>
                  <Button variant="outline" size="sm" disabled={quotePage >= (quotesData?.pages ?? 1)}
                    onClick={() => setQuotePage(p => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 'pick-items' && picked && (
          <>
            <p className="text-sm text-muted-foreground">
              Cliente: <span className="font-medium text-foreground">{picked.b2b_company?.trim() || picked.cliente}</span>
              {' · '}CPF/CNPJ: <span className="font-medium text-foreground">{picked.cnpj_cliente || '—'}</span>
              {' · '}Empresa: <span className="font-medium text-foreground">{LOJA_BY_ID[picked.id_loja] || '—'}</span>
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/10">
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead className="text-right">Custo do produto</TableHead>
                    <TableHead className="text-right">Valor enviado na cotação</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(picked.itens ?? []).map(it => (
                    <TableRow key={it.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleItem(it.id)}>
                      <TableCell><Checkbox checked={selectedItemIds.has(it.id)} onCheckedChange={() => toggleItem(it.id)} /></TableCell>
                      <TableCell>{it.descricao}</TableCell>
                      <TableCell>{it.quantidade}</TableCell>
                      <TableCell className="text-right">{toBRL(parseFloat(it.valor_unitario) || 0)}</TableCell>
                      <TableCell className="text-right">
                        {it.valor_fechamento ? toBRL(parseFloat(it.valor_fechamento)) : '—'}
                      </TableCell>
                      <TableCell>
                        {it.is_direct_supply && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium border border-amber-400 bg-amber-50 text-amber-700">
                            Forn. Direto
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(picked.itens ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        Esta cotação não possui itens. Você pode prosseguir mesmo assim.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
              <Button onClick={confirmFromQuote} className="bg-secondary hover:bg-secondary/90">
                Criar Pedido ({selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'itens'})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
