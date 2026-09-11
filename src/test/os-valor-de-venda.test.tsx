/**
 * A coluna "Valor de venda" do documento da OS mostra quanto o cliente paga.
 *
 * Ela saía zerada. E não era um caso raro: era o caso comum.
 *
 * O item do pedido não tinha campo para o preço de venda. A coluna lia
 * `projectedValue`, que é o CUSTO projetado — e a coluna "Valor de compra" lia
 * `purchaseValue`, onde a conversão da cotação vinha gravando o preço do
 * CLIENTE. As duas saíam trocadas em relação ao rótulo, num papel que vai ao
 * cliente.
 *
 * Como se cota o preço para o cliente e o custo só aparece na hora de comprar,
 * a cotação quase sempre tem "Custo do produto" em zero. Com o custo em zero, a
 * coluna "Valor de venda" imprimia R$ 0,00 em todas as linhas e no total.
 *
 * Agora o item tem `saleValue`, que é só isso, unitário, e o documento
 * multiplica pela quantidade.
 *
 * Este arquivo lê o que SAIU IMPRESSO e o que SAIU NO PAYLOAD. Procurar o
 * trecho no código não pegaria nada disto: o defeito era ler o campo errado — o
 * código estava lá, bem escrito, lendo a coisa errada.
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { OrderModal } from '@/components/OrderModal';
import type { Order, OrderItem } from '@/store/OrderStore';

// O salvamento só sincroniza os itens depois que o PUT do pedido volta: é o
// `onSuccess` que chama `syncItems`. Um mock mudo faria os testes de payload
// passarem por engano — nenhuma requisição sairia, e não sairia mesmo com o
// defeito de volta.
const { mockUpdateOrder } = vi.hoisted(() => ({
  mockUpdateOrder: vi.fn((_payload: unknown, opts?: { onSuccess?: (d: unknown) => void }) =>
    opts?.onSuccess?.({ id: 'backend-order-uuid', id_vendedor: 'uuid-alcides' })),
}));
const { mockPut, mockPost } = vi.hoisted(() => ({ mockPut: vi.fn(), mockPost: vi.fn() }));

vi.mock('@/api/hooks/useOrders', () => ({
  useCreateOrder: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateOrder: () => ({ mutate: mockUpdateOrder, isPending: false }),
  useUpdateOrderStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useOrderHistory: () => ({ data: undefined, isLoading: false }),
  orderKeys: {
    all: ['orders'], lists: () => ['orders', 'list'],
    list: (f: unknown) => ['orders', 'list', f],
    details: () => ['orders', 'detail'], detail: (id: string) => ['orders', 'detail', id],
    history: (id: string) => ['orders', 'history', id],
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/client', () => ({
  apiClient: {
    put: (...a: unknown[]) => { mockPut(...a); return Promise.resolve({ data: {} }); },
    post: (...a: unknown[]) => { mockPost(...a); return Promise.resolve({ data: { id: 'novo' } }); },
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  getApiError: (e: unknown) => String(e),
}));
vi.mock('@/api/storeConfig', () => ({
  LOJA_IDS: { 'Lucky Store': 'uuid-lucky', 'BTech': 'uuid-btech' },
  VENDEDOR_IDS: {},
  FORMA_PAGAMENTO_MAP: { Pix: 'pix' },
}));
vi.mock('@/hooks/useVendedores', () => ({
  useVendedores: () => ({ data: { items: [
    { id: 'uuid-alcides', nome: 'Alcides', email: 'alcides@luckystore.com.br', phone: '(81) 99989-6762', id_loja: 'l1' },
  ] }, isLoading: false }),
}));
vi.mock('@/hooks/useOrderHistory', () => ({ useOrderHistory: () => ({ data: undefined, isLoading: false }) }));

const wrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

function item(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'i1', name: 'Notebook', quantity: 2, status: 'To Buy',
    // O caso do usuário: a cotação trazia o preço do cliente e nenhum custo.
    projectedValue: 0, purchaseValue: 0, saleValue: 6480,
    ...over,
  } as OrderItem;
}

function pedido(itens: OrderItem[]): Order {
  return {
    id: 'backend-order-uuid', os: '1001', createdAt: 1000000,
    orderDate: '2026-01-01', customer: 'Tech Corp', cnpj: '12.345.678/0001-99',
    company: 'Lucky Store', seller: 'Alcides', ocAfPed: 'OC-9999',
    directBilling: false, supplier: '', invoice: 'NF-001', invoiceSupplier: '',
    paymentMethods: ['Pix'], installments: 1, deliveryDate: '2026-02-01',
    status: 'To Buy', isRMA: false, salesValue: 12960,
    items: itens, directSupplyItems: [], freight: [], observations: '',
  } as unknown as Order;
}

function abrir(itens: OrderItem[]) {
  render(<OrderModal open order={pedido(itens)} onClose={vi.fn()} onSave={vi.fn()} nextOS={() => '1001'} />,
    { wrapper: wrapper() });
}

/** A tabela de itens como ela sai no papel. */
function tabelaImpressa(): HTMLTableElement {
  const t = document.getElementById('opm-print-root')?.querySelector('table.op-tbl');
  expect(t, 'a OS saiu sem a tabela de itens').not.toBeNull();
  return t as HTMLTableElement;
}

/** O R$ do Intl vem com espaço fino; comparar com espaço comum não casa. */
const texto = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ').trim();

/** Célula da linha `n` (1-based) da coluna com este cabeçalho. */
function celula(cabecalho: string, linha = 1): string {
  const t = tabelaImpressa();
  const ths = [...t.querySelectorAll('thead th')].map(th => th.textContent ?? '');
  const col = ths.findIndex(h => h.trim() === cabecalho);
  expect(col, `não achei a coluna "${cabecalho}" no documento`).toBeGreaterThan(-1);
  const tr = t.querySelectorAll('tbody tr')[linha - 1];
  return texto(tr.querySelectorAll('td')[col].textContent);
}

/** O total impresso no rodapé, na coluna com este cabeçalho. */
function total(cabecalho: string): string {
  const t = tabelaImpressa();
  const ths = [...t.querySelectorAll('thead th')].map(th => (th.textContent ?? '').trim());
  const col = ths.indexOf(cabecalho);
  const tds = [...t.querySelectorAll('tfoot td')];
  // A primeira célula do rodapé é o rótulo "Totais" com colSpan; as de dinheiro
  // são as últimas, na mesma ordem das colunas.
  const dinheiro = tds.slice(1);
  const offset = ths.length - dinheiro.length;
  return texto(dinheiro[col - offset]?.textContent);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('o documento da OS', () => {
  it('distingue preço zero de preço não registrado', () => {
    abrir([item({ saleValue: 0 })]);
    expect(celula('Valor de venda')).toBe('R$ 0,00');
  });
  it('imprime o valor de venda do item, e não o custo', () => {
    abrir([item()]);
    // 6480 × 2. Antes saía R$ 0,00 porque a coluna lia o custo projetado.
    expect(celula('Valor de venda')).toBe('R$ 12.960,00');
  });

  it('não zera quando a cotação não trouxe custo', () => {
    abrir([item({ projectedValue: 0 })]);
    expect(celula('Valor de venda')).not.toBe('R$ 0,00');
  });

  it('soma o total da coluna a partir das linhas impressas', () => {
    abrir([item(), item({ id: 'i2', name: 'Servidor', quantity: 1, saleValue: 9000 })]);
    expect(total('Valor de venda')).toBe('R$ 21.960,00');
  });

  it('a coluna de compra continua mostrando o que foi pago ao fornecedor', () => {
    // A outra metade do defeito: aqui vinha o preço do cliente.
    abrir([item({ purchaseValue: 4100 })]);
    expect(celula('Valor de compra')).toBe('R$ 4.100,00');
    expect(celula('Valor de compra')).not.toBe('R$ 6.480,00');
  });

  it('as duas colunas não mostram o mesmo número', () => {
    abrir([item({ purchaseValue: 4100 })]);
    expect(celula('Valor de venda')).not.toBe(celula('Valor de compra'));
  });

  it('item sem preço de venda registrado sai com travessão, não com zero', () => {
    // NULL é a verdade: ninguém registrou por quanto aquilo foi vendido.
    // "R$ 0,00" seria uma afirmação falsa num papel que vai ao cliente.
    abrir([item({ saleValue: undefined })]);
    expect(celula('Valor de venda')).toBe('—');
  });

  it('o valor impresso acompanha a quantidade', () => {
    abrir([item({ quantity: 5, saleValue: 100 })]);
    expect(celula('Valor de venda')).toBe('R$ 500,00');
  });
});

describe('o preço de venda chega ao banco', () => {
  it('preserva a edição do contato ao salvar a OS importada', async () => {
    abrir([item({ projectedValue: 4100 })]);
    fireEvent.change(screen.getByPlaceholderText('Pessoa de contato'), { target: { value: 'Ricardo' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
    await waitFor(() => expect(mockUpdateOrder).toHaveBeenCalled());
    expect(mockUpdateOrder.mock.calls[0][0]).toMatchObject({ contato_cliente: 'Ricardo' });
  });

  it('editar o valor de venda de um item dispara o PUT desse item', async () => {
    // Sem comparar `saleValue` no diff de itens, esta edição não gerava
    // requisição nenhuma: a tela mostrava o número novo, o salvamento dizia
    // sucesso, e o banco continuava com o antigo.
    // Custo preenchido de propósito: a tela exige Custo Projetado > 0 para
    // salvar, e o que está em teste aqui é o preço de venda, não essa trava.
    abrir([item({ projectedValue: 4100 })]);
    const campo = screen.getByPlaceholderText('Valor de Venda R$');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '7000' } });
    fireEvent.blur(campo);
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));

    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const chamada = mockPut.mock.calls.find(c => String(c[0]).includes('/items/'));
    expect(chamada, 'o item não foi atualizado').toBeDefined();
    expect((chamada![1] as Record<string, unknown>).valor_venda).toBe(7000);
  });

  it('item novo nasce com o valor de venda no payload', async () => {
    abrir([]);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Item/i }));
    const preencher = (placeholder: string, valor: string) => {
      const campo = screen.getByPlaceholderText(placeholder);
      fireEvent.focus(campo);
      fireEvent.change(campo, { target: { value: valor } });
      fireEvent.blur(campo);
    };
    preencher('Custo Projetado R$', '4100');
    preencher('Valor de Venda R$', '6480');
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const chamada = mockPost.mock.calls.find(c => String(c[0]).includes('/items'));
    expect(chamada, 'o item novo não foi criado').toBeDefined();
    expect((chamada![1] as Record<string, unknown>).valor_venda).toBe(6480);
  });
});
