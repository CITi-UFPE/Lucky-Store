/**
 * O card "Total de Pedidos" do Resumo do Mes contava a exclusao dos cancelados
 * duas vezes.
 *
 * No backend, num_pedidos e num_cancelamentos sao contagens DISJUNTAS sobre as
 * mesmas linhas — num_pedidos ja e "quantos NAO estao cancelados":
 *
 *   count(CASE WHEN PEDIDO_ATIVO     THEN 1 END)  AS num_pedidos
 *   count(CASE WHEN PEDIDO_CANCELADO THEN 1 END)  AS num_cancelamentos
 *
 * O card mostrava num_pedidos rotulado como "Total de Pedidos" e, no subtitulo,
 * subtraia os cancelados dele de novo para achar os "concluidos". Com 6 pedidos
 * validos e 4 cancelados no mes, ele dizia:
 *
 *   Total de Pedidos: 6   —   "2 concluidos · 4 cancelados"
 *
 * Ou seja: inventava um total que nao existia (o real era 10) e um numero de
 * concluidos que nao existia (o real era 6). E ai o Ticket Medio, que divide a
 * receita pelos 6 validos, parecia estar dividindo pelos cancelados junto —
 * 7.832 / 6 = 1.305,33 lido como "deveria ser 7.832 / 2".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Kpis { num_pedidos: number; num_cancelamentos: number }

const total = (k: Kpis) => k.num_pedidos + k.num_cancelamentos;
const validos = (k: Kpis) => k.num_pedidos;

describe('Resumo do Mes — Total de Pedidos', () => {
  const cenario: Kpis = { num_pedidos: 6, num_cancelamentos: 4 };

  it('o total soma validos e cancelados, porque as contagens sao disjuntas', () => {
    expect(total(cenario)).toBe(10);
  });

  it('os validos sao num_pedidos, nao num_pedidos menos os cancelados', () => {
    expect(validos(cenario)).toBe(6);
    // A conta antiga dava 2 — um numero que nao corresponde a nada no banco.
    expect(validos(cenario)).not.toBe(cenario.num_pedidos - cenario.num_cancelamentos);
  });

  it('sem cancelamento, total e validos coincidem', () => {
    const k: Kpis = { num_pedidos: 3, num_cancelamentos: 0 };
    expect(total(k)).toBe(3);
    expect(validos(k)).toBe(3);
  });

  it('mes so com cancelamentos nao inventa pedido valido', () => {
    const k: Kpis = { num_pedidos: 0, num_cancelamentos: 5 };
    expect(total(k)).toBe(5);
    expect(validos(k)).toBe(0);
  });
});

describe('o card usa essas contas', () => {
  const fonte = readFileSync(resolve(__dirname, '..', 'pages/Dashboard.tsx'), 'utf-8');

  it('o valor do card e a soma das duas contagens', () => {
    expect(fonte).toContain(
      "value={String((kpis?.num_pedidos ?? 0) + (kpis?.num_cancelamentos ?? 0))}"
    );
  });

  it('nao subtrai mais os cancelados de num_pedidos', () => {
    expect(fonte).not.toContain('(kpis?.num_pedidos ?? 0) - (kpis?.num_cancelamentos ?? 0)');
  });
});
