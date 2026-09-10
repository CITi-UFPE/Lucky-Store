"""observacao no produto

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-09-10 00:00:00.000000

O pedido e a cotacao ja tinham um campo de observacoes; o produto nao. Quem
acompanha a compra item a item — na tela de Produtos, abrindo um item — nao
tinha onde anotar nada: fornecedor que ligou, prazo que mudou, motivo de a
compra estar parada. Essas anotacoes acabavam na observacao do PEDIDO, misturadas
com as dos outros itens, ou nao eram escritas.

Text, como as outras: no Postgres nao tem teto, e observacao e campo de texto
livre. Um VARCHAR(n) aqui cortaria a anotacao no meio ou estouraria o UPDATE.

Nasce NULL nos produtos que ja existem, que e a verdade — ninguem anotou nada
neles.

Idempotente: rodar de novo nao faz nada.
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE produtos ADD COLUMN IF NOT EXISTS observacao TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE produtos DROP COLUMN IF EXISTS observacao")
