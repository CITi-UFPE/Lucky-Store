import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import type {
  CotacaoResponse,
  PaginatedResponse,
  CreateCotacaoPayload,
  UpdateCotacaoPayload,
  UpdateCotacaoFasePayload,
  CotacaoFilters,
  ConversaoResponse,
  QuoteHistoryResponse,
} from '../../types/api';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const quoteKeys = {
  all: ['quotes'] as const,
  lists: () => [...quoteKeys.all, 'list'] as const,
  list: (filters: CotacaoFilters) => [...quoteKeys.lists(), filters] as const,
  details: () => [...quoteKeys.all, 'detail'] as const,
  detail: (id: string) => [...quoteKeys.details(), id] as const,
  history: (id: string) => [...quoteKeys.all, 'history', id] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Busca o histórico de fases de uma cotação. Só executa quando enabled=true. */
export function useQuoteHistory(quoteId: string, enabled: boolean) {
  return useQuery<QuoteHistoryResponse>({
    queryKey: quoteKeys.history(quoteId),
    queryFn: () => apiClient.get(`/quotes/${quoteId}/history`).then((r) => r.data),
    enabled: enabled && !!quoteId,
    staleTime: 60_000,
  });
}

/** Lista cotações com filtros e paginação. */
export function useQuotes(filters: CotacaoFilters = {}) {
  return useQuery<PaginatedResponse<CotacaoResponse>>({
    queryKey: quoteKeys.list(filters),
    queryFn: () =>
      apiClient.get('/quotes', { params: filters }).then((r) => r.data),
    staleTime: 60_000,
  });
}

/** Retorna uma cotação específica com seus itens. */
export function useQuote(id: string) {
  return useQuery<CotacaoResponse>({
    queryKey: quoteKeys.detail(id),
    queryFn: () => apiClient.get(`/quotes/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Variáveis de `useCreateQuote`: a cotação e a chave da tentativa de salvar. */
export interface CreateQuoteVars {
  payload: CreateCotacaoPayload;
  /**
   * Idempotency-Key. Identifica a TENTATIVA de salvar, não a cotação: quem
   * chama gera uma por clique em "Criar Cotação" e manda a mesma se precisar
   * tentar de novo. Vendo uma chave que já criou cotação, o backend devolve
   * aquela em vez de criar outra — é o que impede cotação duplicada e número
   * queimado quando a criação dá certo mas a resposta se perde.
   *
   * Opcional: sem ela, o backend se comporta como antes.
   */
  idempotencyKey?: string;
}

/** Cria uma nova cotação com itens opcionais. */
export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation<CotacaoResponse, Error, CreateQuoteVars>({
    mutationFn: ({ payload, idempotencyKey }) =>
      apiClient
        .post('/quotes', payload, {
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
    },
  });
}

/** Atualiza dados principais de uma cotação. */
export function useUpdateQuote(id: string) {
  const qc = useQueryClient();
  return useMutation<CotacaoResponse, Error, UpdateCotacaoPayload>({
    mutationFn: (payload) =>
      apiClient.put(`/quotes/${id}${payload.itens !== undefined ? '/complete' : ''}`, payload).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(quoteKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.history(id) });
    },
  });
}

/** Atualiza uma ou mais fases da cotação (enviada, em fechamento, fechada, caída). */
export function useUpdateQuotePhase(id: string) {
  const qc = useQueryClient();
  return useMutation<CotacaoResponse, Error, UpdateCotacaoFasePayload>({
    mutationFn: (payload) =>
      apiClient.patch(`/quotes/${id}/phase`, payload).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(quoteKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: quoteKeys.history(id) });
    },
  });
}

/** Soft-delete de uma cotação. */
export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete(`/quotes/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
    },
  });
}

/** Converte uma cotação em pedido. Invalida listas de cotações e pedidos. */
export function useConvertQuote() {
  const qc = useQueryClient();
  return useMutation<ConversaoResponse, Error, string>({
    mutationFn: (id) =>
      apiClient.post(`/quotes/${id}/convert`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quoteKeys.lists() });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** Adiciona um item a uma cotação existente. */
export function useAddQuoteItem(quoteId: string) {
  const qc = useQueryClient();
  return useMutation<
    CotacaoResponse,
    Error,
    {
      descricao: string;
      quantidade: number;
      valor_unitario: string;
      valor_fechamento?: string;
      fornecedor?: string;
    }
  >({
    mutationFn: (payload) =>
      apiClient.post(`/quotes/${quoteId}/items`, payload).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(quoteKeys.detail(quoteId), data);
    },
  });
}

/** Remove um item de uma cotação. */
export function useDeleteQuoteItem(quoteId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (itemId) =>
      apiClient
        .delete(`/quotes/${quoteId}/items/${itemId}`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) });
    },
  });
}
