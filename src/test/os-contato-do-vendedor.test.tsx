/**
 * O pé da OS traz o contato de quem assinou.
 *
 * O rodapé da Ordem de Serviço era UMA STRING FIXA por loja:
 *
 *   CNPJ 11.849.935/0001-63 · Rua Marechal Deodoro ... · CEP 52030-172
 *   · Fone/Fax +55 81 3228.8509 · contato@luckystore.com.br
 *
 * Toda OS saía com o mesmo telefone e o mesmo e-mail, tivesse sido feita pelo
 * Alcides, pelo Lucas ou pelo Pedro. O cliente recebia a OS e ligava para um
 * número genérico em vez de falar com quem atendeu.
 *
 * É o mesmo defeito que a cotação tinha — lá o contato do Alcides estava
 * desenhado dentro do PNG do rodapé — mas aqui era pior de perceber: na OS não
 * existia cartão de contato nenhum, então não havia o que comparar. Só olhando
 * o texto dava para ver que aquele telefone nunca mudava.
 *
 * Agora CNPJ e endereço vêm da loja, telefone e e-mail vêm do vendedor.
 *
 * Este teste renderiza a OS de verdade e lê o que saiu impresso, em vez de
 * procurar trechos no código: é o resultado que importa, e foi o resultado que
 * estava errado por meses sem ninguém notar.
 */
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { OrderModal } from '@/components/OrderModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/client', () => ({
  apiClient: { delete: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({ data: {} }) },
  getApiError: (e: unknown) => String(e),
}));
vi.mock('@/hooks/useVendedores', () => ({
  useVendedores: () => ({ data: { items: [
    { id: 'v-alcides', nome: 'Alcides', email: 'alcides@luckystore.com.br', phone: '(81) 99989-6762', id_loja: 'l1' },
    { id: 'v-lucas', nome: 'Lucas', email: 'btechstore@outlook.com.br', phone: '(81) 98822-1093', id_loja: 'l1' },
    { id: 'v-pedro', nome: 'Pedro', email: 'contato@luckystore.com.br', phone: '(81) 98831-9875', id_loja: 'l1' },
  ] }, isLoading: false }),
}));
vi.mock('@/hooks/useOrderHistory', () => ({ useOrderHistory: () => ({ data: undefined, isLoading: false }) }));

const ALCIDES = { nome: 'Alcides', phone: '(81) 99989-6762', email: 'alcides@luckystore.com.br' };
const LUCAS = { nome: 'Lucas', phone: '(81) 98822-1093', email: 'btechstore@outlook.com.br' };
const PEDRO = { nome: 'Pedro', phone: '(81) 98831-9875', email: 'contato@luckystore.com.br' };

/** O texto do pé da OS, como sai no papel. */
function rodape(empresa: string, seller: string): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OrderModal
        open
        order={{ id: 'o1', os: '13', company: empresa, seller,
                 customer: 'Ricardo Alves', cnpj: '18.402.771/0001-05',
                 salesValue: 38072, items: [], status: 'To Buy',
                 createdAt: 1000000, deliveryDate: '2026-09-30' } as never}
        onClose={vi.fn()} onSave={vi.fn()} nextOS={() => '13'}
      />
    </QueryClientProvider>,
  );
  const pe = document.getElementById('opm-print-root')?.querySelector('.op-foot');
  expect(pe, 'a OS saiu sem o rodapé de identificação').not.toBeNull();
  return pe!.textContent ?? '';
}

afterEach(cleanup);

const EMPRESAS = [
  ['Lucky Store', '11.849.935/0001-63'],
  ['BTech', '54.677.704/0001-22'],
] as const;

describe.each(EMPRESAS)('OS da %s', (empresa, cnpj) => {
  describe.each([ALCIDES, LUCAS, PEDRO])('assinada por $nome', (v) => {
    it('traz o telefone e o e-mail DESSE vendedor', () => {
      const texto = rodape(empresa, v.nome);
      expect(texto).toContain(v.phone);
      expect(texto).toContain(v.email);
    });

    it('traz o CNPJ da empresa da OS', () => {
      expect(rodape(empresa, v.nome)).toContain(`CNPJ ${cnpj}`);
    });

    it('não traz mais o telefone fixo que valia para todo mundo', () => {
      // Era este o defeito: o mesmo número em toda OS, de qualquer vendedor.
      expect(rodape(empresa, v.nome)).not.toContain('3228.8509');
    });
  });
});

describe('o contato não é fixo', () => {
  it('trocar o vendedor troca o que sai impresso', () => {
    // Antes estes dois saíam com o pé idêntico.
    const doLucas = rodape('Lucky Store', 'Lucas');
    cleanup();
    const doPedro = rodape('Lucky Store', 'Pedro');
    expect(doLucas).not.toBe(doPedro);
    expect(doLucas).toContain(LUCAS.phone);
    expect(doPedro).toContain(PEDRO.phone);
  });

  it('nenhuma OS de outro vendedor leva o contato do Alcides', () => {
    for (const empresa of ['Lucky Store', 'BTech']) {
      for (const v of [LUCAS, PEDRO]) {
        expect(rodape(empresa, v.nome)).not.toContain(ALCIDES.phone);
        cleanup();
      }
    }
  });
});

describe('vendedor sem cadastro legível', () => {
  it('cai no e-mail da empresa em vez de deixar a OS sem contato', () => {
    // Pedido antigo, vendedor renomeado ou removido: melhor um contato da
    // empresa do que um documento que não diz como falar com ninguém.
    const texto = rodape('BTech', 'Fantasma');
    expect(texto).toContain('btechstore@outlook.com.br');
    expect(texto).toContain('CNPJ 54.677.704/0001-22');
  });

  it('e não inventa telefone nenhum', () => {
    // Melhor sem telefone do que com o número de outra pessoa.
    const texto = rodape('BTech', 'Fantasma');
    for (const v of [ALCIDES, LUCAS, PEDRO]) expect(texto).not.toContain(v.phone);
  });
});
