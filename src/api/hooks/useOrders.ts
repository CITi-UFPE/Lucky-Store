import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import type {
  PedidoResponse,
  PaginatedResponse,
  CreatePedidoPayload,
  UpdatePedidoPayload,
  PedidoFilters,
  PedidoStatus,
  OrderHistoryResponse,
  ItemHistoryResponse,
} from '../../types/api';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: PedidoFilters) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
  history: (id: string) => [...orderKeys.all, 'history', id] as const,
  itemHistory: (pedidoId: string, itemId: string) => [...orderKeys.all, 'item-history', pedidoId, itemId] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Lista pedidos com filtros e paginação. */
export function useOrders(filters: PedidoFilters = {}) {
  return useQuery<PaginatedResponse<PedidoResponse>>({
    queryKey: orderKeys.list(filters),
    queryFn: () =>
      apiClient.get('/pedidos', { params: filters }).then((r) => r.data),
    staleTime: 30_000,
  });
}

/** Busca o histórico de status de um item/produto. Só executa quando enabled=true. */
export function useItemHistory(pedidoId: string, itemId: string, enabled: boolean) {
  return useQuery<ItemHistoryResponse>({
    queryKey: orderKeys.itemHistory(pedidoId, itemId),
    queryFn: () => apiClient.get(`/pedidos/${pedidoId}/items/${itemId}/history`).then((r) => r.data),
    enabled: enabled && !!pedidoId && !!itemId,
    staleTime: 60_000,
  });
}

/** Busca o histórico de status de um pedido. Só executa quando enabled=true. */
export function useOrderHistory(pedidoId: string, enabled: boolean) {
  return useQuery<OrderHistoryResponse>({
    queryKey: orderKeys.history(pedidoId),
    queryFn: () => apiClient.get(`/pedidos/${pedidoId}/history`).then((r) => r.data),
    enabled: enabled && !!pedidoId,
    staleTime: 60_000,
  });
}

/** Retorna um pedido específico com histórico de status. */
export function useOrder(id: string) {
  return useQuery<PedidoResponse>({
    queryKey: orderKeys.detail(id),
    queryFn: () => apiClient.get(`/pedidos/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Variaveis de `useCreateOrder`: o pedido e a chave da tentativa de salvar. */
export interface CreateOrderVars {
  payload: CreatePedidoPayload;
  /**
   * Idempotency-Key. Identifica a TENTATIVA de salvar, nao o pedido: quem
   * chama gera uma por clique em "Criar Pedido" e manda a mesma se precisar
   * tentar de novo. Vendo uma chave que ja criou pedido, o backend devolve
   * aquele em vez de criar outro — e o que impede pedido duplicado e numero de
   * OS queimado quando a criacao da certo mas a resposta se perde.
   *
   * Opcional: sem ela, o backend se comporta como antes.
   */
  idempotencyKey?: string;
}

/** Cria um novo pedido. Invalida a listagem ao ter sucesso. */
export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation<PedidoResponse, Error, CreateOrderVars>({
    mutationFn: ({ payload, idempotencyKey }) =>
      apiClient
        .post(payload.itens !== undefined ? '/pedidos/complete' : '/pedidos', payload, {
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}

/** Atualiza campos de um pedido. Atualiza o cache do detalhe e invalida a lista. */
export function useUpdateOrder(id: string) {
  const qc = useQueryClient();
  return useMutation<PedidoResponse, Error, UpdatePedidoPayload>({
    mutationFn: (payload) =>
      apiClient.put(`/pedidos/${id}${payload.itens !== undefined ? '/complete' : ''}`, payload).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(orderKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
      qc.invalidateQueries({ queryKey: orderKeys.history(id) });
    },
  });
}

/** Muda o status de um pedido. Suporta motivo opcional. */
export function useUpdateOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation<
    PedidoResponse,
    Error,
    { new_status: PedidoStatus; reason?: string }
  >({
    mutationFn: ({ new_status, reason }) =>
      apiClient
        .patch(`/pedidos/${id}/status`, { new_status, reason })
        .then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(orderKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
      qc.invalidateQueries({ queryKey: orderKeys.history(id) });
    },
  });
}

/** Muda o status de um pedido com ID dinâmico (para uso em listas). */
export function useUpdateOrderStatusInline() {
  const qc = useQueryClient();
  return useMutation<
    PedidoResponse,
    Error,
    { id: string; new_status: PedidoStatus; reason?: string }
  >({
    mutationFn: ({ id, new_status, reason }) =>
      apiClient
        .patch(`/pedidos/${id}/status`, { new_status, reason })
        .then((r) => r.data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
      qc.invalidateQueries({ queryKey: orderKeys.history(id) });
    },
  });
}

/** Atualiza o status de um item de pedido. */
export function useUpdateItemStatus() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { pedidoId: string; itemId: string; newStatus: string }>({
    mutationFn: ({ pedidoId, itemId, newStatus }) =>
      apiClient.patch(`/pedidos/${pedidoId}/items/${itemId}/status`, { new_status: newStatus }).then((r) => r.data),
    onSuccess: (_data, { pedidoId, itemId }) => {
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
      qc.invalidateQueries({ queryKey: orderKeys.itemHistory(pedidoId, itemId) });
    },
  });
}

/** Soft-delete de um pedido. */
export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiClient.delete(`/pedidos/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });
}
