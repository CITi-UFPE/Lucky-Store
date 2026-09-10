/**
 * O card de Custo Fixo leva para onde se cadastra despesa.
 *
 * O card não tem campo para digitar, e não é esquecimento: ele não guarda um
 * valor. É a SOMA das despesas cadastradas dentro do período selecionado
 * (`gastos_fixos` em dashboard.py soma a tabela `despesas`). O número é
 * resultado, não entrada.
 *
 * Quem abria o Dashboard procurando onde definir o custo fixo não encontrava,
 * porque o lugar é outra tela — Financeiro > Adicionar Despesa — e nada no card
 * dizia isso. O card virou o caminho.
 *
 * Segmentar o custo já funcionava e continua funcionando sem nada novo: cada
 * despesa tem Serviço e Destino próprios, então "Aluguel", "Salários" e
 * "Contador" são três cadastros, e o card soma os três.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
const dashboard = ler('pages/Dashboard.tsx');

/** O trecho do card, isolado pelo label. */
const card = () => {
  const i = dashboard.indexOf('label="Custo Fixo"');
  expect(i).toBeGreaterThan(-1);
  return dashboard.slice(i, dashboard.indexOf('/>', i));
};

describe('card de Custo Fixo', () => {
  it('continua mostrando a soma das despesas', () => {
    expect(card()).toContain('value={BRL(gastosFixos)}');
  });

  it('leva para a tela onde a despesa é cadastrada', () => {
    // Sem isto o card é um beco: mostra o número e não diz de onde ele vem.
    expect(card()).toContain("onClick={() => navigate('/financial')}");
  });

  it('o texto de apoio diz que dá para clicar', () => {
    // Um card clicável que não avisa que é clicável não resolve o problema —
    // continua sendo preciso adivinhar.
    expect(card()).toContain('clique para cadastrar');
  });
});

describe('o card clicável é de verdade', () => {
  const kpi = ler('components/dashboard/KpiCard.tsx');

  it('vira botão, com teclado e foco', () => {
    // Não basta o onClick: sem role e tabIndex, quem navega por teclado não
    // alcança, e o cursor nem muda para indicar que dá para clicar.
    expect(kpi).toContain("role={clickable ? 'button' : undefined}");
    expect(kpi).toContain('tabIndex={clickable ? 0 : undefined}');
    expect(kpi).toContain("if (e.key === 'Enter' || e.key === ' ')");
  });
});

describe('a despesa já é segmentável', () => {
  it('cada despesa tem serviço e destino próprios', () => {
    // É o que permite quebrar o custo fixo em aluguel, salários, contador —
    // sem precisar de campo novo nenhum.
    const store = ler('store/FinanceStore.tsx');
    expect(store).toContain('service: string;');
    expect(store).toContain('destination: string;');
  });

  it('a tela de cadastro existe e está acessível', () => {
    expect(ler('components/finance/FinancialManager.tsx')).toContain('Adicionar Despesa');
    expect(ler('App.tsx')).toContain('path="/financial"');
  });
});
