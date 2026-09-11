/**
 * Trocar a empresa ou o vendedor de uma cotação já salva tem que chegar ao banco.
 *
 * Mesmo defeito que a OS tinha, pela mesma causa: `UpdateCotacaoPayload`
 * excluía `id_loja` e `id_vendedor`, e a tela nunca os montava no PUT. O backend
 * sempre aceitou — `CotacaoUpdate` tem os dois e o update faz setattr em tudo
 * que chega.
 *
 * O sintoma também era o mesmo, e é o pior possível: a troca aparece na tela, a
 * API responde 200, a mensagem de sucesso sai, e o banco continua igual. Só ao
 * recarregar é que some.
 *
 * Este arquivo existe porque a OS foi encontrada primeiro e a cotação só foi
 * conferida depois — os dois vinham do mesmo `Omit` copiado. O teste olha o
 * PAYLOAD, não o código que o monta.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QuoteModal } from '@/components/QuoteModal';
import type { Quote } from '@/store/QuoteStore';
import { emptyPhases } from '@/store/QuoteStore';

const { mockUpdateQuote } = vi.hoisted(() => ({ mockUpdateQuote: vi.fn() }));
vi.mock('@/api/hooks/useQuotes', () => ({
  useCreateQuote: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuote: () => ({ mutate: mockUpdateQuote, isPending: false }),
  useUpdateQuotePhase: () => ({ mutate: vi.fn(), isPending: false }),
  useQuoteHistory: () => ({ data: undefined, isLoading: false }),
}));
const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mockToastError } }));
vi.mock('@/api/client', () => ({
  apiClient: { delete: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({ data: {} }) },
  getApiError: (e: unknown) => String(e),
}));
// A AJJ fica fora de propósito: é o caso em que o id não resolve.
vi.mock('@/api/storeConfig', () => ({
  LOJA_IDS: { 'Lucky Store': 'uuid-lucky', 'BTech': 'uuid-btech' },
  VENDEDOR_IDS: {},
  FORMA_PAGAMENTO_MAP: { Pix: 'pix', Boleto: 'boleto' },
}));
vi.mock('@/hooks/useVendedores', () => ({
  useVendedores: () => ({ data: { items: [
    { id: 'uuid-alcides', nome: 'Alcides', email: null, phone: null, id_loja: 'l1' },
    { id: 'uuid-lucas', nome: 'Lucas', email: null, phone: null, id_loja: 'l1' },
  ] }, isLoading: false }),
}));

const cotacao: Quote = {
  id: 'quote-uuid', index: '82', createdAt: 1000000,
  customer: 'Tech Corp', cnpj: '12.345.678/0001-99',
  requestNumber: 'REQ-1', requestDate: '2026-09-01', b2bCompany: '',
  company: 'Lucky Store', seller: 'Alcides', sellerId: 'uuid-alcides',
  directBilling: false, supplier: '', value: 5000,
  items: [], directSupplyItems: [], observations: '',
  phases: emptyPhases(), taxLucky: 5, taxBTech: 3,
} as unknown as Quote;

async function escolher(rotulo: RegExp, opcao: RegExp) {
  const gatilhos = screen.getAllByRole('combobox');
  const alvo = gatilhos.find(g => rotulo.test(g.closest('div')?.textContent ?? ''));
  fireEvent.click(alvo ?? gatilhos[0]);
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

function abrir() {
  render(<QuoteModal open quote={cotacao} onClose={vi.fn()} onSave={vi.fn()} nextIndex={() => '82'} />);
}

async function salvarCom(mudanca: () => Promise<void>) {
  abrir();
  await mudanca();
  fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
  await waitFor(() => expect(mockUpdateQuote).toHaveBeenCalled());
  return mockUpdateQuote.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => vi.clearAllMocks());

describe('editar a cotação', () => {
  it('trocar o vendedor manda o id_vendedor novo', async () => {
    expect((await salvarCom(() => escolher(/Vendedor/i, /^Lucas$/))).id_vendedor).toBe('uuid-lucas');
  });

  it('trocar a empresa manda o id_loja novo', async () => {
    expect((await salvarCom(() => escolher(/Empresa/i, /BTech/i))).id_loja).toBe('uuid-btech');
  });

  it('salvar sem trocar nada continua mandando quem já era', async () => {
    expect((await salvarCom(async () => { /* nada */ })).id_vendedor).toBe('uuid-alcides');
  });
});

describe('quando o id não resolve', () => {
  it('avisa na tela e não manda o PUT pela metade', async () => {
    // Gravar o resto e deixar para trás justamente o campo que a pessoa queria
    // mudar é o defeito de volta, só que mais difícil de perceber.
    abrir();
    await escolher(/Empresa/i, /AJJ/i);
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockUpdateQuote).not.toHaveBeenCalled();
  });
});

import { apiClient } from '@/api/client';

it('salva itens e fases juntos, preservando o formulario e ids se o PUT falhar', async () => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const itemId = '12345678-1234-4234-9234-123456789012';
  const q = { ...cotacao, items: [{ id: itemId, name: 'Notebook', quantity: 1, quoteValue: 1000, closingValue: 1000 }] } as Quote;
  mockUpdateQuote.mockImplementationOnce((_payload: unknown, options: any) => options.onError(new Error('Falha simulada')));
  render(<QuoteModal open quote={q} onClose={onClose} onSave={onSave} nextIndex={() => '82'} />);
  fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
  await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  expect(onClose).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(apiClient.delete).not.toHaveBeenCalled();
  expect(apiClient.post).not.toHaveBeenCalled();
  expect(mockUpdateQuote.mock.calls[0][0]).toMatchObject({
    itens: [expect.objectContaining({ id: itemId, descricao: 'Notebook' })],
    fase: expect.any(Object),
  });
  mockUpdateQuote.mockImplementationOnce((_payload: unknown, options: any) => options.onSuccess());
  fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0].items[0].id).toBe(itemId);
});
