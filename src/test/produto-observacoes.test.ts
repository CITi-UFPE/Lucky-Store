/**
 * A tela de Produtos ganhou uma caixa de Observações.
 *
 * O pedido e a cotação já tinham a delas; o item não. Quem acompanha a compra
 * item a item não tinha onde anotar — fornecedor que ligou, prazo que mudou,
 * por que a compra parou. Isso ia para a observação do PEDIDO, misturado com o
 * que era dos outros itens.
 *
 * A anotação vive no produto (coluna `observacao`, migration b8c9d0e1f2a3) e
 * viaja pelo mesmo caminho dos outros campos do item.
 *
 * Um detalhe que é fácil quebrar sem perceber: o payload manda `observacao`
 * SEMPRE, inclusive vazio. O backend usa `exclude_none`, então `null` seria
 * descartado e a anotação nunca poderia ser apagada — o vendedor limparia a
 * caixa, salvaria, e o texto continuaria lá ao reabrir.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');
const modal = ler('components/ProductModal.tsx');

describe('caixa de Observações do produto', () => {
  it('existe, com a seção própria', () => {
    expect(modal).toContain('id="sec-obs"');
    expect(modal).toContain('Anotações sobre este produto...');
  });

  it('é grande e redimensionável, como as outras', () => {
    expect(modal).toContain('min-h-48 resize-y');
  });

  it('não tem limite de caracteres', () => {
    const trecho = modal.slice(modal.indexOf('id="sec-obs"'), modal.indexOf('HISTÓRICO DE STATUS'));
    expect(trecho).not.toContain('maxLength');
  });

  it('aparece no menu lateral do modal', () => {
    expect(modal).toContain('<a href="#sec-obs">Observações</a>');
  });
});

describe('a anotação vai e volta', () => {
  it('a caixa começa com o que já estava salvo', () => {
    // Sem isto o vendedor reabre o item e a caixa aparece vazia, dando a
    // impressao de que a anotacao se perdeu.
    expect(modal).toContain("setObservacoes(item.observations ?? '');");
  });

  it('o payload manda a observação SEMPRE, inclusive vazia', () => {
    // `payload.observacao = observacoes` sem condicao: string vazia limpa.
    // Com `if (observacoes)` na frente, apagar a anotacao pararia de funcionar.
    expect(modal).toContain('payload.observacao = observacoes;');
    expect(modal).not.toMatch(/if\s*\([^)]*observacoes[^)]*\)\s*payload\.observacao/);
  });

  it('o item atualizado leva a anotação para a tela', () => {
    expect(modal).toContain('observations: observacoes,');
  });
});

describe('o caminho dos dados', () => {
  it('o tipo do item tem o campo', () => {
    expect(ler('store/OrderStore.tsx')).toContain('observations?: string;');
  });

  it('o tipo da API tem o campo', () => {
    expect(ler('types/api.ts')).toContain('observacao: string | null;');
  });

  it('Sales.tsx entrega a anotação ao abrir o produto', () => {
    // Dois lugares: a lista de itens do pedido e a abertura do modal a partir
    // da aba Produtos. Faltando um, a caixa abre vazia por um dos caminhos.
    const fonte = ler('pages/Sales.tsx');
    const ocorrencias = fonte.split("observations: produto.observacao ?? ''").length - 1
      + fonte.split("observations: p.observacao ?? ''").length - 1;
    expect(ocorrencias).toBe(2);
  });
});
