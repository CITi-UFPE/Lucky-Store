# Correções de OS, cotações e Financeiro

O painel financeiro usava uma conversão incompleta dos pedidos, deixando vendedor, contato, preços e custos em branco ou zero. Além disso, o salvamento de itens em várias requisições podia deixar registros incompletos após uma falha.

## Alterações

- Vendas e Financeiro usam o mesmo adaptador de OS, preservando os dados comerciais, valores, fornecimento direto e fretes pagos, inclusive os sem entregador informado.
- Criação de OS e edição de OS/cotação podem salvar dados e coleções de itens na mesma transação. Na edição da cotação, as fases também participam da transação. Uma falha no banco reverte as exclusões, inclusões e alterações dessa operação.
- Itens existentes preservam seus UUIDs. Itens novos enviados na edição usam UUIDs estáveis durante as tentativas de salvamento, evitando duplicação ao reenviar um PUT cuja resposta se perdeu. Na criação de OS, a chave de idempotência cobre também os itens e fretes.
- Campos de produtos que não são editados no modal, como anotações, subcompras e fornecedor, são preservados. O nome editado passa a ser gravado.
- Multa e juros zero, parcela única e planos vazios são enviados explicitamente. Datas e campos textuais anuláveis podem ser limpos sem apagar campos omitidos. Ao alterar a quantidade de parcelas, o total é redistribuído com ajuste de centavos; desabilitar o parcelamento limpa o plano.
- Despesas só alteram a lista após a confirmação do servidor. O formulário permanece aberto após erro de criação, edição ou exclusão, e evita envios simultâneos. Falha na recarga de uma série após uma gravação bem-sucedida não incentiva repetir a criação.
- A consulta financeira percorre todas as páginas de pedidos. Se uma página falhar, a tela informa que não conseguiu carregar todos os pedidos e oferece nova tentativa.

O controle de acesso foi mantido conforme a decisão do usuário. A mudança não cria migrations e não altera dados de produção durante o desenvolvimento.

## Contrato e publicação

Os endpoints novos são `POST /pedidos/complete`, `PUT /pedidos/{id}/complete` e `PUT /quotes/{id}/complete`. Os endpoints anteriores continuam disponíveis para clientes que ainda não enviam coleções.

O frontend utiliza o endereço novo quando envia o salvamento completo. Isso impede que um backend antigo ignore silenciosamente o campo de itens e responda com sucesso sem gravá-los. O backend atualizado deve estar disponível antes do frontend atualizado; enquanto não estiver, o formulário recebe erro e permanece aberto.

Na OS, a troca de status geral ainda utiliza sua rota própria, preservando a regra de cancelamento e o histórico existentes. Se essa etapa falhar, não há mensagem de sucesso nem fechamento do formulário. Os dados e itens confirmados na etapa anterior continuam salvos.

## Validação

Foram executados testes de frontend, backend, checagem de tipos TypeScript e compilação de produção. Também foram adicionadas regressões para falhas de salvamento, reenvio, nome de produto, dados financeiros, paginação e redistribuição das parcelas.

Resultado: suíte completa do backend com 637 testes aprovados (incluindo os testes de PostgreSQL); suíte completa do frontend com 473 testes aprovados, seguida da aprovação dos três novos testes de contrato e dos cenários relacionados. TypeScript e build de produção aprovados. O build mantém o aviso já existente sobre tamanho do bundle.

`backend/tests/test_atomic_saves_postgres.py` usa schemas descartáveis em um PostgreSQL de teste explicitamente configurado por `TEST_MIGRATION_DATABASE_URL`, com `autoflush=False`, como a aplicação. Os testes verificam:

- rollback de alteração de dados gerais, custos, itens e fretes;
- preservação de IDs, metadados e vendedor do produto;
- reenvio sem duplicar itens, fretes ou uma nova OS;
- criação de OS com todos os filhos e aplicação dos valores padrão;
- gravação de zero, um, listas vazias e null nos campos apropriados;
- distinção entre coleções omitidas e listas explicitamente vazias;
- rejeição de itens pertencentes a outro registro.

Os testes antigos de RMA foram atualizados para os status atuais, o campo fornecedor e o título da seção. O teste de erro da consulta de pedidos passou a simular o cliente HTTP realmente utilizado. Também foram corrigidas incompatibilidades de tipos já existentes, para permitir a validação TypeScript completa.


## Custo Total do dashboard

O indicador de resultado financeiro agora soma custo final dos produtos, custos adicionais das OS (serviços, impostos, taxas de crédito/débito/boleto e brindes) e fretes do período. Estimativas e percentuais não são somados aos valores monetários. O gráfico de composição usa as parcelas `custo_produtos`, `custo_adicionais` e `custo_frete`, cuja soma corresponde a `custo`.

As despesas fixas permanecem em `outros_custos` e são descontadas uma vez, no lucro líquido. O lucro bruto e os indicadores derivados retornados por KPIs descontam o custo total atualizado. A série histórica utiliza os mesmos adicionais e reconhece o frete pela data efetiva (`data_frete`), como o cartão.

Uma reprodução em PostgreSQL com os valores enviados pelo usuário verificou produtos de R$ 840,00, adicionais de R$ 85,40 e fretes de R$ 135,00: custo total de R$ 1.060,40 e lucro de R$ 6.404,10 sobre faturamento de R$ 7.464,50. Testes também cobrem múltiplos fretes sem multiplicação de produtos, campos nulos, despesas fixas separadas e período vazio. Nenhuma migration é necessária.
