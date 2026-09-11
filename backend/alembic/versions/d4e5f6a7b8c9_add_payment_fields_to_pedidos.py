"""add payment fields to pedidos

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-15

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Este e o ramo VIVO dos campos de pagamento: sao estes nomes que
    # app/models/pedido.py usa. O outro, c1d2e3f4a5b6, faz a mesma coisa com
    # nomes diferentes e tambem roda, porque os ramos se juntam adiante.
    # `data_pagamento` e `plano_parcelas` aparecem nos dois — quem rodasse por
    # ultimo estourava com DuplicateColumn e parava a migracao no meio.
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_pagamento DATE")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS multa NUMERIC(12, 2)")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS juros NUMERIC(12, 2)")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS forma_pagamento_efetiva VARCHAR(50)")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS num_parcelas_efetivas INTEGER")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS plano_parcelas JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS plano_parcelas")
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS num_parcelas_efetivas")
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS forma_pagamento_efetiva")
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS juros")
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS multa")
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS data_pagamento")
