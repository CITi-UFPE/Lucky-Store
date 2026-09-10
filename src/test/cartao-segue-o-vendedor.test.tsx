/**
 * O contato do timbrado segue o VENDEDOR escolhido — nada ali é fixo.
 *
 * Este teste renderiza o QuoteModal de verdade, duas vezes, mudando só o
 * vendedor da cotação, e confere que telefone, e-mail e assinatura acompanham.
 * Os outros testes do cartão leem o código-fonte; este exercita o componente,
 * que é o único jeito de garantir que o valor não está cravado em algum lugar
 * no meio do caminho.
 *
 * O CNPJ é a única coisa fixa, e de propósito: ele é da LOJA, não do vendedor.
 *
 * Contexto: o cartão saía com o telefone errado, e a suspeita inicial foi de
 * valor fixo no código. Não era — o valor vem do cadastro do vendedor e estava
 * errado no banco. Este teste existe para que essa dúvida não precise ser
 * investigada de novo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ALCIDES = {
  id: 'v-alcides', nome: 'Alcides', id_loja: 'loja-btech',
  phone: '(81) 99989-6762', email: 'alcides@luckystore.com.br',
};
const LUCAS = {
  id: 'v-lucas', nome: 'Lucas', id_loja: 'loja-btech',
  phone: '(81) 98123-4455', email: 'lucas@luckystore.com.br',
};
const SEM_CONTATO = {
  id: 'v-novo', nome: 'Pedro', id_loja: 'loja-btech', phone: null, email: null,
};

vi.mock('@/hooks/useVendedores', async (orig) => ({
  ...(await orig() as object),
  useVendedores: () => ({ data: { items: [ALCIDES, LUCAS, SEM_CONTATO] } }),
}));

const { QuoteModal } = await import('@/components/QuoteModal');
type Quote = import('@/store/QuoteStore').Quote;

const BASE = {
  id: 'q1', index: '81', storeIndex: '14', createdAt: Date.now(),
  b2bCompany: 'FACHUCA', customer: 'KEVELLY', cnpj: '11.690.351/0002-79',
  requestNumber: 'zap 09-09-26', requestDate: '2026-09-09',
  company: 'BTech', directBilling: false, supplier: '', value: 5452,
  deliveryForecast: '2026-09-18', paymentMethod: 'Boleto',
  paymentDetails: '15', warranty: '1 ano', observations: '',
  items: [{ id: 'a', name: 'Nobreak', quantity: 1, quoteValue: 586, closingValue: 586, supplier: '' }],
  directSupplyItems: [],
  phases: { sent: { active: true }, forClosing: { active: false }, closed: { active: false }, dropped: { active: false } },
};

/** Renderiza o timbrado com aquele vendedor e devolve o que saiu no papel. */
function timbrado(vendedor: { id: string; nome: string }) {
  const quote = { ...BASE, seller: vendedor.nome, sellerId: vendedor.id } as unknown as Quote;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuoteModal open quote={quote} onClose={() => {}} onSave={() => {}} nextIndex={() => '81'} />
    </QueryClientProvider>,
  );
  return {
    cartao: document.querySelector('.qp-fcard')?.textContent ?? '',
    linhas: Array.from(document.querySelectorAll('.qp-fcard-linha')).map(e => e.textContent),
    assinatura: document.querySelector('.qp-sign-name')?.textContent ?? '',
  };
}

beforeEach(cleanup);

describe('o contato do timbrado segue o vendedor da cotação', () => {
  it('cotação do Alcides sai com o contato do Alcides', () => {
    const t = timbrado(ALCIDES);
    expect(t.linhas).toEqual(['(81) 99989-6762', 'e-mail: alcides@luckystore.com.br']);
    expect(t.assinatura).toBe('Alcides');
  });

  it('trocando o vendedor, o contato inteiro troca junto', () => {
    const t = timbrado(LUCAS);
    expect(t.linhas).toEqual(['(81) 98123-4455', 'e-mail: lucas@luckystore.com.br']);
    expect(t.assinatura).toBe('Lucas');
    // O do outro vendedor nao pode sobrar em lugar nenhum do papel.
    expect(t.cartao).not.toContain('99989-6762');
    expect(t.cartao).not.toContain('alcides@');
  });

  it('vendedor sem telefone e e-mail cadastrados não deixa linha vazia', () => {
    const t = timbrado(SEM_CONTATO);
    expect(t.linhas).toEqual([]);
    // O cartao continua identificando a empresa, e a assinatura o vendedor.
    expect(t.cartao).toContain('CNPJ 54.677.704/0001-22');
    expect(t.assinatura).toBe('Pedro');
  });

  it('o CNPJ é o único fixo — e é da loja, não do vendedor', () => {
    const a = timbrado(ALCIDES);
    cleanup();
    const l = timbrado(LUCAS);
    expect(a.cartao).toContain('CNPJ 54.677.704/0001-22');
    expect(l.cartao).toContain('CNPJ 54.677.704/0001-22');
  });
});
