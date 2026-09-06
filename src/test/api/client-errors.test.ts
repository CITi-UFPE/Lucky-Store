/**
 * Regressão: o usuário nunca deve ver o erro cru do Pydantic na tela.
 *
 * `getApiError` fazia JSON.stringify no `detail`. Num 422 do FastAPI esse campo
 * é uma LISTA de objetos de validação, então o vendedor via 'uuid_parsing',
 * 'loc' e 'ctx' despejados na tela depois de preencher o formulário inteiro.
 */
import { describe, it, expect } from 'vitest';
import { getApiError } from '@/api/client';

/** Monta um erro no formato que o axios entrega ao catch. */
function erroAxios(status: number, data: unknown) {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    config: {},
    response: { status, data },
    toJSON: () => ({}),
  });
}

function erroDeRede() {
  return Object.assign(new Error('Network Error'), {
    isAxiosError: true,
    config: {},
    toJSON: () => ({}),
  });
}

describe('getApiError — 422 de validação', () => {
  it('traduz campos obrigatórios em branco para o nome que aparece na tela', () => {
    // Payload real do FastAPI quando Empresa e Vendedor vão vazios e o '' não
    // faz parse como UUID.
    const msg = getApiError(erroAxios(422, {
      detail: [
        { type: 'uuid_parsing', loc: ['body', 'id_loja'], msg: 'Input should be a valid UUID', input: '', ctx: { error: 'invalid length' } },
        { type: 'uuid_parsing', loc: ['body', 'id_vendedor'], msg: 'Input should be a valid UUID', input: '', ctx: { error: 'invalid length' } },
      ],
    }));
    expect(msg).toBe('Empresa é obrigatório. Vendedor é obrigatório.');
  });

  it('não vaza nenhum termo técnico do Pydantic', () => {
    const msg = getApiError(erroAxios(422, {
      detail: [{ type: 'uuid_parsing', loc: ['body', 'id_loja'], msg: 'x', ctx: { error: 'y' } }],
    }));
    for (const termo of ['uuid_parsing', 'loc', 'ctx', 'body', '{', '[']) {
      expect(msg).not.toContain(termo);
    }
  });

  it('entende o campo ausente (type: missing)', () => {
    // nome_cliente passou a ser a EMPRESA; o contato ganhou campo proprio.
    expect(getApiError(erroAxios(422, {
      detail: [{ type: 'missing', loc: ['body', 'nome_cliente'], msg: 'Field required' }],
    }))).toBe('Empresa do cliente é obrigatório.');
  });

  it('distingue a empresa da pessoa de contato', () => {
    expect(getApiError(erroAxios(422, {
      detail: [{ type: 'missing', loc: ['body', 'contato_cliente'], msg: 'Field required' }],
    }))).toBe('Cliente é obrigatório.');
  });

  it('mantém a mensagem do servidor quando ela não é sobre campo em branco', () => {
    expect(getApiError(erroAxios(422, {
      detail: [{ type: 'greater_than', loc: ['body', 'valor_venda'], msg: 'Input should be greater than 0' }],
    }))).toBe('Valor de Venda: Input should be greater than 0');
  });

  it('usa o nome cru do campo quando não há rótulo mapeado', () => {
    expect(getApiError(erroAxios(422, {
      detail: [{ type: 'missing', loc: ['body', 'campo_novo'], msg: 'Field required' }],
    }))).toBe('campo_novo é obrigatório.');
  });

  it('não repete a mesma mensagem duas vezes', () => {
    expect(getApiError(erroAxios(422, {
      detail: [
        { type: 'missing', loc: ['body', 'id_loja'], msg: 'Field required' },
        { type: 'missing', loc: ['body', 'id_loja'], msg: 'Field required' },
      ],
    }))).toBe('Empresa é obrigatório.');
  });
});

describe('getApiError — demais formatos', () => {
  it('repassa detail string, que já vem escrito para o usuário', () => {
    expect(getApiError(erroAxios(400, { detail: 'Cotação já foi convertida no pedido OS-007' })))
      .toBe('Cotação já foi convertida no pedido OS-007');
  });

  it('distingue falha de rede de erro do servidor', () => {
    expect(getApiError(erroDeRede())).toMatch(/conex/i);
  });

  it('dá uma frase honesta no 500 em vez de "undefined"', () => {
    const msg = getApiError(erroAxios(500, {}));
    expect(msg).toMatch(/servidor/i);
    expect(msg).not.toMatch(/undefined|\[object/);
  });

  it('não despeja JSON quando o detail vem num formato inesperado', () => {
    const msg = getApiError(erroAxios(409, { detail: { foo: 'bar' } }));
    expect(msg).not.toContain('{');
    expect(msg).not.toContain('foo');
  });

  it('lida com erro que nem é do axios', () => {
    expect(getApiError(new Error('boom'))).toBe('Erro desconhecido. Tente novamente.');
  });
});
