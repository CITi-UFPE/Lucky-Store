"""alinha is_cancelled ao status nos pedidos ja existentes

Revision ID: a7b8c9d0e1f2
Revises: d9e0f1a2b3c4
Create Date: 2026-09-08 00:00:00.000000

"Pedido cancelado" morava em dois campos que podiam discordar: o status e a
coluna is_cancelled. A tela so mandava o status; a flag so era ligada pela rota
PATCH /pedidos/{id}/status. Duas divergencias entraram no banco por ai:

  1. status='Cancelled' com is_cancelled=false — pedido criado ja cancelado
     (o switch "Pedido Cancelado?" ligado antes do primeiro salvar). O
     dashboard filtrava so pela flag, entao esse pedido contava como venda:
     somava na receita e entrava no divisor do ticket medio. Com 6 pedidos no
     mes e 4 cancelados, o ticket saia dividido por 6 em vez de por 2.

  2. is_cancelled=true com status diferente de 'Cancelled' — pedido cancelado e
     depois reaberto. A rota de status so sabia LIGAR a flag, nunca desligar.
     Esse sumia do relatorio para sempre, mesmo tendo voltado a ser venda.

Daqui em diante quem manda e o status, e o servico mantem o espelho
(_sincronizar_cancelamento em app/services/pedido.py). Esta migration corrige o
passado, nos dois sentidos.

Idempotente: o WHERE so pega linha divergente, entao rodar de novo nao faz nada.
"""
from typing import Sequence, Union
from alembic import op

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'd9e0f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE pedidos
           SET is_cancelled = (status = 'Cancelled')
         WHERE COALESCE(is_cancelled, false) IS DISTINCT FROM (status = 'Cancelled')
        """
    )


def downgrade() -> None:
    # Nao ha volta: o estado anterior era justamente a divergencia, e ela nao
    # foi guardada em lugar nenhum. Desfazer seria reintroduzir o erro.
    pass
