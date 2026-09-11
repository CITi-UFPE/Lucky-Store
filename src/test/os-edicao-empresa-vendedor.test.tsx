/**
 * Trocar a empresa ou o vendedor de uma OS já criada tem que chegar ao banco.
 *
 * Não chegava. O payload do PUT não levava `id_loja` nem `id_vendedor` — o tipo
 * `UpdatePedidoPayload` excluía os dois de propósito, e a tela nunca os
 * montava. O backend sempre aceitou (PedidoUpdate tem os dois campos e o update
 * faz setattr em tudo que recebe); simplesmente não recebia.
 *
 * O efeito era o pior possível: a troca aparecia na tela, a API respondia 200, a
 * mensagem "Pedido atualizado com sucesso" saía, e o banco continuava igual. Só
 * recarregando a página é que a alteração sumia — quem não recarregasse ia
 * embora achando que tinha salvado.
 *
 * Este teste olha o PAYLOAD que sai, e não o código que o monta. É essa a lição
 * do defeito: dava para ler aquele trecho de OrderModal.tsx e não notar a
 * ausência, porque o que estava errado era o que NÃO estava escrito lá.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderModal } from '@/components/OrderModal';
import type { Order } from '@/store/OrderStore';

const { mockUpdateOrder } = vi.hoisted(() => ({ mockUpdateOrder: vi.fn() }));

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
const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mockToastError } }));
vi.mock('@/api/client', () => ({ apiClient: {}, getApiError: (e: unknown) => String(e) }));

// Os ids das lojas vêm de variáveis de ambiente, que no teste são vazias. Sem
// este mock, TODA troca de empresa cairia no caminho de "não consegui
// identificar" e o teste não conseguiria distinguir o defeito da proteção.
// A AJJ fica de fora de propósito: é o caso em que o id não resolve.
vi.mock('@/api/storeConfig', () => ({
  LOJA_IDS: { 'Lucky Store': 'uuid-lucky', 'BTech': 'uuid-btech' },
  VENDEDOR_IDS: {},
  FORMA_PAGAMENTO_MAP: { Pix: 'pix', Boleto: 'boleto', TED: 'ted' },
}));
vi.mock('@/hooks/useVendedores', () => ({
  useVendedores: () => ({ data: { items: [
    { id: 'uuid-alcides', nome: 'Alcides', email: null, phone: null, id_loja: 'l1' },
    { id: 'uuid-lucas', nome: 'Lucas', email: null, phone: null, id_loja: 'l1' },
  ] }, isLoading: false }),
}));

const wrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

const pedido: Order = {
  id: 'backend-order-uuid', os: '1001', createdAt: 1000000,
  orderDate: '2026-01-01', customer: 'Tech Corp', cnpj: '12.345.678/0001-99',
  company: 'Lucky Store', seller: 'Alcides', ocAfPed: 'OC-9999',
  directBilling: false, supplier: '', invoice: 'NF-001', invoiceSupplier: '',
  paymentMethods: ['Pix'], installments: 1, deliveryDate: '2026-02-01',
  status: 'Bought', isRMA: false, salesValue: 5000,
  items: [], directSupplyItems: [], freight: [], observations: '',
} as unknown as Order;

/** Abre um Select do Radix pelo rótulo e escolhe a opção. */
async function escolher(rotulo: RegExp, opcao: RegExp) {
  const gatilhos = screen.getAllByRole('combobox');
  const alvo = gatilhos.find(g => rotulo.test(g.closest('div')?.textContent ?? ''));
  fireEvent.click(alvo ?? gatilhos[0]);
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

/** Abre a OS, aplica a mudança, salva, e devolve o payload que foi enviado. */
async function salvarCom(mudanca: () => Promise<void>) {
  render(<OrderModal open order={pedido} onClose={vi.fn()} onSave={vi.fn()} nextOS={() => '1001'} />,
    { wrapper: wrapper() });
  await mudanca();
  fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
  await waitFor(() => expect(mockUpdateOrder).toHaveBeenCalled());
  return mockUpdateOrder.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => vi.clearAllMocks());

describe('editar a OS', () => {
  it('trocar o vendedor manda o id_vendedor novo', async () => {
    const payload = await salvarCom(() => escolher(/Vendedor/i, /^Lucas$/));
    expect(payload.id_vendedor).toBe('uuid-lucas');
  });

  it('trocar a empresa manda o id_loja novo', async () => {
    const payload = await salvarCom(() => escolher(/Empresa/i, /BTech/i));
    expect(payload.id_loja).toBe('uuid-btech');
  });

  it('trocar a empresa não perde o vendedor pelo caminho', async () => {
    const payload = await salvarCom(() => escolher(/Empresa/i, /BTech/i));
    expect(payload.id_vendedor).toBe('uuid-alcides');
  });

  it('salvar sem trocar nada continua mandando quem já era', async () => {
    // Reenviar o mesmo valor é inofensivo — o backend faz setattr do mesmo id —
    // e evita uma OS ficar sem vendedor caso o campo suma por outro caminho.
    const payload = await salvarCom(async () => { /* nada */ });
    expect(payload.id_vendedor).toBe('uuid-alcides');
  });
});

describe('quando o id não resolve', () => {
  it('não salva calado: avisa na tela', async () => {
    // Foi o silêncio que escondeu o defeito. Se a troca não pode ser gravada, o
    // vendedor precisa saber ANTES de fechar a janela achando que deu certo.
    render(<OrderModal open order={pedido} onClose={vi.fn()} onSave={vi.fn()} nextOS={() => '1001'} />,
      { wrapper: wrapper() });
    await escolher(/Empresa/i, /AJJ/i);
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(String(mockToastError.mock.calls[0][0])).toContain('AJJ');
  });

  it('e não manda o PUT pela metade', async () => {
    // Salvar sem a empresa nova seria gravar o resto e deixar justamente o
    // campo que o vendedor queria mudar para trás — o defeito de volta.
    render(<OrderModal open order={pedido} onClose={vi.fn()} onSave={vi.fn()} nextOS={() => '1001'} />,
      { wrapper: wrapper() });
    await escolher(/Empresa/i, /AJJ/i);
    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });
});
