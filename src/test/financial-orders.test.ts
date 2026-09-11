import { vi, it, expect } from 'vitest';
import { adaptPedidoToOrder, fetchFinancialOrders } from '@/hooks/use-financial-orders';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

it('preserves commercial terms, costs, prices, direct supply and unnamed paid freight', () => {
  const order = adaptPedidoToOrder({
    nome_vendedor: 'Alcides', contato_cliente: 'Contato', numero_cotacao: 82,
    termos_cotacao: { garantia: '12 meses', forma_pagamento: 'Pix' },
    custo: { custo_boleto: '50', pct_imposto_venda: '10', imposto_venda: '100' },
    produtos: [
      { id: 'normal', descricao: 'Normal', quantidade: 1, valor_venda: '500', observacao: 'Obs' },
      { id: 'ds', descricao: 'Direto', quantidade: 1, is_direct_supply: true, preco_custo: '40', valor_compra: '80' },
    ],
    fretes: [{ id: 'f', entregador: null, valor: '20', data_frete: '2026-09-11', pago: true }],
  } as any);
  expect(order).toMatchObject({ seller: 'Alcides', customerContact: 'Contato', sourceQuoteNumber: 82,
    quoteTerms: { warranty: '12 meses', paymentMethod: 'Pix' },
    boletoCost: 50, salesTaxPercent: 10, salesTaxValue: 100,
    items: [{ id: 'normal', saleValue: 500, observations: 'Obs' }],
    directSupplyItems: [{ id: 'ds', purchaseValue: 40, closingValue: 80 }],
    freight: [{ deliveryPerson: '', value: 20, pago: true }],
  });
});

it('loads remaining pages so the 501st order is included', async () => {
  const api = vi.mocked(apiFetch);
  api.mockReset();
  api.mockResolvedValueOnce({ items: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })), page: 1, pages: 2, total: 501 })
    .mockResolvedValueOnce({ items: [{ id: 'last' }], page: 2, pages: 2, total: 501 });
  const orders = await fetchFinancialOrders();
  expect(orders).toHaveLength(501);
  expect(orders[500].id).toBe('last');
  expect(api.mock.calls[1][1]?.params?.page).toBe(2);
});

it('does not publish an incomplete list when a later page fails', async () => {
  const api = vi.mocked(apiFetch);
  api.mockReset();
  api.mockResolvedValueOnce({ items: [{ id: 'first' }], pages: 2 }).mockRejectedValueOnce(new Error('Failed page 2'));
  await expect(fetchFinancialOrders()).rejects.toThrow('Failed page 2');
});
