"""Pedido cancelado nao pode entrar na conta do ticket medio.

"Cancelado" estava escrito em dois campos que podiam discordar: o status, que e
o que o vendedor ve e define na tela, e a coluna is_cancelled, que so era ligada
pela rota PATCH /pedidos/{id}/status. A tela nunca manda is_cancelled.

Consequencia medida contra Postgres real, antes da correcao: seis pedidos no
mes, quatro criados ja cancelados (switch "Pedido Cancelado?" ligado antes do
primeiro salvar), 6.000 de faturamento nos dois que fecharam. O dashboard
filtrava so pela flag, entao os quatro cancelados entraram na receita E no
divisor — num_pedidos=6, num_cancelamentos=0, ticket 4.333,33 em vez de 3.000.

A correcao tem tres partes, uma por bloco aqui:
  - o status manda, is_cancelled e espelho dele (PEDIDO_ATIVO / PEDIDO_CANCELADO);
  - toda escrita refaz o espelho, inclusive ao DESCANCELAR;
  - uma migration alinha as linhas que ja entraram tortas.
"""
import re
from pathlib import Path

from sqlalchemy.dialects import postgresql

from app.models.pedido import PEDIDO_ATIVO, PEDIDO_CANCELADO, STATUS_CANCELADO
from app.schemas.pedido import PedidoUpdate

BACKEND = Path(__file__).resolve().parents[1]
SERVICO = BACKEND / "app" / "services" / "pedido.py"
DASHBOARD = BACKEND / "app" / "services" / "dashboard.py"
FRETES = BACKEND / "app" / "services" / "fretes.py"
MIGRATION = BACKEND / "alembic" / "versions" / "a7b8c9d0e1f2_sincroniza_is_cancelled_com_status.py"


def _sql(expr) -> str:
    return str(expr.compile(dialect=postgresql.dialect(),
                            compile_kwargs={"literal_binds": True}))


# ── O predicado ───────────────────────────────────────────────────────────────

class TestPredicado:

    def test_cancelado_olha_os_dois_campos(self):
        """O OR e o que faz o relatorio ficar certo mesmo com linha antiga
        divergente, sem depender de a migration ja ter rodado."""
        sql = _sql(PEDIDO_CANCELADO)
        assert "is_cancelled IS true" in sql
        assert "status = 'Cancelled'" in sql
        assert " OR " in sql

    def test_ativo_exige_os_dois_campos(self):
        """Era exatamente aqui que o pedido criado ja cancelado passava: com
        so `is_cancelled IS NOT true`, status='Cancelled' contava como venda."""
        sql = _sql(PEDIDO_ATIVO)
        assert "is_cancelled IS NOT true" in sql
        assert "status != 'Cancelled'" in sql
        assert " AND " in sql

    def test_status_cancelado_e_o_valor_que_a_tela_manda(self):
        assert STATUS_CANCELADO == "Cancelled"


# ── Quem usa o predicado ──────────────────────────────────────────────────────

class TestConsultas:

    def test_dashboard_nao_filtra_mais_so_pela_flag(self):
        """Cada `is_cancelled` solto que voltar aqui e um numero errado no
        relatorio — receita, ticket, contagem ou serie diaria."""
        fonte = DASHBOARD.read_text(encoding="utf-8")
        soltos = re.findall(r"Pedido\.is_cancelled", fonte)
        assert not soltos, (
            f"{len(soltos)} filtro(s) de cancelamento fora do predicado em "
            "dashboard.py; use PEDIDO_ATIVO / PEDIDO_CANCELADO"
        )

    def test_fretes_nao_filtra_mais_so_pela_flag(self):
        fonte = FRETES.read_text(encoding="utf-8")
        assert "Pedido.is_cancelled" not in fonte

    def test_dashboard_importa_o_predicado(self):
        fonte = DASHBOARD.read_text(encoding="utf-8")
        assert "PEDIDO_ATIVO" in fonte and "PEDIDO_CANCELADO" in fonte


# ── A escrita mantem os dois lados de acordo ──────────────────────────────────

def _corpo(nome: str) -> str:
    fonte = SERVICO.read_text(encoding="utf-8")
    return fonte.split(f"def {nome}(")[1].split("    @staticmethod")[0]


class TestEscrita:

    def test_create_aceita_cancelamento_pelo_status(self):
        """A tela so manda o status. Se o create copiasse o payload cru, o
        pedido nasceria cancelado com a flag em False — o bug original."""
        corpo = _corpo("create")
        assert "data.status == STATUS_CANCELADO" in corpo
        assert "is_cancelled=cancelado" in corpo
        assert "status=status_inicial" in corpo

    def test_change_status_desliga_a_flag_ao_descancelar(self):
        """`if new_status == 'Cancelled': is_cancelled = True` so sabia ligar.
        Pedido reaberto ficava fora do relatorio para sempre."""
        corpo = _corpo("change_status")
        assert "_sincronizar_cancelamento(pedido)" in corpo
        assert "is_cancelled = True" not in corpo

    def test_update_nao_consegue_cancelar_pelo_put(self):
        """PedidoUpdate nao expoe status nem is_cancelled — o PUT so mexe em
        dados do pedido, e cancelar passa obrigatoriamente por change_status,
        que mantem o espelho. Se um desses campos entrar no schema, o PUT
        volta a poder deixar os dois lados em desacordo: ou o campo sai daqui,
        ou update() passa a chamar _sincronizar_cancelamento()."""
        campos = set(PedidoUpdate.model_fields)
        assert "status" not in campos
        assert "is_cancelled" not in campos

    def test_o_espelho_e_derivado_do_status(self):
        fonte = SERVICO.read_text(encoding="utf-8")
        corpo = fonte.split("def _sincronizar_cancelamento(")[1].split("\ndef ")[0]
        assert "pedido.is_cancelled = pedido.status == STATUS_CANCELADO" in corpo


# ── A migration ───────────────────────────────────────────────────────────────

class TestMigration:

    def test_existe_e_encadeia_no_head_anterior(self):
        fonte = MIGRATION.read_text(encoding="utf-8")
        assert "revision: str = 'a7b8c9d0e1f2'" in fonte
        assert "down_revision: Union[str, None] = 'd9e0f1a2b3c4'" in fonte

    def test_corrige_os_dois_sentidos_da_divergencia(self):
        """Nao basta ligar a flag onde o status diz cancelado: tem que
        DESLIGAR onde ela ficou ligada e o pedido foi reaberto."""
        fonte = MIGRATION.read_text(encoding="utf-8")
        assert "SET is_cancelled = (status = 'Cancelled')" in fonte
        assert "IS DISTINCT FROM" in fonte

    def test_e_idempotente_pelo_where(self):
        """Rodar de novo nao pode tocar em linha nenhuma."""
        fonte = MIGRATION.read_text(encoding="utf-8")
        assert "WHERE COALESCE(is_cancelled, false) IS DISTINCT FROM" in fonte

    def test_nenhum_id_de_revision_repetido(self):
        """A primeira versao desta migration nasceu com um id ja usado por
        outra (e0f1a2b3c4d5). O alembic nao ignora isso: ele monta o grafo com
        a revision duplicada, detecta ciclo e recusa QUALQUER comando — deploy
        inteiro parado, com uma mensagem que nao aponta para o arquivo novo."""
        ids: dict[str, list[str]] = {}
        for arquivo in (BACKEND / "alembic" / "versions").glob("*.py"):
            achado = re.search(r"^revision: str = ['\"]([^'\"]+)['\"]",
                               arquivo.read_text(encoding="utf-8"), re.M)
            if achado:
                ids.setdefault(achado.group(1), []).append(arquivo.name)
        repetidos = {rev: nomes for rev, nomes in ids.items() if len(nomes) > 1}
        assert not repetidos, f"revision id repetido: {repetidos}"
