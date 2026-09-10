/**
 * O contato do rodapé é o de quem assinou a cotação — em qualquer empresa.
 *
 * Este teste renderiza o timbrado DE VERDADE e lê o que saiu impresso, em vez
 * de procurar trechos no código-fonte. Os testes de fonte que eu vinha
 * escrevendo travam a implementação, mas não provam o resultado: dá para
 * mudar o `store` que alimenta o cartão e todos continuarem passando enquanto
 * o papel sai com o telefone errado.
 *
 * O histórico que justifica cada caso:
 *
 *  - A BTech já montava o cartão em HTML, mas escolhia o cadastro pelo NOME, e
 *    a lista vem de todas as lojas: imprimia o primeiro com aquele nome.
 *  - A Lucky Store não montava cartão nenhum. O rodapé dela era o
 *    `quote-footer.png`, com o nome, o telefone e o e-mail do Alcides
 *    DESENHADOS dentro. Toda cotação da Lucky saía com o contato dele, tivesse
 *    vendido quem tivesse — e nenhum código conseguia mudar, porque era imagem.
 *
 * Por isso a matriz é loja × vendedor, e não um caso feliz: o defeito das duas
 * empresas era o mesmo (contato que não acompanha quem vendeu) por dois
 * motivos diferentes.
 *
 * Cada empresa é conferida também pelo CNPJ, que continua sendo o dela — o
 * cartão passa a ser o mesmo componente nas duas, e é fácil um "unificar"
 * distraído levar junto o CNPJ.
 */
import { render, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { QuoteModal } from '@/components/QuoteModal';
import type { Quote } from '@/store/QuoteStore';
import { emptyPhases } from '@/store/QuoteStore';

vi.mock('@/api/hooks/useQuotes', () => ({
  useCreateQuote: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuote: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuotePhase: () => ({ mutate: vi.fn(), isPending: false }),
  useQuoteHistory: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/client', () => ({
  apiClient: { delete: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({ data: {} }) },
  getApiError: (e: unknown) => String(e),
}));

const ALCIDES = { id: 'v-alcides', nome: 'Alcides', email: 'alcides@luckystore.com.br', phone: '(81) 99989-6762', id_loja: 'l1' };
const LUCAS = { id: 'v-lucas', nome: 'Lucas', email: 'btechstore@outlook.com.br', phone: '(81) 98822-1093', id_loja: 'l1' };
const PEDRO = { id: 'v-pedro', nome: 'Pedro', email: 'contato@luckystore.com.br', phone: '(81) 98831-9875', id_loja: 'l1' };

vi.mock('@/hooks/useVendedores', () => ({
  useVendedores: () => ({
    data: { items: [
      { id: 'v-alcides', nome: 'Alcides', email: 'alcides@luckystore.com.br', phone: '(81) 99989-6762', id_loja: 'l1' },
      { id: 'v-lucas', nome: 'Lucas', email: 'btechstore@outlook.com.br', phone: '(81) 98822-1093', id_loja: 'l1' },
      { id: 'v-pedro', nome: 'Pedro', email: 'contato@luckystore.com.br', phone: '(81) 98831-9875', id_loja: 'l1' },
    ] },
    isLoading: false,
  }),
}));

const cotacao = (over: Partial<Quote>) => ({
  id: 'q', index: '82', createdAt: 1000000,
  customer: 'Ricardo Alves', cnpj: '18.402.771/0001-05',
  requestNumber: 'REQ-2291', requestDate: '2026-09-02',
  b2bCompany: 'Construtora Meridiano', directBilling: false, supplier: '',
  storeIndex: '14', value: 38072,
  items: [], directSupplyItems: [], observations: '',
  phases: emptyPhases(), taxLucky: 5, taxBTech: 3,
  ...over,
} as unknown as Quote);

/** O cartão de contato como ele fica no papel. */
function cartao(quote: Quote) {
  render(<QuoteModal open quote={quote} onClose={vi.fn()} onSave={vi.fn()} nextIndex={() => '82'} />);
  const raiz = document.getElementById('qm-print-root');
  const card = raiz?.querySelector('.qp-fcard');
  expect(card, 'a cotação saiu sem cartão de contato no rodapé').not.toBeNull();
  return {
    cnpj: card!.querySelector('.qp-fcard-cnpj')?.textContent ?? '',
    linhas: [...card!.querySelectorAll('.qp-fcard-linha')].map(e => e.textContent ?? ''),
    /** A linha de letra miúda embaixo do cartão. */
    rodapeTexto: raiz!.querySelector('.qp-footer-text')?.textContent ?? '',
  };
}

afterEach(cleanup);

const EMPRESAS = [
  ['Lucky Store', 'CNPJ 11.849.935/0001-63'],
  ['BTech', 'CNPJ 54.677.704/0001-22'],
] as const;

const VENDEDORES = [ALCIDES, LUCAS, PEDRO];

describe.each(EMPRESAS)('cotação da %s', (empresa, cnpjEsperado) => {
  describe.each(VENDEDORES)('assinada por $nome', (v) => {
    it('imprime o telefone e o e-mail DESSE vendedor', () => {
      const c = cartao(cotacao({ company: empresa, seller: v.nome, sellerId: v.id }));
      expect(c.linhas).toEqual([v.phone, `e-mail: ${v.email}`]);
    });

    it('imprime o CNPJ da empresa da cotação', () => {
      // As duas usam o mesmo cartão agora; o CNPJ é o que continua distinto.
      expect(cartao(cotacao({ company: empresa, seller: v.nome, sellerId: v.id })).cnpj)
        .toBe(cnpjEsperado);
    });

    it('a linha embaixo do cartão traz endereço e CEP, e nada de contato', () => {
      // Vale para as duas empresas e para os três: a linha é a mesma em toda
      // cotação, e repetir telefone e e-mail ali dava ao cliente um contato
      // fixo brigando com o do vendedor logo acima.
      const c = cartao(cotacao({ company: empresa, seller: v.nome, sellerId: v.id }));
      expect(c.rodapeTexto).toContain('Rua Marechal Deodoro Nr 300 SL 1107');
      expect(c.rodapeTexto).toContain('CEP: 52030-172');
      expect(c.rodapeTexto).not.toContain('Fone');
      expect(c.rodapeTexto).not.toContain('e-mail');
      expect(c.rodapeTexto).not.toContain('@');
      // E nem o telefone de nenhum dos três, por qualquer caminho.
      for (const outro of VENDEDORES) expect(c.rodapeTexto).not.toContain(outro.phone);
    });

    it('funciona na cotação nova, que ainda não tem id de vendedor', () => {
      // O vendedor imprime para conferir antes de salvar. Aí só existe o nome,
      // e a busca cai no fallback — que também precisa achar a pessoa certa.
      const c = cartao(cotacao({ company: empresa, seller: v.nome, sellerId: undefined }));
      expect(c.linhas).toEqual([v.phone, `e-mail: ${v.email}`]);
    });
  });
});

describe('empresa que o front não reconhece', () => {
  /**
   * `company` chega vazio quando a loja não é reconhecida — LOJA_BY_ID vem das
   * variáveis VITE_*_ID, e faltando uma, a cotação daquela loja perde o nome
   * pelo caminho. Aí `STORE_INFO[form.company]` não acha nada e cai no default.
   *
   * O default imprimia `/quote-footer.png`, o rodapé da Lucky Store com o
   * contato do Alcides desenhado dentro. Isso escondia o problema duas vezes:
   * uma cotação da Lucky que caísse aqui saía IDÊNTICA a uma correta — mesma
   * logo, mesmo rodapé, mesmo CNPJ —, e uma cotação de qualquer outra empresa
   * saía com o contato do Alcides no pé.
   */
  it('ainda imprime o contato de quem assinou', () => {
    const c = cartao(cotacao({ company: '' as never, seller: 'Pedro', sellerId: PEDRO.id }));
    expect(c.linhas).toEqual([PEDRO.phone, `e-mail: ${PEDRO.email}`]);
  });

  it('não imprime o contato do Alcides por descuido', () => {
    const c = cartao(cotacao({ company: 'Empresa Nova' as never, seller: 'Lucas', sellerId: LUCAS.id }));
    expect(c.linhas.join(' ')).not.toContain(ALCIDES.phone);
    expect(c.linhas.join(' ')).not.toContain(ALCIDES.email);
  });
});

describe('o contato não é fixo em lugar nenhum', () => {
  it('trocar o vendedor troca o que sai impresso', () => {
    // O teste que pega o defeito original: com o rodapé em imagem, estas duas
    // cotações saíam idênticas no pé — as duas com o contato do Alcides.
    const doLucas = cartao(cotacao({ company: 'Lucky Store', seller: 'Lucas', sellerId: LUCAS.id }));
    cleanup();
    const doPedro = cartao(cotacao({ company: 'Lucky Store', seller: 'Pedro', sellerId: PEDRO.id }));
    expect(doLucas.linhas).not.toEqual(doPedro.linhas);
    expect(doLucas.linhas[0]).toBe(LUCAS.phone);
    expect(doPedro.linhas[0]).toBe(PEDRO.phone);
  });

  it('nenhuma cotação imprime o contato do Alcides sem ser dele', () => {
    for (const empresa of ['Lucky Store', 'BTech'] as const) {
      for (const v of [LUCAS, PEDRO]) {
        const c = cartao(cotacao({ company: empresa, seller: v.nome, sellerId: v.id }));
        expect(c.linhas.join(' ')).not.toContain(ALCIDES.phone);
        cleanup();
      }
    }
  });
});
