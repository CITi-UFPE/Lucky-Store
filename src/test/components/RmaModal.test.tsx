import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { RmaModal } from '@/components/RmaModal';
import type { Order } from '@/store/OrderStore';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const { mockCreateRma } = vi.hoisted(() => ({
  mockCreateRma: vi.fn(),
}));

vi.mock('@/api/hooks/useRma', () => ({
  useCreateRma: () => ({ mutate: mockCreateRma, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/api/client', () => ({
  apiClient: {},
  getApiError: (e: unknown) => String(e),
}));

vi.mock('@/hooks/useVendedores', () => ({
  useVendedores: () => ({ data: { items: [] }, isLoading: false }),
}));

const deliveredApiItem = {
  id: 'parent-order-backend-id',
  numero_os: '1003',
  data_pedido: '2026-01-01',
  data_entrega: '2026-02-01',
  status: 'Delivered',
  is_rma: false,
  is_cancelled: false,
  is_direct_billing: false,
  valor_venda: 1500,
  parcelas: 1,
  nome_cliente: 'InfoShop Corp',
  cnpj_cliente: '45.678.912/0001-55',
  nome_loja: 'Lucky Store',
  nome_vendedor: 'Alcides',
  numero_oc: 'PED-7710',
  numero_nf: 'NF-003',
  nota_fiscal_fornecedor: null,
  observacao: null,
  fornecedor_principal: null,
  formas_pagamento: [],
  fretes: [],
  produtos: [
    { id: 'item-1', descricao: 'Impressora HP LaserJet', quantidade: 1, status: 'In Stock', valor_projetado: 1500, valor_compra: 800 },
  ],
  custo: null,
  data_pagamento: null,
  multa: null,
  juros: null,
  forma_pagamento_efetiva: null,
  num_parcelas_efetivas: null,
  plano_parcelas: null,
};

const mockUseOrdersQuery = vi.fn(() => ({
  data: { items: [deliveredApiItem], total: 1, page: 1, limit: 20, pages: 1 },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-orders-query', () => ({
  useOrdersQuery: (...args: any[]) => mockUseOrdersQuery(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const deliveredOrder: Order = {
  id: 'parent-order-backend-id',
  os: '1003',
  createdAt: 1000000,
  orderDate: '2026-01-01',
  customer: 'InfoShop Corp',
  cnpj: '45.678.912/0001-55',
  company: 'Lucky Store',
  seller: 'Alcides',
  ocAfPed: 'PED-7710',
  directBilling: false,
  supplier: '',
  invoice: 'NF-003',
  invoiceSupplier: '',
  paymentMethods: ['Pix'],
  installments: 1,
  deliveryDate: '2026-02-01',
  status: 'Delivered',
  isRMA: false,
  cancelled: false,
  observations: '',
  initialProductCost: 800,
  finalProductCost: 800,
  boletoCost: 0,
  giftCost: 0,
  creditCostPercent: 0,
  creditCostValue: 0,
  debitCostPercent: 0,
  debitCostValue: 0,
  purchaseTaxPercent: 0,
  purchaseTaxValue: 0,
  salesTaxPercent: 0,
  salesTaxValue: 0,
  salesValue: 1500,
  items: [
    {
      id: 'item-1',
      name: 'Impressora HP LaserJet',
      quantity: 1,
      status: 'In Stock',
      projectedValue: 1500,
      purchaseValue: 800,
    },
  ],
  directSupplyItems: [],
  freight: [],
};

const nextRmaNumber = (parentOs: string) => `${parentOs}-1`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RmaModal — step 1: order picker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the order list in step 1', () => {
    render(
      <RmaModal
        open
        orders={[deliveredOrder]}
        onClose={vi.fn()}
        onSave={vi.fn()}
        nextRmaNumber={nextRmaNumber}
      />
    );
    expect(screen.getByText(/Selecionar Pedido Entregue/i)).toBeInTheDocument();
    expect(screen.getByText('InfoShop Corp')).toBeInTheDocument();
    expect(screen.getByText('1003')).toBeInTheDocument();
  });

  it('shows empty state when no delivered orders exist', () => {
    const original = mockUseOrdersQuery.getMockImplementation();
    mockUseOrdersQuery.mockImplementation(() => ({
      data: { items: [], total: 0, page: 1, limit: 20, pages: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    render(
      <RmaModal
        open
        orders={[]}
        onClose={vi.fn()}
        onSave={vi.fn()}
        nextRmaNumber={nextRmaNumber}
      />
    );
    expect(screen.getByText(/Nenhum pedido entregue encontrado/i)).toBeInTheDocument();
    if (original) mockUseOrdersQuery.mockImplementation(original);
    else mockUseOrdersQuery.mockReset();
  });

  it('advances to step 2 when an order row is clicked', async () => {
    render(
      <RmaModal
        open
        orders={[deliveredOrder]}
        onClose={vi.fn()}
        onSave={vi.fn()}
        nextRmaNumber={nextRmaNumber}
      />
    );

    fireEvent.click(screen.getByText('InfoShop Corp'));

    await waitFor(() => {
      expect(screen.getByText(/Selecionar Itens/i)).toBeInTheDocument();
    });
  });
});

describe('RmaModal — step 2: item picker', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderAndAdvanceToStep2 = async () => {
    render(
      <RmaModal
        open
        orders={[deliveredOrder]}
        onClose={vi.fn()}
        onSave={vi.fn()}
        nextRmaNumber={nextRmaNumber}
      />
    );
    fireEvent.click(screen.getByText('InfoShop Corp'));
    await waitFor(() => expect(screen.getByText(/Selecionar Itens/i)).toBeInTheDocument());
  };

  it('shows parent order items in step 2', async () => {
    await renderAndAdvanceToStep2();
    expect(screen.getByText('Impressora HP LaserJet')).toBeInTheDocument();
  });

  it('"Próximo" button is disabled when no items selected', async () => {
    await renderAndAdvanceToStep2();
    expect(screen.getByRole('button', { name: /Próximo/i })).toBeDisabled();
  });

  it('enables "Próximo" after selecting an item', async () => {
    await renderAndAdvanceToStep2();

    // Click the item row to toggle selection (more reliable than Radix Checkbox in jsdom)
    fireEvent.click(screen.getByText('Impressora HP LaserJet'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Próximo/i })).not.toBeDisabled();
    });
  });
});

describe('RmaModal — step 3: form + API call', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderAndAdvanceToStep3 = async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <RmaModal
        open
        orders={[deliveredOrder]}
        onClose={onClose}
        onSave={onSave}
        nextRmaNumber={nextRmaNumber}
      />
    );

    // Step 1 → click order
    fireEvent.click(screen.getByText('InfoShop Corp'));
    await waitFor(() => expect(screen.getByText(/Selecionar Itens/i)).toBeInTheDocument());

    // Step 2 → click item row to select it, then click Próximo
    fireEvent.click(screen.getByText('Impressora HP LaserJet'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Próximo/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Próximo/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Criar RMA/i })).toBeInTheDocument());

    return { onSave, onClose };
  };

  it('shows the RMA form in step 3', async () => {
    await renderAndAdvanceToStep3();
    expect(screen.getByRole('heading', { name: /Itens do RMA/i })).toBeInTheDocument();
    // Item name is in an Input value in step 3 (not a text node)
    expect(screen.getByDisplayValue('Impressora HP LaserJet')).toBeInTheDocument();
  });

  it('calls createRma with correct payload when "Criar RMA" is clicked', async () => {
    const { onSave } = await renderAndAdvanceToStep3();
    mockCreateRma.mockImplementation((_p: any, cb: any) => cb?.onSuccess?.());

    fireEvent.click(screen.getByRole('button', { name: /Criar RMA/i }));

    await waitFor(() => expect(mockCreateRma).toHaveBeenCalled());

    const [payload] = mockCreateRma.mock.calls[0];
    expect(payload.id_pedido_origem).toBe('parent-order-backend-id');
    expect(payload.itens).toHaveLength(1);
    expect(payload.itens[0]).toMatchObject({
      descricao: 'Impressora HP LaserJet',
      quantidade: 1,
    });
    // id_produto_origem must NOT be in items (removed in Phase 2.3 fix)
    expect(payload.itens[0]).not.toHaveProperty('id_produto_origem');
  });

  it('calls onSave and onClose after successful RMA creation', async () => {
    const { onSave, onClose } = await renderAndAdvanceToStep3();
    mockCreateRma.mockImplementation((_p: any, cb: any) => cb?.onSuccess?.());

    fireEvent.click(screen.getByRole('button', { name: /Criar RMA/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error toast when RMA creation fails', async () => {
    const { toast } = await import('sonner');
    await renderAndAdvanceToStep3();
    mockCreateRma.mockImplementation((_p: any, cb: any) => cb?.onError?.(new Error('Server Error')));

    fireEvent.click(screen.getByRole('button', { name: /Criar RMA/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
