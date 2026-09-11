import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, it, expect, beforeEach, afterEach } from 'vitest';
import { FinanceProvider, useFinance, type Expense } from '@/store/FinanceStore';
import { ExpenseModal } from '@/components/finance/ExpenseModal';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const api = vi.mocked(apiFetch);
const record = { id: 'expense', tipo: 'PAGO', servico: 'Aluguel', destino: 'Loja', valor_pago: 100 };
const expense = { id: 'expense', kind: 'PAGO', service: 'Aluguel', paidValue: 100 } as Expense;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <FinanceProvider>{children}</FinanceProvider>
  </QueryClientProvider>
);
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it.each(['addExpense', 'updateExpense', 'deleteExpense'] as const)('%s does not change persisted display after rejection', async action => {
  api.mockResolvedValueOnce([record]).mockRejectedValue(new Error('Servidor indisponível'));
  const { result } = renderHook(() => useFinance(), { wrapper });
  await waitFor(() => expect(result.current.expenses).toHaveLength(1));
  await act(async () => {
    const promise = action === 'deleteExpense' ? result.current.deleteExpense('expense')
      : result.current[action]({ ...expense, paidValue: 200 });
    await expect(promise).rejects.toThrow('Servidor indisponível');
  });
  expect(result.current.expenses).toEqual([expect.objectContaining({ id: 'expense', paidValue: 100 })]);
});

it('waits for the server and keeps the expense form on error', async () => {
  let reject!: (reason: Error) => void;
  const onSave = vi.fn(() => new Promise<void>((_resolve, no) => { reject = no; }));
  const onClose = vi.fn();
  render(<ExpenseModal open expense={expense} onSave={onSave} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  await act(async () => reject(new Error('Falha de gravação')));
  expect(toast.error).toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  onSave.mockResolvedValueOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it.each(['addExpense', 'deleteExpense', 'endRecurrence'] as const)('refreshes after successful recurring %s', async action => {
  api.mockResolvedValueOnce([{ ...record, recorrencia_id: 'series', recorrente: true }])
    .mockResolvedValueOnce(record).mockResolvedValueOnce([]);
  const { result } = renderHook(() => useFinance(), { wrapper });
  await waitFor(() => expect(result.current.expenses).toHaveLength(1));
  await act(async () => {
    if (action === 'addExpense') await result.current.addExpense({ ...expense, recurring: true });
    else await result.current[action]('expense');
  });
  expect(result.current.expenses).toEqual([]);
  expect(api.mock.calls.map(c => c[0])).toEqual([
    '/despesas',
    action === 'addExpense' ? '/despesas' : action === 'deleteExpense' ? '/despesas/expense' : '/despesas/expense/encerrar-recorrencia',
    '/despesas',
  ]);
});
