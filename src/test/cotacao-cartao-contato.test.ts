/**
 * O cartão de contato do rodapé passa a identificar a EMPRESA pelo CNPJ, e não
 * o vendedor pelo nome.
 *
 * Antes:                          Agora:
 *   [logo]  Alcides                 [logo]  CNPJ 54.677.704/0001-22
 *           (81) 99989-6762                 (81) 99989-6762
 *           e-mail: alcides@...             e-mail: alcides@...
 *   VENDAS, LOCAÇÕES E SERVIÇOS     VENDAS, LOCAÇÕES E SERVIÇOS
 *
 * O layout não mudou: telefone e e-mail continuam empilhados abaixo da primeira
 * linha, no mesmo lugar. Só a primeira linha trocou de conteúdo.
 *
 * O nome do vendedor não se perde do documento — ele continua na linha de
 * assinatura, logo acima do cartão.
 *
 * E o CNPJ saiu da linha de texto do rodapé, que começava com
 * "CNPJ 54.677.704/0001-22 Rua Marechal Deodoro...". Sem isso ele apareceria
 * duas vezes no mesmo rodapé, a dois centímetros um do outro. A linha continua
 * com endereço, fone/fax e e-mail da empresa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fonte = readFileSync(
  resolve(__dirname, '..', 'components/QuoteModal.tsx'), 'utf-8',
);

describe('cartão de contato do rodapé', () => {
  it('a primeira linha é o CNPJ da empresa', () => {
    expect(fonte).toContain('<div className="qp-fcard-cnpj">CNPJ {store.rodape.cnpj}</div>');
  });

  it('não mostra mais o nome do vendedor', () => {
    expect(fonte).not.toContain('{vendedor?.nome || sellerName}');
  });

  it('telefone e e-mail continuam embaixo, na mesma ordem', () => {
    expect(fonte).toMatch(
      /qp-fcard-cnpj">CNPJ \{store\.rodape\.cnpj\}<\/div>\s*\n\s*\{vendedor\?\.phone &&[^\n]*\n\s*\{vendedor\?\.email &&/
    );
  });

  it('cada linha só aparece se estiver preenchida', () => {
    // Vendedor sem telefone cadastrado nao deixa uma linha vazia no cartao.
    expect(fonte).toContain('{vendedor?.phone && <div className="qp-fcard-linha">{vendedor.phone}</div>}');
    expect(fonte).toContain('{vendedor?.email && <div className="qp-fcard-linha">e-mail: {vendedor.email}</div>}');
  });

  it('o CNPJ não vai em negrito', () => {
    // A classe carregava font-weight:700 de quando mostrava o nome do vendedor.
    expect(fonte).toContain('.qp-fcard-cnpj{font-size:12.5px;font-weight:400;');
    expect(fonte).not.toContain('.qp-fcard-nome{');
  });

  it('a faixa azul continua a mesma', () => {
    expect(fonte).toContain('<div className="qp-fcard-bar">Vendas, Locações e Serviços</div>');
  });
});

describe('a linha de texto do rodapé', () => {
  it('não repete o CNPJ que subiu para o cartão', () => {
    expect(fonte).not.toContain('CNPJ ${store.rodape.cnpj} ${store.rodape.endereco}');
  });

  it('mantém endereço e CEP', () => {
    expect(fonte).toContain('<p className="qp-footer-text">{store.rodape.endereco}</p>');
    expect(fonte).toContain('CEP: 52030-172');
  });

  it('não repete telefone nem e-mail, que já estão no cartão', () => {
    // O cartão logo acima traz os dois, e lá são os do VENDEDOR que assinou.
    // Repetir um telefone fixo e um e-mail genérico embaixo dava ao cliente
    // dois contatos para o mesmo documento, sem dizer para qual ligar.
    expect(fonte).not.toContain('e-mail: ${store.rodape.email}');
    expect(fonte).not.toContain('Fone/Fax');
  });
});

describe('o nome do vendedor não se perde do documento', () => {
  it('continua na linha de assinatura', () => {
    expect(fonte).toContain('<span className="qp-sign-name">{sellerName}</span>');
  });
});
