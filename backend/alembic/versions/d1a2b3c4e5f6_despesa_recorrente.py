"""despesa recorrente, uma por mes

Revision ID: d1a2b3c4e5f6
Revises: b8c9d0e1f2a3
Create Date: 2026-09-11 00:00:00.000000

Custo fixo se repete todo mes por definicao — aluguel, salario, contador — mas
cada despesa era um registro solto, com uma data so. Para o Dashboard mostrar o
custo fixo em janeiro, fevereiro e marco, alguem cadastrava o aluguel tres
vezes. Esquecendo um mes, o Dashboard mostrava lucro maior que o real, calado.

A escolha foi gerar uma despesa DE VERDADE por mes, e nao um registro unico
contado varias vezes: assim o aluguel de marco pode estar pago e o de abril
nao, e o de maio pode ter outro valor. E o que encaixa no que ja se faz, porque
Pago/Previsao e status ja sao por despesa.

Tres colunas:

  recorrencia_id  Agrupa as ocorrencias. A primeira despesa e a "mae" e leva o
                  proprio id aqui, entao o grupo inteiro compartilha um valor.
  recorrente      Se a recorrencia ainda esta gerando. Encerrar e por false;
                  as ocorrencias que ja existem ficam, porque sao historico.
  competencia     O mes a que a ocorrencia se refere, sempre no dia 1. Existe
                  para a unicidade abaixo: data_prevista nao serve porque o dia
                  do mes varia (dia 31 vira 30 em abril) e porque a data pode
                  ser editada depois.

A unicidade e o que torna a geracao segura. Ela roda na leitura — nao ha
agendador nesta infra — entao duas requisicoes simultaneas tentariam criar o
mesmo mes ao mesmo tempo. Com o indice, a segunda esbarra no banco em vez de
duplicar o aluguel. Parcial em deleted_at para uma ocorrencia excluida nao
bloquear a recriacao do mes.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'd1a2b3c4e5f6'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE despesas ADD COLUMN IF NOT EXISTS recorrencia_id UUID")
    op.execute("ALTER TABLE despesas ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE despesas ADD COLUMN IF NOT EXISTS competencia DATE")

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_despesa_recorrencia_competencia
            ON despesas (recorrencia_id, competencia)
         WHERE recorrencia_id IS NOT NULL AND deleted_at IS NULL
        """
    )
    # A geracao procura as recorrencias ativas a cada leitura; sem isto seria
    # varredura na tabela inteira de despesas toda vez.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_despesa_recorrente_ativa
            ON despesas (recorrencia_id)
         WHERE recorrente AND deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_despesa_recorrente_ativa")
    op.execute("DROP INDEX IF EXISTS uq_despesa_recorrencia_competencia")
    op.execute("ALTER TABLE despesas DROP COLUMN IF EXISTS competencia")
    op.execute("ALTER TABLE despesas DROP COLUMN IF EXISTS recorrente")
    op.execute("ALTER TABLE despesas DROP COLUMN IF EXISTS recorrencia_id")
