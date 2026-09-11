import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { PedidoListResponse } from './use-orders-query';
import type { Order } from '@/store/OrderStore';
import { pedidoListToOrder } from '@/lib/order-adapter';

export const adaptPedidoToOrder = pedidoListToOrder;

export async function fetchFinancialOrders(): Promise<Order[]> {
  const orders: Order[] = [];
  let page = 1;
  let pages = 1;
  do {
    const response = await apiFetch<PedidoListResponse>('/pedidos', {
      params: { page, limit: 500, sort_by: 'data_pedido', sort_dir: 'desc' },
    });
    orders.push(...response.items.map(adaptPedidoToOrder));
    pages = response.pages;
    page += 1;
  } while (page <= pages);
  return orders;
}

export function useFinancialOrders() {
  return useQuery<Order[]>({
    queryKey: ['financial-orders'],
    queryFn: fetchFinancialOrders,
    staleTime: 60_000,
  });
}
