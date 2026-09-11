"""add numero sequencial to cotacoes

Revision ID: c0a1b2c3d4e5
Revises: f3a4b5c6d7e8
Create Date: 2026-06-19 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c0a1b2c3d4e5'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ATENCAO: existe uma SEGUNDA migration que adiciona esta mesma coluna,
    # b1c2d3e4f5a6, no outro ramo que sai de e1f2a3b4c5d6. As duas fazem a
    # mesma coisa e as duas rodam, porque os ramos se juntam adiante. Quem
    # rodasse por ultimo estourava com DuplicateColumn e parava a migracao
    # inteira no meio — foi o que aconteceu num banco que estava em
    # e1f2a3b4c5d6. Por isso aqui e tudo idempotente: se a coluna ja existe,
    # esta migration nao faz nada e deixa passar.
    op.execute("CREATE SEQUENCE IF NOT EXISTS cotacao_numero_seq")
    op.execute("ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS numero INTEGER")
    # Backfill so do que esta sem numero, continuando do maximo atual. Numerar
    # tudo de novo renumeraria cotacoes que o outro ramo ja numerou, e o numero
    # da cotacao aparece em documento que foi para o cliente.
    op.execute("""
        WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
            FROM cotacoes WHERE numero IS NULL
        )
        UPDATE cotacoes c
        SET numero = o.rn + COALESCE((SELECT MAX(numero) FROM cotacoes), 0)
        FROM ordered o WHERE c.id = o.id
    """)
    # Avança a sequence para o próximo número disponível
    op.execute(
        "SELECT setval('cotacao_numero_seq', "
        "COALESCE((SELECT MAX(numero) FROM cotacoes), 0) + 1, false)"
    )


def downgrade() -> None:
    # Idem: a outra migration do mesmo par ja pode ter derrubado a coluna.
    op.execute("ALTER TABLE cotacoes DROP COLUMN IF EXISTS numero")
    op.execute("DROP SEQUENCE IF EXISTS cotacao_numero_seq")
