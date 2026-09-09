import React, { createContext, useContext, useState, useCallback } from 'react';
import { Company, Seller, PaymentMethod } from './OrderStore';

export type QuotePhaseKey = 'sent' | 'forClosing' | 'closed' | 'dropped';

export const QUOTE_PHASE_LABELS: Record<QuotePhaseKey, string> = {
  sent: 'Enviada',
  forClosing: 'Em Fechamento',
  closed: 'Fechada',
  dropped: 'Caída',
};

/** Display order — also priority for "highest activated phase" (later index wins) */
export const QUOTE_PHASE_ORDER: QuotePhaseKey[] = ['sent', 'forClosing', 'closed', 'dropped'];

/** Tailwind classes for phase badges, reusing the order status HSL tokens */
export const QUOTE_PHASE_COLORS: Record<QuotePhaseKey, string> = {
  sent:       'bg-[hsl(var(--st-tobuy)/0.18)] text-[hsl(var(--st-tobuy))] border-[hsl(var(--st-tobuy)/0.5)]',
  forClosing: 'bg-[hsl(var(--st-toinvoice)/0.22)] text-[hsl(45_85%_28%)] border-[hsl(var(--st-toinvoice)/0.6)]',
  closed:     'bg-[hsl(var(--st-delivered)/0.18)] text-[hsl(var(--st-delivered))] border-[hsl(var(--st-delivered)/0.6)]',
  dropped:    'bg-[hsl(var(--st-cancelled)/0.18)] text-[hsl(var(--st-cancelled))] border-[hsl(var(--st-cancelled)/0.6)]',
};

export interface QuotePhases {
  sent: { active: boolean; date?: string };
  /** "Para Fechamento" now has an Expected Date (Data Prevista) */
  forClosing: { active: boolean; expectedDate?: string };
  /** "Fechada" has both a date and a closing value (R$) */
  closed: { active: boolean; date?: string; value?: number };
  dropped: { active: boolean; date?: string };
}

export interface QuoteItem {
  id: string;
  name: string;
  quantity: number;
  quoteValue: number;
  closingValue: number;
  supplier: string;
}

export interface DirectSupplyQuoteItem {
  id: string;
  name: string;
  quantity: number;
  quoteValue: number;
  closingValue: number;
  supplier: string;
  supplierPct: number;
  supplierFreight: number;
}

export interface Quote {
  id: string;
  index: string;
  /** Número da cotação dentro da própria loja (1º, 2º... daquela empresa) */
  storeIndex?: number;
  createdAt: number;
  b2bCompany?: string;
  customer: string;
  cnpj: string;
  requestNumber: string;
  requestDate: string;
  company: Company;
  directBilling: boolean;
  supplier: string;
  seller: Seller;
  /** Id do vendedor no banco. O nome nao identifica: o mesmo vendedor tem um
   *  cadastro por loja (a unicidade e por (id_loja, nome)), cada um com
   *  telefone e e-mail proprios. Procurar pelo nome imprimia o contato de outra
   *  empresa no timbrado. Ausente enquanto a cotacao nao foi salva. */
  sellerId?: string;
  value: number;
  items: QuoteItem[];
  directSupplyItems: DirectSupplyQuoteItem[];
  observations: string;
  phases: QuotePhases;
  taxLucky?: number;
  taxBTech?: number;
  // Envio de cotação
  deliveryDate?: string;
  deliveryForecast?: string;
  paymentMethod?: PaymentMethod | '';
  paymentDetails?: string;
  paymentDeadline?: string;
  warranty?: string;
}

export const emptyPhases = (): QuotePhases => ({
  sent: { active: false },
  forClosing: { active: false },
  closed: { active: false },
  dropped: { active: false },
});

/** Returns the highest activated phase key, or null if none */
export function getHighestPhase(q: Quote): QuotePhaseKey | null {
  for (let i = QUOTE_PHASE_ORDER.length - 1; i >= 0; i--) {
    const key = QUOTE_PHASE_ORDER[i];
    if (q.phases[key].active) return key;
  }
  return null;
}

/** Date associated with the highest active phase */
export function getPhaseDate(q: Quote): string | undefined {
  const key = getHighestPhase(q);
  if (!key) return undefined;
  if (key === 'sent') return q.phases.sent.date;
  if (key === 'forClosing') return q.phases.forClosing.expectedDate;
  if (key === 'closed') return q.phases.closed.date;
  if (key === 'dropped') return q.phases.dropped.date;
  return undefined;
}

/** Value to display in tables: closing value (if closed phase active & filled) else base value */
export function getDisplayValue(q: Quote): number {
  if (q.phases.closed.active && q.phases.closed.value && q.phases.closed.value > 0) {
    return q.phases.closed.value;
  }
  return q.value || 0;
}

const sampleQuotes: Quote[] = [
  {
    id: 'q1', index: 'COT-001', createdAt: Date.now() - 3 * 86400000,
    customer: 'Mega Corp', cnpj: '11.111.111/0001-11',
    requestNumber: 'REQ-7781', requestDate: '2026-04-01',
    company: 'Lucky Store', directBilling: false, supplier: '', seller: 'Alcides',
    value: 12500,
    items: [
      { id: 'qi1', name: 'Notebook Lenovo ThinkPad', quantity: 2, quoteValue: 5000, closingValue: 4800, supplier: 'Distribuidora Tech' },
      { id: 'qi2', name: 'Dock Station USB-C', quantity: 2, quoteValue: 1250, closingValue: 1200, supplier: 'Distribuidora Tech' },
    ],
    directSupplyItems: [],
    observations: 'Cliente solicitou entrega expressa.',
    phases: {
      sent: { active: true, date: '2026-04-02' },
      forClosing: { active: true, expectedDate: '2026-04-07' },
      closed: { active: true, date: '2026-04-08', value: 12000 },
      dropped: { active: false },
    },
  },
  {
    id: 'q2', index: 'COT-002', createdAt: Date.now() - 2 * 86400000,
    customer: 'StartUp Hub', cnpj: '22.222.222/0001-22',
    requestNumber: 'REQ-7782', requestDate: '2026-04-05',
    company: 'BTech', directBilling: true, supplier: 'Distribuidora ABC', seller: 'Lucas',
    value: 0, items: [], directSupplyItems: [], observations: '',
    phases: {
      sent: { active: true, date: '2026-04-06' },
      forClosing: { active: true, expectedDate: '2026-04-12' },
      closed: { active: false },
      dropped: { active: false },
    },
  },
  {
    id: 'q3', index: 'COT-003', createdAt: Date.now() - 1 * 86400000,
    customer: 'Old Client', cnpj: '33.333.333/0001-33',
    requestNumber: 'REQ-7790', requestDate: '2026-03-28',
    company: 'AJJ', directBilling: false, supplier: '', seller: 'Pedro',
    value: 0, items: [], directSupplyItems: [], observations: '',
    phases: {
      sent: { active: true, date: '2026-03-29' },
      forClosing: { active: false },
      closed: { active: false },
      dropped: { active: true, date: '2026-04-04' },
    },
  },
];

interface QuoteContextType {
  quotes: Quote[];
  addQuote: (q: Quote) => void;
  updateQuote: (q: Quote) => void;
  deleteQuote: (id: string) => void;
  nextIndex: () => string;
}

const QuoteContext = createContext<QuoteContextType | null>(null);

export function QuoteProvider({ children }: { children: React.ReactNode }) {
  const [quotes, setQuotes] = useState<Quote[]>(sampleQuotes);

  const nextIndex = useCallback(() => {
    const max = quotes.reduce((m, q) => {
      const n = parseInt((q.index.match(/\d+/) || ['0'])[0], 10);
      return n > m ? n : m;
    }, 0);
    return `COT-${String(max + 1).padStart(3, '0')}`;
  }, [quotes]);

  const addQuote = useCallback((q: Quote) => setQuotes(prev => [...prev, q]), []);
  const updateQuote = useCallback((q: Quote) => setQuotes(prev => prev.map(x => x.id === q.id ? q : x)), []);
  const deleteQuote = useCallback((id: string) => setQuotes(prev => prev.filter(x => x.id !== id)), []);

  return (
    <QuoteContext.Provider value={{ quotes, addQuote, updateQuote, deleteQuote, nextIndex }}>
      {children}
    </QuoteContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuotes() {
  const ctx = useContext(QuoteContext);
  if (!ctx) throw new Error('useQuotes must be used within QuoteProvider');
  return ctx;
}
