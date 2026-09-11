import { it, expect } from 'vitest';
import { resizeInstallments } from '@/lib/installments';

it('restores the entire amount when returning from three installments to one', () => {
  const old = [1, 2, 3].map(() => ({ date: '2026-09-11', value: 100 }));
  expect(resizeInstallments(old, 1, 300)).toEqual([{ date: '2026-09-11', value: 300 }]);
});

it('clears a plan when installments are disabled and preserves cent rounding', () => {
  expect(resizeInstallments([{ date: '', value: 100 }], 0, 100)).toEqual([]);
  const plan = resizeInstallments([], 3, 100);
  expect(plan.map(p => p.value)).toEqual([33.33, 33.33, 33.34]);
});

it('keeps custom values when the installment count is unchanged', () => {
  const plan = [{ date: '', value: 80 }, { date: '', value: 20 }];
  expect(resizeInstallments(plan, 2, 100)).toBe(plan);
});
