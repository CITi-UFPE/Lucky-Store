/**
 * Despesa recorrente na tela.
 *
 * Custo fixo se repete todo mês, mas cada despesa era um registro solto com uma
 * data só — para o Dashboard mostrar o custo fixo em três meses, alguém
 * cadastrava o aluguel três vezes. Esquecendo um mês, o Dashboard mostrava
 * lucro maior que o real, calado.
 *
 * Agora, marcando "Repetir todo mês" ao cadastrar, o backend passa a criar uma
 * despesa DE VERDADE por mês. É o que permite março estar pago e abril não.
 *
 * Duas decisões de tela que este arquivo trava, porque quebram sem dar erro:
 *
 * 1. O switch só aparece ao CRIAR. Numa despesa que já existe, desmarcar não
 *    seria "parar de repetir" — seria apagar os meses futuros já lançados.
 *    Isso é ação deliberada, com confirmação, e não um switch que se desmarca
 *    junto com outra edição.
 *
 * 2. Depois de salvar uma recorrente, a lista é recarregada do servidor. Os
 *    próximos meses são criados lá; sem recarregar, a tela mostraria só o
 *    primeiro e daria a impressão de que a repetição não funcionou.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
const modal = ler('components/finance/ExpenseModal.tsx');
const store = ler('store/FinanceStore.tsx');
const manager = ler('components/finance/FinancialManager.tsx');

describe('escolher que a despesa se repete', () => {
  it('o switch existe no cadastro', () => {
    expect(modal).toContain('Repetir todo mês');
    expect(modal).toContain("onCheckedChange={v => upd('recurring', v)}");
  });

  it('o switch NÃO aparece numa despesa que já existe', () => {
    // `{!expense && (` antes do bloco: editar uma despesa não pode oferecer
    // desmarcar a repetição, porque desmarcar apaga meses futuros.
    const bloco = modal.slice(modal.indexOf('{/* Repetição.'), modal.indexOf('Repetir todo mês'));
    expect(bloco).toContain('{!expense && (');
  });

  it('o texto explica o que vai acontecer', () => {
    // Sem isso, "repetir todo mês" pode ser lido como "um registro contado
    // várias vezes" — e aí ninguém espera poder pagar um mês só.
    expect(modal).toContain('Cria uma despesa por mês a partir desta');
  });
});

describe('encerrar a repetição', () => {
  it('só aparece numa ocorrência de série ativa', () => {
    expect(modal).toContain('expense?.recurrenceId && expense.recurring && onEndRecurrence');
  });

  it('pede confirmação antes, dizendo o que se perde', () => {
    // Encerrar remove previsões futuras. Fazer isso sem confirmar é apagar
    // lançamento financeiro com um clique.
    expect(modal).toContain('Encerrar a repetição?');
    expect(modal).toContain('As previsões');
    expect(modal).toContain('futuras ainda não pagas são removidas');
  });

  it('está ligado na tela de Financeiro', () => {
    expect(manager).toContain('onEndRecurrence={endRecurrence}');
    expect(manager).toContain('deleteExpense, endRecurrence } = useFinance()');
  });
});

describe('excluir uma recorrente', () => {
  it('avisa que leva todas as repetições não pagas', () => {
    // Sem o aviso, quem clica espera perder um mês e perde o ano inteiro.
    expect(modal).toContain('todas as repetições ainda não pagas');
    expect(modal).toContain('os meses já pagos ficam');
  });

  it('a despesa comum continua com o aviso simples', () => {
    expect(modal).toContain('Esta ação removerá permanentemente a despesa');
  });

  it('recarrega a lista, porque o servidor removeu mais de uma', () => {
    // Tirar só o id local deixaria os outros meses na tela até alguém
    // recarregar — parecendo que a exclusão falhou pela metade.
    const trecho = store.slice(store.indexOf('const deleteExpense'));
    expect(trecho).toContain('recorrente ? recarregar() : undefined');
  });
});

describe('o caminho dos dados', () => {
  it('o payload manda a marca ao criar', () => {
    expect(store).toContain('recorrente: e.recurring ?? false,');
  });

  it('a resposta traz a marca, o grupo e o mês', () => {
    expect(store).toContain('recurring: a.recorrente ?? false,');
    expect(store).toContain('recurrenceId: a.recorrencia_id ?? undefined,');
    expect(store).toContain('competence: a.competencia ?? undefined,');
  });

  it('salvar uma recorrente recarrega a lista', () => {
    // Os meses seguintes nascem no servidor. Sem isto, o vendedor salva o
    // aluguel recorrente, vê um mês só, e conclui que não funcionou.
    expect(store).toContain('if (e.recurring) return recarregar();');
  });

  it('encerrar recarrega em vez de adivinhar o que sumiu', () => {
    // Deduzir aqui quais previsões foram removidas é reescrever a regra do
    // servidor no cliente — e as duas saem de sincronia na primeira mudança.
    const trecho = store.slice(store.indexOf('const endRecurrence'));
    expect(trecho).toContain('encerrar-recorrencia');
    expect(trecho).toContain('.then(() => recarregar())');
  });
});
