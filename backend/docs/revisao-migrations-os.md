# Revisão das migrations locais da OS

Revisão de 11/09/2026. Nenhuma migration foi aplicada ao banco da aplicação.

## Escopo e resultado

| Revisão | Situação local | Resultado da revisão |
| --- | --- | --- |
| `c0a1b2c3d4e5` | Migration antiga editada | Mantido o upgrade que tolera a coluna `cotacoes.numero` existente e só numera registros sem número. Testado com o outro ramo nas duas ordens, preservando números existentes. |
| `c1d2e3f4a5b6` | Migration antiga editada | Mantido o upgrade com `IF NOT EXISTS` para evitar colisões nas colunas de pagamento. |
| `d4e5f6a7b8c9` | Migration antiga editada | Mantido o upgrade com `IF NOT EXISTS`. Os dois ramos foram executados nas duas ordens com datas e parcelas preenchidas, sem alterar esses dados. |
| `f1e2d3c4b5a6` | Migration nova, ainda local | Corrigido o preenchimento de `produtos.valor_venda`: só copia preços de correspondências únicas na cotação de origem, considerando descrição, quantidade e tipo de fornecimento. |

Não foram criadas outras migrations nem alterados os identificadores ou os vínculos entre revisões. O histórico possui 37 revisões e uma única revisão final. Migrations antigas já aplicadas não são reexecutadas simplesmente porque seus arquivos foram editados.

## Preservação dos dados

A migration de preço mantém custos de compra e custos projetados. Também mantém qualquer `valor_venda` já registrado, inclusive zero. Um item sem cotação de origem, sem correspondência, sem preço ou com correspondências ambíguas permanece sem preço; esses casos exigem revisão manual. Não se deduz preço de venda a partir do custo.

As verificações cobrem o caminho de **upgrade**. `downgrade` não é uma forma segura de desfazer um deploy com dados novos: há remoção de colunas, inclusive `valor_venda`. Os testes isolados não substituem a verificação da revisão instalada, backup restaurável e ensaio numa cópia do banco real antes da publicação. O projeto executa `upgrade head` automaticamente na inicialização do backend; se uma migration falhar, essa inicialização é interrompida.

## Correções na importação e impressão

- Transferência do número da cotação, previsão de entrega, forma e detalhes de pagamento, garantia e observações para o documento antes do primeiro salvamento.
- Preservação do contato, inclusive em cotações sem empresa separada, no preenchimento e nos payloads de criação e edição.
- Resolução do vendedor pelo cadastro retornado pela API, com fallback para a configuração existente.
- Preço de venda do item separado do custo; a impressão distingue zero de valor não informado.

Essas mudanças não preenchem retroativamente contatos ausentes no banco. As condições comerciais continuam vinculadas à cotação; não representam confirmação de pagamento recebido.

## Validação reproduzível

`tests/test_migrations_os_postgres.py` executa os upgrades reais em schemas exclusivos de um PostgreSQL de teste e reverte a transação ao final de cada caso. Só usa a variável explícita `TEST_MIGRATION_DATABASE_URL`, nunca `DATABASE_URL`.

No diretório `backend`, com essa variável apontando para um banco descartável:

```text
python -m pytest tests/test_migrations_os_postgres.py tests/test_migrations_ramificadas.py tests/test_valor_venda_item.py tests/test_pedido_list_response.py tests/test_routes_itens.py -q
```

Resultado: 73 testes passaram, incluindo 8 testes com PostgreSQL 17 isolado. A suíte do frontend afetada passou com 67 testes; `npm run build` também concluiu.

A checagem TypeScript completa ainda acusa erros preexistentes em outras partes do projeto. A comparação com uma cópia do `HEAD` confirmou os mesmos diagnósticos restantes; o erro de conversão do valor total da OS foi corrigido nesta revisão.
