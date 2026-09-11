/**
 * O documento da OS passa a mostrar as condições combinadas na cotação.
 *
 * Previsão de Entrega, Forma de Pagamento, Detalhes do Pagamento e Garantia
 * existem SÓ na cotação — o pedido não tem esses campos. Até agora só o
 * timbrado da cotação os mostrava: o cliente fechava a compra vendo garantia e
 * previsão de entrega, e a OS chegava a ele sem nenhuma das duas.
 *
 * Eles viajam junto do número da cotação (`termos_cotacao` na resposta do
 * pedido), pelo relacionamento que já era carregado com joinedload — imprimir
 * uma folha continua sendo uma requisição só.
 *
 * Regras que estes testes travam:
 *   - cada linha só entra se estiver preenchida, como a cotação já faz;
 *   - pedido criado do zero não tem cotação de origem e o bloco some inteiro;
 *   - a forma de pagamento sai traduzida ("Cartão de Crédito", não
 *     "Credit Card") — o papel vai para o cliente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/store/OrderStore';

interface Termos {
  deliveryForecast?: string | null;
  paymentMethod?: string | null;
  paymentDetails?: string | null;
  warranty?: string | null;
}

// Espelha a montagem dentro de OrderPrintTemplate.
function linhas(t?: Termos | null): [string, string][] {
  const dt = (v: string) => v.split('-').reverse().join('/');
  return ([
    t?.deliveryForecast ? ['Previsão de Entrega', dt(t.deliveryForecast)] : null,
    t?.paymentMethod
      ? ['Forma de Pagamento',
         PAYMENT_METHOD_LABELS[t.paymentMethod as PaymentMethod] ?? t.paymentMethod]
      : null,
    t?.paymentDetails?.trim() ? ['Detalhes do Pagamento', t.paymentDetails.trim()] : null,
    t?.warranty?.trim() ? ['Garantia', t.warranty.trim()] : null,
  ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null);
}

describe('bloco de condições da cotação', () => {
  it('mostra as quatro linhas quando a cotação tem as quatro', () => {
    const l = linhas({
      deliveryForecast: '2026-09-08',
      paymentMethod: 'Credit Card',
      paymentDetails: '3X',
      warranty: '1 ANO',
    });
    expect(l).toEqual([
      ['Previsão de Entrega', '08/09/2026'],
      ['Forma de Pagamento', 'Cartão de Crédito'],
      ['Detalhes do Pagamento', '3X'],
      ['Garantia', '1 ANO'],
    ]);
  });

  it('pedido criado do zero não tem bloco', () => {
    // Sem cotação de origem o backend manda null, e o bloco inteiro some do
    // papel — em vez de sair uma caixa com quatro travessões.
    expect(linhas(null)).toHaveLength(0);
    expect(linhas(undefined)).toHaveLength(0);
  });

  it('linha vazia não vira travessão: ela simplesmente não sai', () => {
    const l = linhas({ warranty: '1 ANO', paymentDetails: '   ' });
    expect(l).toEqual([['Garantia', '1 ANO']]);
  });

  it('forma de pagamento desconhecida sai como veio, sem quebrar', () => {
    expect(linhas({ paymentMethod: 'Permuta' })).toEqual([['Forma de Pagamento', 'Permuta']]);
  });
});

describe('o documento da OS usa a regra', () => {
  const fonte = readFileSync(resolve(__dirname, '..', 'components/OrderModal.tsx'), 'utf-8');

  it('o bloco só é renderizado quando há termo preenchido', () => {
    expect(fonte).toContain('{termos.length > 0 && (');
  });

  it('o título do bloco cita o número da cotação de origem', () => {
    expect(fonte).toContain('Condições da cotação');
    expect(fonte).toContain('form.sourceQuoteNumber != null ?');
  });

  it('a forma de pagamento do bloco de Pagamento também sai traduzida', () => {
    // Antes: {form.paymentMethod || form.paymentMethods?.join(', ')} — cru.
    expect(fonte).not.toContain("form.paymentMethods?.join(', ')");
    expect(fonte).toContain('const formasDePagamento =');
  });
});

describe('tabela de itens da OS', () => {
  const fonte = readFileSync(resolve(__dirname, '..', 'components/OrderModal.tsx'), 'utf-8');

  it('tem só as seis colunas pedidas', () => {
    expect(fonte).toContain(
      '<th>#</th><th>Produto</th><th className="c">Qtd</th>'
    );
    expect(fonte).toContain(
      '<th>Fornecedor</th><th className="r">Valor de compra</th><th className="r">Valor de venda</th>'
    );
  });

  it('não mostra mais Conf., Status nem Custo proj.', () => {
    expect(fonte).not.toContain('<th className="c">Conf.</th>');
    expect(fonte).not.toContain('Custo proj.');
    // O mapa de rótulo de status do papel ficou sem uso e saiu junto.
    expect(fonte).not.toContain('OP_ITEM_STATUS');
  });

  it('o valor de compra vem do que foi efetivamente comprado', () => {
    // calcItemFinalValue soma as sub-compras; item.purchaseValue sozinho fica
    // desatualizado quando a compra e dividida entre fornecedores.
    expect(fonte).toContain('calcItemFinalValue(item)');
  });

  it('os totais somam as mesmas linhas que foram impressas', () => {
    // Antes o rodape usava valores.custoInicial/custoFinal, que incluem os
    // itens de fornecimento direto — que esta tabela nao imprime. O total nao
    // fechava com a folha.
    //
    // A segunda soma mudou de `projectedValue` para `saleValue`: a coluna
    // "Valor de venda" lia o CUSTO projetado, que na maioria das cotacoes vem
    // zerado, e por isso a coluna inteira saia em R$ 0,00. Quem vigia esse
    // comportamento agora e os-valor-de-venda.test.tsx, que le o numero
    // impresso em vez do codigo; aqui fica so a garantia de que o total sai das
    // MESMAS linhas da folha.
    expect(fonte).toContain('itens.reduce((s, i) => s + calcItemFinalValue(i), 0)');
    expect(fonte).toContain("itens.reduce((s, i) => s + (i.saleValue || 0) * (i.quantity || 0), 0)");
  });
});
