import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useCreateQuote, useUpdateQuote } from '@/api/hooks/useQuotes';
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

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

const mockQuote = {
  id: 'quote-backend-uuid',
  cliente: 'Empresa ABC',
  status_enviada: false,
  status_fechada: false,
};

describe('useCreateQuote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls POST /quotes with the payload', async () => {
    mockPost.mockResolvedValueOnce({ data: mockQuote });

    const { result } = renderHook(() => useCreateQuote(), { wrapper: makeWrapper() });

    const payload = {
      id_loja: 'loja-1',
      id_vendedor: 'vendedor-1',
      cliente: 'Empresa ABC',
      data_cotacao: '2026-05-11',
    };

    await act(async () => {
      result.current.mutate({ payload });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, corpo] = mockPost.mock.calls[0];
    expect(url).toBe('/quotes');
    expect(corpo).toEqual(payload);
  });

  it('manda a chave da tentativa no header Idempotency-Key', async () => {
    mockPost.mockResolvedValueOnce({ data: mockQuote });
    const { result } = renderHook(() => useCreateQuote(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({
        payload: { id_loja: 'loja-1', id_vendedor: 'vendedor-1', cliente: 'X', data_cotacao: '2026-05-11' },
        idempotencyKey: 'chave-da-tentativa-1',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, , config] = mockPost.mock.calls[0];
    expect(config.headers['Idempotency-Key']).toBe('chave-da-tentativa-1');
  });

  it('sem chave, nao inventa header — o backend segue como antes', async () => {
    mockPost.mockResolvedValueOnce({ data: mockQuote });
    const { result } = renderHook(() => useCreateQuote(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({
        payload: { id_loja: 'loja-1', id_vendedor: 'vendedor-1', cliente: 'X', data_cotacao: '2026-05-11' },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, , config] = mockPost.mock.calls[0];
    expect(config?.headers).toBeUndefined();
  });

  it('returns the created quote with backend id', async () => {
    mockPost.mockResolvedValueOnce({ data: mockQuote });
    const { result } = renderHook(() => useCreateQuote(), { wrapper: makeWrapper() });

    let receivedData: any;
    await act(async () => {
      result.current.mutate(
        { payload: { id_loja: '', id_vendedor: '', cliente: 'X', data_cotacao: '' } },
        { onSuccess: (d) => { receivedData = d; } },
      );
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedData.id).toBe('quote-backend-uuid');
  });

  it('surfaces errors from the API', async () => {
    mockPost.mockRejectedValueOnce(new Error('Server Error'));
    const { result } = renderHook(() => useCreateQuote(), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({ payload: { id_loja: '', id_vendedor: '', cliente: '', data_cotacao: '' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateQuote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls PUT /quotes/:id with the payload', async () => {
    const updated = { ...mockQuote, cliente: 'Updated Corp' };
    mockPut.mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateQuote('quote-backend-uuid'), { wrapper: makeWrapper() });

    await act(async () => {
      result.current.mutate({ cliente: 'Updated Corp' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPut).toHaveBeenCalledWith('/quotes/quote-backend-uuid', { cliente: 'Updated Corp' });
  });
});


it('updates quote items and phases through the complete endpoint', async () => {
  vi.clearAllMocks();
  mockPut.mockResolvedValueOnce({ data: mockQuote });
  const { result } = renderHook(() => useUpdateQuote('quote'), { wrapper: makeWrapper() });
  const payload = { itens: [], fase: { status_enviada: true } };
  await act(async () => { await result.current.mutateAsync(payload); });
  expect(mockPut).toHaveBeenCalledWith('/quotes/quote/complete', payload);
});
