/**
 * O rodapé do timbrado da cotação saía duas vezes, e o cartão de contato
 * escolhia o vendedor pelo nome.
 *
 * 1. O CARTÃO escolhia o cadastro pelo NOME.
 *
 *    A rota /vendedores devolve todas as lojas de uma vez e o mesmo nome pode
 *    existir em mais de uma (a unicidade no banco é por (id_loja, nome)).
 *    Escolher pelo nome pega o primeiro da lista, de qualquer loja.
 *
 *    Agora a busca é pelo ID que a própria cotação guarda (`sellerId`) — é ele
 *    que identifica o cadastro. O nome, com preferência pela loja da cotação,
 *    fica para a cotação nova, ainda não salva, que ainda não tem id.
 *
 *    (O telefone errado que apareceu no PDF de CO81BS14 NÃO era isto: o
 *    cadastro escolhido era o certo — o e-mail confirma —, o valor da coluna
 *    `phone` é que estava errado no banco. Isso é dado, não código.)
 *
 * 2. O RODAPÉ SAÍA DUAS VEZES.
 *
 *    Ele morava num <tfoot>, que o navegador repete no fim de CADA página. Numa
 *    cotação de duas páginas o cartão de contato aparecia nas duas — e na
 *    segunda nem no pé da folha ficava, flutuava logo abaixo do texto curto.
 *    Agora vem depois do conteúdo, uma vez só. Em cotação de uma página quem o
 *    empurra para o pé continua sendo o min-height de .qp-body.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Vendedor { id: string; nome: string; id_loja: string; phone: string | null }

const LOJAS: Record<string, string> = { 'Lucky Store': 'loja-lucky', 'BTech': 'loja-btech' };

// Espelha a escolha do vendedor em QuotePrintTemplate.
function vendedorDoCartao(
  lista: Vendedor[],
  form: { sellerId?: string; seller?: string; company?: string },
) {
  const idLoja = form.company ? LOJAS[form.company] : undefined;
  const porNome =
    (idLoja ? lista.find(v => v.nome === form.seller && v.id_loja === idLoja) : undefined)
    ?? lista.find(v => v.nome === form.seller);
  return (form.sellerId ? lista.find(v => v.id === form.sellerId) : undefined) ?? porNome;
}

const ALCIDES_LUCKY = { id: 'a-lucky', nome: 'Alcides', id_loja: 'loja-lucky', phone: '(85) 99111-0001' };
const ALCIDES_BTECH = { id: 'a-btech', nome: 'Alcides', id_loja: 'loja-btech', phone: '(81) 99989-6762' };

describe('cartão de contato do timbrado', () => {
  it('usa o id da cotação, não o nome', () => {
    const v = vendedorDoCartao([ALCIDES_LUCKY, ALCIDES_BTECH], {
      sellerId: 'a-btech', seller: 'Alcides', company: 'BTech',
    });
    expect(v?.phone).toBe('(81) 99989-6762');
  });

  it('o id manda mesmo quando ele vem primeiro na lista por outra loja', () => {
    // A rota devolve tudo ordenado por nome; o da Lucky vinha primeiro e era
    // ele que aparecia no papel da BTech.
    const v = vendedorDoCartao([ALCIDES_LUCKY, ALCIDES_BTECH], { sellerId: 'a-btech' });
    expect(v?.id).toBe('a-btech');
  });

  it('cotação nova, ainda sem id, casa por nome dentro da loja', () => {
    const v = vendedorDoCartao([ALCIDES_LUCKY, ALCIDES_BTECH], {
      seller: 'Alcides', company: 'BTech',
    });
    expect(v?.id).toBe('a-btech');
  });

  it('vendedor sem cadastro naquela loja cai no cadastro que existe', () => {
    // As empresas do grupo compartilham contato — a cotação da BTech sai
    // legitimamente com o e-mail @luckystore.com.br. Sem este fallback o
    // cartão sairia sem telefone nem e-mail nenhum.
    const v = vendedorDoCartao([ALCIDES_LUCKY], { seller: 'Alcides', company: 'BTech' });
    expect(v?.id).toBe('a-lucky');
  });

  it('nome desconhecido não inventa cadastro', () => {
    expect(vendedorDoCartao([ALCIDES_LUCKY], { seller: 'Fulano', company: 'BTech' })).toBeUndefined();
  });
});

describe('o timbrado usa essas regras', () => {
  const fonte = readFileSync(resolve(__dirname, '..', 'components/QuoteModal.tsx'), 'utf-8');

  it('procura o vendedor pelo id da cotação', () => {
    expect(fonte).toContain('form.sellerId ? vendedores.find(v => v.id === form.sellerId)');
  });

  it('a busca por nome prefere a loja da cotação', () => {
    expect(fonte).toContain("vendedores.find(v => v.nome === nome && v.id_loja === idLoja)");
  });

  it('o rodapé não está mais num tfoot', () => {
    // O tfoot é justamente o que faz o navegador repetir por página. Casa pela
    // tag de fechamento: a de abertura também aparece no comentário que explica
    // por que ela saiu, e o teste passaria a falhar por causa da prosa.
    expect(fonte).not.toContain('</tfoot>');
    expect(fonte).not.toContain('display:table-footer-group');
  });

  it('o rodapé aparece uma única vez no documento', () => {
    const ocorrencias = fonte.split('<div className="qp-footer">').length - 1;
    expect(ocorrencias).toBe(1);
  });

  it('a reserva de espaço que empurra o rodapé para o pé da folha continua', () => {
    // É o que mantém o rodapé no fim da página numa cotação de uma folha.
    expect(fonte).toContain('.qp-body{min-height:');
  });
});

describe('Sales.tsx entrega o id do vendedor', () => {
  it('cotacaoToQuote passa o id_vendedor adiante', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'pages/Sales.tsx'), 'utf-8');
    expect(fonte).toContain('sellerId: c.id_vendedor,');
  });
});
