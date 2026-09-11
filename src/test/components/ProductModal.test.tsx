import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { ProductModal } from '@/components/ProductModal';
import { apiClient } from '@/api/client';
import type { Order, OrderItem } from '@/store/OrderStore';

vi.mock('@/api/client', () => ({ apiClient: { put: vi.fn() }, getApiError: () => 'Erro ao salvar' }));
vi.mock('@/hooks/useVendedores', () => ({ useVendedores: () => ({ data: { items: [] } }) }));
vi.mock('@/components/StatusTimeline', () => ({ ItemStatusTimeline: () => null }));

describe('salvar compra de produto', () => {
  it('envia o custo e atualiza os caches e o total local, incluindo fornecimento direto', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({ data: {} });
    const item: OrderItem = {
      id: 'item-1', name: 'Produto', quantity: 3, status: 'To Buy', projectedValue: 200,
      purchaseValue: 0, subPurchases: [{ id: 'sub-1', selectedQuantity: 3,
        supplier: 'Fornecedor', buyer: '', purchaseValue: 420, paymentMethod: '', status: 'Bought' }],
    };
    const order = { id: 'order-1', os: 'OS-1', items: [item], purchaseTaxPercent: 10,
      directSupplyItems: [{ purchaseValue: 50, quantity: 2 }] } as Order;
    const qc = new QueryClient();
    const dashboardKey = ['dashboard', 'kpis', {}];
    qc.setQueryData(dashboardKey, { custo: 0 });
    qc.setQueryData(['financial-orders'], []);
    const onSave = vi.fn();
    render(<QueryClientProvider client={qc}>
      <ProductModal open onClose={vi.fn()} order={order} item={item} onSave={onSave} />
    </QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(apiClient.put).toHaveBeenCalledWith('/pedidos/order-1/items/item-1', expect.objectContaining({
      status: 'Bought', valor_compra: 420,
    }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ finalProductCost: 520, purchaseTaxValue: 52,
      items: [expect.objectContaining({ status: 'Bought', purchaseValue: 420 })] });
    expect(qc.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['financial-orders'])?.isInvalidated).toBe(true);
    qc.clear();
  });
});
