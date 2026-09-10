/**
 * O rodapé da cotação da Lucky Store agora segue o vendedor.
 *
 * `quote-footer.png` não é uma faixa decorativa: ela tem o nome, o telefone e o
 * e-mail do Alcides DESENHADOS dentro da imagem. Como era imagem, nenhum código
 * conseguia mudar aquilo — toda cotação da Lucky Store saía com o contato dele,
 * tivesse vendido o Lucas, o Pedro ou ele. O cliente recebia o papel e ligava
 * para a pessoa errada.
 *
 * Era o último pedaço em aberto de "o contato do timbrado deve depender do
 * vendedor escolhido". A BTech já usava o cartão em HTML; a Lucky ficou para
 * trás porque o problema dela estava escondido dentro de um PNG.
 *
 * Agora ela usa o mesmo cartão, e o contato vem do vendedor que assinou aquela
 * cotação. Medido no Chromium, com as imagens servidas por HTTP (caminho
 * absoluto não resolve em file://) e mídia de impressão:
 *
 *   cotação típica    antes 260,5mm (1 página)  →  depois 256,1mm (1 página)
 *   cotação carregada antes 292,0mm (2 páginas) →  depois 287,6mm (2 páginas)
 *
 * O cartão é 4,4mm MAIS BAIXO que a imagem. Nenhuma cotação que cabia numa
 * página deixou de caber — o documento só ganhou folga.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fonte = readFileSync(
  resolve(__dirname, '..', 'components/QuoteModal.tsx'), 'utf-8',
);

/** O bloco de uma loja em STORE_INFO, contando chaves por causa do objeto
 *  `rodape` aninhado. */
const bloco = (loja: string) => {
  const i = fonte.indexOf(`'${loja}': {`);
  expect(i).toBeGreaterThan(-1);
  let n = 0;
  for (let j = fonte.indexOf('{', i); j < fonte.length; j++) {
    if (fonte[j] === '{') n++;
    else if (fonte[j] === '}' && --n === 0) return fonte.slice(i, j + 1);
  }
  throw new Error(`bloco de ${loja} sem fechamento`);
};

/** Sem comentários: eles citam 'quote-footer.png' ao explicar por que ele saiu,
 *  e um teste de ausência falharia por causa da prosa. */
const codigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('Lucky Store', () => {
  const lucky = bloco('Lucky Store');

  it('não usa mais o rodapé em imagem', () => {
    // Enquanto esta imagem estiver aqui, o contato do Alcides volta a sair em
    // toda cotação da Lucky, e nenhum código consegue impedir.
    expect(codigo(lucky)).not.toContain('/quote-footer.png');
  });

  it('usa o cartão de contato, que lê o vendedor da cotação', () => {
    expect(lucky).toContain('footerCard: true');
  });

  it('mantém a logo própria e o CNPJ próprio', () => {
    expect(lucky).toContain("header: '/quote-header.png'");
    expect(lucky).toContain("cnpj: '11.849.935/0001-63'");
  });

  it('dá largura própria à logo dentro do cartão', () => {
    // O padrão (58px) foi medido na logo da BTech, quase quadrada. A da Lucky é
    // uma faixa larga e baixa: nos mesmos 58px o "Informática" some.
    expect(lucky).toContain('footerLogoWidth: 96');
  });
});

describe('o cartão continua lendo o vendedor certo', () => {
  it('o telefone e o e-mail vêm do vendedor, não da loja', () => {
    // Se um dia isto virar `store.rodape.email`, o cartão volta a imprimir um
    // contato fixo — o mesmo defeito da imagem, só que em HTML.
    expect(fonte).toContain('{vendedor?.phone && <div className="qp-fcard-linha">{vendedor.phone}</div>}');
    expect(fonte).toContain('{vendedor?.email && <div className="qp-fcard-linha">e-mail: {vendedor.email}</div>}');
  });

  it('o vendedor sai do id gravado na cotação', () => {
    expect(fonte).toContain('form.sellerId ? vendedores.find(v => v.id === form.sellerId)');
  });

  it('a largura só se aplica a quem pediu', () => {
    // Sem o condicional, quem não define footerLogoWidth receberia width:
    // undefined inline e perderia os 58px do CSS.
    expect(fonte).toContain('store.footerLogoWidth ? { width: store.footerLogoWidth } : undefined');
  });
});

describe('a BTech não foi afetada', () => {
  const btech = bloco('BTech');

  it('continua com a arte e o CNPJ dela', () => {
    expect(btech).toContain("header: '/btech-header.jpeg'");
    expect(btech).toContain("cnpj: '54.677.704/0001-22'");
    expect(btech).toContain('footerCard: true');
  });

  it('não ganhou largura de logo, então fica nos 58px de sempre', () => {
    expect(btech).not.toContain('footerLogoWidth');
  });
});

describe('a reserva de espaço do rodapé', () => {
  it('continua contando o cartão', () => {
    // `min-height` de .qp-body é o que empurra o rodapé para o pé da folha numa
    // cotação curta. A Lucky trocou `footer` por `footerCard`: se a conta
    // olhasse só para `footer`, ela cairia na reserva de quem não tem rodapé
    // (252mm) e o documento estouraria para duas páginas.
    expect(fonte).toContain("(store.footer || store.footerCard) ? '212mm' : '252mm'");
  });
});
