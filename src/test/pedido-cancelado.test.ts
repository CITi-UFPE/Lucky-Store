/**
 * Pedido cancelado tem que sair da conta do ticket medio — e o switch do modal
 * tem que concordar com o badge da lista.
 *
 * "Cancelado" estava escrito em dois campos que podiam discordar: o status, que
 * e o que o vendedor define na tela, e a flag is_cancelled, que so era ligada
 * pela rota PATCH /pedidos/{id}/status. A tela nunca manda a flag.
 *
 * Resultado: pedido criado JA cancelado (switch ligado antes do primeiro
 * salvar) entrava com status='Cancelled' e is_cancelled=false. O dashboard
 * filtrava so pela flag e contava esse pedido como venda — ele somava na
 * receita e entrava no divisor do ticket medio. Aqui no front o efeito visivel
 * era menor mas igualmente confuso: a lista mostrava o badge "Cancelado"
 * (getEffectiveStatus ja olhava o status) e o modal abria com o switch
 * desligado (cancelled olhava so a flag).
 *
 * A regra, agora igual nos dois lados: cancelado e status === 'Cancelled'.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Espelha o mapeamento de Sales.tsx (pedidoListToOrder) e de
// use-financial-orders.ts, que agora usam a mesma expressao.
function estaCancelado(item: { status: string; is_cancelled?: boolean | null }): boolean {
  return (item.is_cancelled ?? false) || item.status === 'Cancelled';
}

describe('pedido cancelado', () => {
  it('o pedido criado ja cancelado conta como cancelado mesmo com a flag falsa', () => {
    // O caso que quebrava o ticket medio: status diz cancelado, flag nao.
    expect(estaCancelado({ status: 'Cancelled', is_cancelled: false })).toBe(true);
  });

  it('a flag sozinha continua valendo, para linha antiga ainda nao migrada', () => {
    expect(estaCancelado({ status: 'To Buy', is_cancelled: true })).toBe(true);
  });

  it('flag ausente (null/undefined) nao cancela um pedido ativo', () => {
    expect(estaCancelado({ status: 'To Buy', is_cancelled: null })).toBe(false);
    expect(estaCancelado({ status: 'Delivered' })).toBe(false);
  });

  it('pedido entregue nao e cancelado', () => {
    expect(estaCancelado({ status: 'Delivered', is_cancelled: false })).toBe(false);
  });

  it('o switch do modal concorda com o badge da lista', () => {
    // getEffectiveStatus devolve 'Cancelled' para status === 'Cancelled'
    // independentemente da flag; `cancelled` precisa dizer o mesmo, senao o
    // badge sai vermelho com o switch desligado no mesmo pedido.
    const item = { status: 'Cancelled', is_cancelled: false };
    const badge = item.is_cancelled || item.status === 'Cancelled' ? 'Cancelled' : item.status;
    expect(estaCancelado(item)).toBe(badge === 'Cancelled');
  });
});

// A funcao acima e uma copia; sozinha ela nao impede ninguem de voltar o
// mapeamento para `is_cancelled ?? false`. Estes dois checam a fonte de verdade.
describe('os mapeadores usam a regra completa', () => {
  const ler = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

  it('Sales.tsx (lista de pedidos)', () => {
    expect(ler('pages/Sales.tsx')).toContain(
      "cancelled: (item.is_cancelled ?? false) || item.status === 'Cancelled',"
    );
  });

  it('use-financial-orders.ts (tela Financeiro)', () => {
    expect(ler('hooks/use-financial-orders.ts')).toContain(
      "cancelled: (p.is_cancelled ?? false) || p.status === 'Cancelled',"
    );
  });
});
