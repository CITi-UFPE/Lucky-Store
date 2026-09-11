"""add pagamento fields to pedidos

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-05-25 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ATENCAO: os campos de pagamento foram implementados DUAS vezes, em ramos
    # paralelos que se juntam adiante — esta e d4e5f6a7b8c9. As duas rodam, e
    # as duas adicionam `data_pagamento` e `plano_parcelas`: quem rodasse por
    # ultimo estourava com DuplicateColumn e parava a migracao no meio.
    #
    # Os nomes que o modelo usa hoje sao os do OUTRO ramo (multa, juros,
    # forma_pagamento_efetiva, num_parcelas_efetivas). As colunas proprias
    # desta migration — valor_multa, valor_juros, metodo_pagamento — ficaram
    # sem uso. Ela nao pode ser apagada porque bancos ja migrados tem esta
    # revisao gravada; o que da para fazer e nao deixar ela derrubar ninguem.
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_pagamento DATE")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS valor_multa NUMERIC(12, 2)")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS valor_juros NUMERIC(12, 2)")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_pagamento VARCHAR(50)")
    op.execute("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS plano_parcelas JSONB")


def downgrade() -> None:
    # `data_pagamento` e `plano_parcelas` sao compartilhadas com d4e5f6a7b8c9,
    # que e o ramo vivo. Derrubar as duas aqui levaria junto dados que o
    # sistema usa, entao esta volta so desfaz o que e exclusivo desta migration.
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS metodo_pagamento")
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS valor_juros")
    op.execute("ALTER TABLE pedidos DROP COLUMN IF EXISTS valor_multa")
