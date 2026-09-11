"""valor de venda por item do pedido

Revision ID: f1e2d3c4b5a6
Revises: d1a2b3c4e5f6
Create Date: 2026-09-11 00:00:00.000000

O item do pedido nao tinha onde guardar por quanto aquele produto foi VENDIDO.

Enquanto isso, o documento da OS imprime uma coluna "Valor de venda". Ela lia
`valor_projetado`, que e o CUSTO projetado — e a coluna "Valor de compra" lia
`valor_compra`, onde a conversao da cotacao vinha gravando o preco do CLIENTE.
As duas colunas saiam trocadas em relacao ao rotulo, num papel que vai ao
cliente.

E saiam zeradas no caso mais comum: a cotacao costuma ter o "Valor de cotacao"
preenchido e o "Custo do produto" em zero — cota-se o preco para o cliente, e o
custo so aparece na hora de comprar. Com `valor_projetado = 0`, a coluna "Valor
de venda" zerava em todas as linhas e no total.

Pior que o rotulo trocado: o preco do cliente estava guardado EMPRESTADO em
`valor_compra`, e quando o item era efetivamente comprado aquele campo era
substituido pelo valor pago ao fornecedor. O quanto o produto foi vendido
simplesmente sumia, sem deixar rastro.

Agora existe `valor_venda`, e ele guarda so isso. Preco unitario, como o
`valor_fechamento` da cotacao de onde ele vem — o documento multiplica pela
quantidade.

O backfill busca na cotacao de origem, que e a fonte confiavel: o `valor_compra`
dos itens ja comprados foi sobrescrito e nao serve. Casa por descricao E
quantidade e tipo de fornecimento. So preenche quando ha exatamente um item
correspondente na cotacao. Correspondencias ausentes ou ambiguas ficam NULL
para revisao manual; escolher uma das linhas repetidas poderia gravar um preco
incorreto. Valores ja registrados nunca sao sobrescritos.

Idempotente: so preenche o que esta NULL.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f1e2d3c4b5a6'
down_revision: Union[str, None] = 'd1a2b3c4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE produtos ADD COLUMN IF NOT EXISTS valor_venda NUMERIC(12, 2)")

    op.execute(
        """
        WITH correspondencias AS (
            SELECT p.id, MIN(ic.valor_fechamento) AS valor_fechamento
              FROM produtos p
              JOIN pedidos ped ON p.id_pedido = ped.id
              JOIN item_cotacao ic ON ic.id_cotacao = ped.id_cotacao
               AND ic.descricao = p.descricao
               AND ic.quantidade = p.quantidade
               AND COALESCE(ic.is_direct_supply, false) = COALESCE(p.is_direct_supply, false)
             WHERE p.valor_venda IS NULL
             GROUP BY p.id
            HAVING COUNT(*) = 1 AND COUNT(ic.valor_fechamento) = 1
        )
        UPDATE produtos p
           SET valor_venda = ic.valor_fechamento
          FROM correspondencias ic
         WHERE p.id = ic.id AND p.valor_venda IS NULL
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE produtos DROP COLUMN IF EXISTS valor_venda")
