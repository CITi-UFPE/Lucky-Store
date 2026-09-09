/**
 * A cotação normal tem que caber em uma folha.
 *
 * O rodapé já não repetia mais, mas ele estava sendo PARTIDO: o cartão de
 * contato ficava na página 1 e a linha do CNPJ ia sozinha para a 2.
 *
 * Medido no Chrome, em mídia de impressão, com a imagem real do timbrado da
 * BTech carregada (392x294, renderizada a 300px de largura = 61,6mm de altura):
 *
 *     cabeçalho   61,6mm
 *     conteúdo   173,4mm
 *     rodapé      45,5mm   (padding 6mm/8mm + cartão + linha do CNPJ)
 *     ─────────────────
 *     documento  281,7mm
 *     útil       281,0mm   (A4 297mm − 16mm de margem superior, 0 embaixo)
 *
 * Sobrava −0,7mm. Não era "quase couber": era estourar por menos de um
 * milímetro, e por isso só a última linha caía. Qualquer variação bastava —
 * imprimir com "cabeçalhos e rodapés" ligado no Chrome, que é o que a foto do
 * PDF mostrava, já empurrava.
 *
 * O timbrado em si não mudou: mesmo logo, mesmo tamanho, mesmo conteúdo. O que
 * foi cortado é só espaço em branco:
 *
 *     margem superior da página   16mm → 10mm    +6,0mm
 *     padding do rodapé          6/8mm → 3/4mm   +7,0mm
 *
 * Depois: documento 274,7mm contra 287mm úteis — 12,3mm de folga. Uma página,
 * inclusive com o cabeçalho e o rodapé do Chrome ligados, que é como a
 * impressão do usuário estava configurada.
 *
 * E `break-inside: avoid` no rodapé para ele nunca mais ser partido: numa
 * cotação longa de verdade ele vai INTEIRO para a última página, em vez de
 * deixar uma linha órfã.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fonte = readFileSync(
  resolve(__dirname, '..', 'components/QuoteModal.tsx'), 'utf-8',
);

/** Altura, em mm, do timbrado renderizado — a conta que decide a paginação. */
function alturaDoLogo(maxWidthPx: number, larguraNatural = 392, alturaNatural = 294) {
  const px = maxWidthPx * (alturaNatural / larguraNatural);
  return px / (96 / 25.4);
}

// Todos medidos no Chrome, em midia de impressao, com a imagem real carregada.
const MEDIDO = {
  cabecalho: 61.6,      // logo 392x294 a 300px de largura + padding de 8px
  conteudo: 173.4,      // .qp-content da cotacao CO81BS14, com 2 itens
  paddingCorpo: 1.1,    // o que .qp-body soma alem de cabecalho + conteudo
  rodapeAntes: 45.5,    // padding 6mm/8mm + cartao + linha do CNPJ
  rodapeDepois: 38.5,   // padding 3mm/4mm
};

describe('o timbrado cabe em uma folha', () => {

  it('o logo continua com a altura de sempre — 300px de largura', () => {
    expect(alturaDoLogo(300)).toBeCloseTo(59.5, 0);
    // 59,5mm de imagem + 2,1mm de padding do cabecalho.
    expect(alturaDoLogo(300) + 2.1).toBeCloseTo(MEDIDO.cabecalho, 0);
  });

  it('o documento fica abaixo da altura útil da página, com folga', () => {
    const util = 297 - 10;                       // A4 menos a margem superior
    const doc = MEDIDO.cabecalho + MEDIDO.paddingCorpo
      + MEDIDO.conteudo + MEDIDO.rodapeDepois;
    expect(doc).toBeCloseTo(274.7, 0);           // bate com a medicao no Chrome
    expect(doc).toBeLessThan(util);
    // Folga para o cabeçalho/rodapé do proprio Chrome, que come ~10mm quando o
    // usuario imprime com essa opcao ligada — que era o caso.
    expect(util - doc).toBeGreaterThan(10);
  });

  it('com os valores antigos, não cabia — é o bug que foi corrigido', () => {
    const utilAntes = 297 - 16;
    const docAntes = MEDIDO.cabecalho + MEDIDO.paddingCorpo
      + MEDIDO.conteudo + MEDIDO.rodapeAntes;
    expect(docAntes).toBeCloseTo(281.7, 0);      // bate com a medicao no Chrome
    expect(docAntes).toBeGreaterThan(utilAntes);
    // Estourava por menos de um milimetro — dai so a ultima linha cair.
    expect(docAntes - utilAntes).toBeLessThan(1);
  });
});

describe('o CSS carrega esses valores', () => {
  it('margem superior da página em 10mm', () => {
    expect(fonte).toContain('@page{size:A4;margin:10mm 0 0 0}');
  });

  it('o logo NÃO foi reduzido: o timbrado continua o mesmo', () => {
    expect(fonte).toContain('max-width:300px');
    expect(fonte).toContain('.qp-header{text-align:center;padding-bottom:8px}');
  });

  it('rodapé com padding enxuto', () => {
    expect(fonte).toContain('padding:3mm 14mm 4mm');
  });

  it('rodapé indivisível', () => {
    // Sem isto o rodape se parte de novo assim que o conteudo crescer: o
    // cartao numa pagina e a linha do CNPJ na outra.
    expect(fonte).toMatch(/\.qp-footer\{[^}]*break-inside:avoid/);
  });
});
