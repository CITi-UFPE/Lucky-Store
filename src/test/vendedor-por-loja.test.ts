/**
 * O vendedor tem um cadastro POR LOJA, e casar so pelo nome pegava o errado.
 *
 * A rota /vendedores devolve os vendedores de todas as lojas de uma vez, sem
 * filtro, ordenados por nome. No banco a unicidade e por (id_loja, nome) — ou
 * seja, "Alcides" existe uma vez em cada empresa, cada um com seu proprio
 * telefone e e-mail.
 *
 * A tela fazia:
 *
 *     vendedores.find(v => v.nome === form.seller)
 *
 * que devolve o PRIMEIRO com aquele nome, de qualquer loja. Dois efeitos:
 *
 *  1. O cartao de contato no rodape da cotacao da BTech imprimia o telefone do
 *     cadastro de outra empresa — numero errado no timbrado que vai para o
 *     cliente.
 *  2. Pior, e silencioso: id_vendedor era resolvido pelo mesmo caminho na hora
 *     de salvar. Um pedido da BTech podia ser gravado no Alcides da Lucky
 *     Store, e o backend aceita — validar_loja_e_vendedor confere que a loja
 *     existe e que o vendedor existe, mas nao que um pertence a outra. Dali em
 *     diante o pedido conta para o vendedor da empresa errada em todo o
 *     dashboard.
 *
 * A regra agora: procura dentro da loja escolhida; so cai no nome solto se o
 * vendedor nao estiver cadastrado nela, para nao travar quem ja usa o sistema.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Vendedor { id: string; nome: string; id_loja: string; phone: string | null }

const LOJAS = { 'Lucky Store': 'loja-lucky', 'BTech': 'loja-btech' } as Record<string, string>;

// Espelha vendorIdByName(), usado para RESOLVER O ID AO SALVAR — nos dois
// modais. Aqui o fallback pelo nome solto existe de proposito: sem id o payload
// iria com id_vendedor vazio e o backend responderia 422, perdendo o
// formulario inteiro.
//
// O cartao de contato do timbrado NAO usa esta regra: la o fallback imprimia o
// telefone de outra empresa, e a versao estrita esta em
// cotacao-rodape-vendedor.test.ts.
function vendedorDaLoja(lista: Vendedor[], nome: string, empresa?: string) {
  const idLoja = empresa ? LOJAS[empresa] : undefined;
  return (
    (idLoja ? lista.find(v => v.nome === nome && v.id_loja === idLoja) : undefined)
    ?? lista.find(v => v.nome === nome)
  );
}

// Ordenada por nome, como a rota devolve — o Alcides da Lucky vem primeiro.
const VENDEDORES: Vendedor[] = [
  { id: 'a-lucky', nome: 'Alcides', id_loja: 'loja-lucky', phone: '(85) 90000-0000' },
  { id: 'a-btech', nome: 'Alcides', id_loja: 'loja-btech', phone: '(81) 99989-6762' },
  { id: 'l-lucky', nome: 'Lucas',   id_loja: 'loja-lucky', phone: '(81) 98888-0000' },
];

describe('escolha do vendedor pelo nome + loja', () => {
  it('cotacao da BTech pega o cadastro da BTech, nao o primeiro da lista', () => {
    const v = vendedorDaLoja(VENDEDORES, 'Alcides', 'BTech');
    expect(v?.id).toBe('a-btech');
    expect(v?.phone).toBe('(81) 99989-6762');
  });

  it('cotacao da Lucky Store pega o cadastro da Lucky Store', () => {
    expect(vendedorDaLoja(VENDEDORES, 'Alcides', 'Lucky Store')?.id).toBe('a-lucky');
  });

  it('sem empresa escolhida, cai no primeiro com aquele nome', () => {
    // Estado transitorio do formulario: o vendedor ja foi escolhido e a
    // empresa nao. Melhor devolver algo do que nada.
    expect(vendedorDaLoja(VENDEDORES, 'Alcides')?.id).toBe('a-lucky');
  });

  it('vendedor nao cadastrado naquela loja cai no nome, e nao vira vazio', () => {
    // Sem este fallback, salvar iria com id_vendedor em branco e o backend
    // responderia 422 — o formulario inteiro perdido por um cadastro faltando.
    expect(vendedorDaLoja(VENDEDORES, 'Lucas', 'BTech')?.id).toBe('l-lucky');
  });

  it('nome desconhecido nao inventa vendedor', () => {
    expect(vendedorDaLoja(VENDEDORES, 'Fulano', 'BTech')).toBeUndefined();
  });
});

describe('as telas usam a regra', () => {
  const ler = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

  it('QuoteModal: o cartao do rodape nao casa pelo nome solto', () => {
    // Casar pelo nome era o bug original; casar por nome+loja com fallback
    // ainda imprimia o contato de outra empresa quando o vendedor nao tem
    // cadastro naquela loja. Hoje o cartao vai pelo id — ver
    // cotacao-rodape-vendedor.test.ts.
    expect(ler('components/QuoteModal.tsx'))
      .not.toContain('vendedores.find(v => v.nome === form.seller)');
  });

  it('QuoteModal: id_vendedor sai da loja da cotacao', () => {
    expect(ler('components/QuoteModal.tsx')).toContain(
      "id_vendedor: vendorIdByName(q.seller ?? '', q.company),"
    );
  });

  it('OrderModal: id_vendedor sai da loja do pedido', () => {
    const fonte = ler('components/OrderModal.tsx');
    expect(fonte).toContain("id_vendedor: vendorIdByName(o.seller ?? '', o.company),");
    expect(fonte).toContain("vendorIdByName((o.seller as string) ?? '', o.company)");
  });
});
