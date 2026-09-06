"""nome da pessoa de contato no pedido

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-09-07 00:00:00.000000

O pedido tinha um campo de nome so. Empresa e pessoa de contato disputavam ele:
o AddOrderChooser fundia os dois na origem

    customer: (picked.b2b_company?.trim()) ? picked.b2b_company : picked.cliente

e a conversao de cotacao descartava o b2b_company de vez. Resultado: o documento
impresso mostrava um nome so, e nao dava para dizer se era a empresa ou a pessoa.

A empresa continua em clientes.nome — e para la que o formulario sempre mandou o
nome digitado, e e de la que o CNPJ e. Por isso esta migration NAO converte dado
nenhum: os pedidos existentes ja estao com a empresa no lugar certo. A coluna
nova nasce vazia neles, que e a verdade — a pessoa de contato nunca foi guardada.

Idempotente: rodar de novo nao faz nada.
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'd9e0f1a2b3c4'
down_revision: Union[str, None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS contato_cliente VARCHAR(255)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS contato_cliente")
