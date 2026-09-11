import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useCreateOrder, useUpdateOrder, useDeleteOrder } from '@/api/hooks/useOrders';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getApiError: vi.fn((e: unknown) => String(e)),
}));

const mockPost = (apiClient as any).post as ReturnType<typeof vi.fn>;
const mockPut = (apiClient as any).put as ReturnType<typeof vi.fn>;
const mockDelete = (apiClient as any).delete as ReturnType<typeof vi.fn>;

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

const mockOrder = {
  id: 'backend-uuid-abc',
  status: 'To Buy',
  numero_os: '1001',
};

describe('useCreateOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls POST /pedidos with the payload', async () => {
    mockPost.mockResolvedValueOnce({ data: mockOrder });

    const { result } = renderHook(() => useCreateOrder(), { wrapper: makeWrapper() });

    const payload = {
      id_loja: 'loja-1',
      id_vendedor: 'vendedor-1',
      nome_cliente: 'Test Client',
      data_pedido: '2026-05-11',
      data_entrega: '2026-05-20',
      status: 'To Buy' as const,
    };

    await act(async () => {
      result.current.mutate({ payload });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, corpo] = mockPost.mock.calls[0];
    expect(url).toBe('/pedidos');
    expect(corpo).toEqual(payload);
  });

  it('manda a chave da tentativa no header Idempotency-Key', async () => {
    mockPost.mockResolvedValueOnce({ data: mockOrder });
    const { result } = renderHook(() => useCreateOrder(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({
        payload: {
          id_loja: 'loja-1', id_vendedor: 'vendedor-1', nome_cliente: 'X',
          data_pedido: '2026-05-11', data_entrega: '2026-05-20', status: 'To Buy' as const,
        },
        idempotencyKey: 'chave-da-tentativa-1',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, , config] = mockPost.mock.calls[0];
    expect(config.headers['Idempotency-Key']).toBe('chave-da-tentativa-1');
  });

  it('sem chave, nao inventa header — o backend segue como antes', async () => {
    mockPost.mockResolvedValueOnce({ data: mockOrder });
    const { result } = renderHook(() => useCreateOrder(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({
        payload: {
          id_loja: 'loja-1', id_vendedor: 'vendedor-1', nome_cliente: 'X',
          data_pedido: '2026-05-11', data_entrega: '2026-05-20', status: 'To Buy' as const,
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, , config] = mockPost.mock.calls[0];
    expect(config?.headers).toBeUndefined();
  });

  it('returns the created order data on success', async () => {
    mockPost.mockResolvedValueOnce({ data: mockOrder });
    const { result } = renderHook(() => useCreateOrder(), { wrapper: makeWrapper() });

    let data: typeof mockOrder | undefined;
    await act(async () => {
      result.current.mutate(
        { payload: { id_loja: '', id_vendedor: '', nome_cliente: 'X', data_pedido: '', data_entrega: '', status: 'To Buy' } },
        { onSuccess: (d) => { data = d as any; } },
      );
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(data).toEqual(mockOrder);
  });

  it('exposes error on API failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'));
    const { result } = renderHook(() => useCreateOrder(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({ payload: { id_loja: '', id_vendedor: '', nome_cliente: '', data_pedido: '', data_entrega: '', status: 'To Buy' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls PUT /pedidos/:id with the payload', async () => {
    const updated = { ...mockOrder, numero_nf: 'NF-123' };
    mockPut.mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateOrder('backend-uuid-abc'), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({ numero_nf: 'NF-123' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPut).toHaveBeenCalledWith('/pedidos/backend-uuid-abc', { numero_nf: 'NF-123' });
  });
});

describe('useDeleteOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls DELETE /pedidos/:id', async () => {
    mockDelete.mockResolvedValueOnce({ data: undefined });
    const { result } = renderHook(() => useDeleteOrder(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate('backend-uuid-abc');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith('/pedidos/backend-uuid-abc');
  });
});


describe('complete order persistence endpoints', () => {
  beforeEach(() => vi.clearAllMocks());
  it('creates the order and its children using the complete endpoint', async () => {
    mockPost.mockResolvedValueOnce({ data: mockOrder });
    const { result } = renderHook(() => useCreateOrder(), { wrapper: makeWrapper() });
    const payload = { id_loja: 'loja', id_vendedor: 'vendedor', nome_cliente: 'Cliente',
      data_pedido: '2026-09-11', data_entrega: '2026-09-12', status: 'To Buy' as const, itens: [], fretes: [] };
    await act(async () => { await result.current.mutateAsync({ payload, idempotencyKey: 'retry' }); });
    expect(mockPost).toHaveBeenCalledWith('/pedidos/complete', payload, { headers: { 'Idempotency-Key': 'retry' } });
  });
  it('uses a dedicated update endpoint so an older backend cannot silently ignore items', async () => {
    mockPut.mockResolvedValueOnce({ data: mockOrder });
    const { result } = renderHook(() => useUpdateOrder('order'), { wrapper: makeWrapper() });
    await act(async () => { await result.current.mutateAsync({ itens: [], fretes: [] }); });
    expect(mockPut).toHaveBeenCalledWith('/pedidos/order/complete', { itens: [], fretes: [] });
  });
});
