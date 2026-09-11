import type { PaymentInstallment } from '@/store/OrderStore';

/** Redistribute the total when the number of installments changes, to the cent. */
export function resizeInstallments(plan: PaymentInstallment[], count: number, total: number): PaymentInstallment[] {
  if (plan.length === count) return plan;
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const per = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => ({
    date: plan[i]?.date || '',
    value: (i === count - 1 ? cents - per * (count - 1) : per) / 100,
  }));
}
