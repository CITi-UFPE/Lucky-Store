/**
 * O campo de Observações não tem limite de caracteres — e não pode ganhar um
 * sem querer.
 *
 * A suspeita era de limite baixo. Não existe limite nenhum, em lugar nenhum:
 *
 *   - a coluna é `text` no Postgres, que não tem teto (verificado em
 *     information_schema: character_maximum_length é NULL, no pedido e na
 *     cotação);
 *   - o schema Pydantic é `Optional[str]`, sem max_length;
 *   - o campo da tela não tem maxLength.
 *
 * Medido contra Postgres real: 500.000 caracteres gravam e voltam inteiros, na
 * criação e na edição, com acentos e quebras de linha preservados. O mesmo vale
 * para a cotação.
 *
 * O que dava a sensação de "cheio" era a CAIXA: min-h-24 são 96px, umas quatro
 * linhas, e a partir daí o texto rolava dentro de uma janelinha. Ela passou a
 * ter min-h-48 (~192px, nove linhas) e resize-y, para o vendedor puxar mais
 * quando precisar.
 *
 * Este teste existe para o limite não aparecer por descuido: um `maxLength` no
 * campo cortaria o texto em silêncio, sem erro e sem aviso, e ninguém
 * perceberia até faltar informação num pedido.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

const TELAS = [
  ['pedido', 'components/OrderModal.tsx', 'Anotações sobre o pedido...'],
  ['cotação', 'components/QuoteModal.tsx', 'Anotações sobre a cotação...'],
] as const;

describe.each(TELAS)('Observações — %s', (_nome, arquivo, placeholder) => {
  const fonte = ler(arquivo);

  /** O trecho do textarea de observações, isolado pelo placeholder. */
  const campo = () => {
    const fim = fonte.indexOf(placeholder);
    expect(fim).toBeGreaterThan(-1);
    return fonte.slice(fonte.lastIndexOf('<Textarea', fim), fim);
  };

  it('não tem maxLength', () => {
    // Um maxLength cortaria o texto ao digitar, sem erro e sem aviso.
    expect(campo()).not.toContain('maxLength');
  });

  it('a caixa é alta o bastante para escrever', () => {
    expect(campo()).toContain('min-h-48');
    expect(campo()).not.toContain('min-h-24');
  });

  it('dá para aumentar a caixa arrastando', () => {
    expect(campo()).toContain('resize-y');
  });
});

describe('o valor vai inteiro para a API', () => {
  it('pedido: sem corte no payload', () => {
    const fonte = ler('components/OrderModal.tsx');
    expect(fonte).toContain('observacao: o.observations || null,');
    expect(fonte).not.toMatch(/observations[^\n]*\.slice\(/);
  });

  it('cotação: sem corte no payload', () => {
    const fonte = ler('components/QuoteModal.tsx');
    expect(fonte).toContain('observacao: q.observations || undefined,');
    expect(fonte).not.toMatch(/observations[^\n]*\.slice\(/);
  });
});
