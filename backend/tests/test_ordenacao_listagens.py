"""A lista de cotacoes sai pelo INDICE, e a paginacao e reproduzivel.

A tela mostrava 79, 80, 78, 81, 77, 76, 73, 75, 71, 69 — fora de ordem.

A listagem ordenava por data_cotacao, que e uma DATA digitada: varias cotacoes
caem no mesmo dia, e SQL nao promete ordem nenhuma para linhas empatadas. O
Postgres devolvia os empates na ordem que fosse mais barata naquele momento.

Quem diz "mais recente" e o indice: ele vem de uma sequence, entao o maior e
sempre o ultimo criado. A data nao serve — pode ser retroagida e repete.

E ordem instavel nao e so feiura. Com OFFSET/LIMIT, duas consultas que ordenam
diferente fazem a mesma cotacao aparecer na pagina 1 e na 2, enquanto outra nao
aparece em nenhuma — sem erro, sem aviso. Por isso o desempate desce ate `id`,
que e unico: dai a ordem e total e a paginacao passa a ser reproduzivel.

O mesmo valia para pedidos, ordenados por data_pedido sem desempate.
"""
import inspect
import re
from pathlib import Path

from app.services import cotacao as servico_cotacao
from app.services.cotacao import CotacaoService, _ORDENAVEIS
from app.services.pedido import PedidoService

BACKEND = Path(__file__).resolve().parents[1]
ROTA_COTACOES = BACKEND / "app" / "api" / "routes" / "cotacoes.py"
TELA = BACKEND.parent / "src" / "pages" / "Sales.tsx"


def _corpo(func) -> str:
    return inspect.getsource(func)


class TestCotacao:

    def test_o_padrao_e_o_indice(self):
        """Nao data_cotacao: e o indice que responde "qual e a mais recente"."""
        assinatura = inspect.signature(CotacaoService.list)
        assert assinatura.parameters["sort_by"].default == "numero"
        assert assinatura.parameters["sort_dir"].default == "desc"

    def test_a_rota_pede_o_mesmo_padrao(self):
        """Se a rota mandasse data_cotacao, o padrao do service nunca valeria —
        era exatamente assim que a tela recebia a lista fora de ordem."""
        fonte = ROTA_COTACOES.read_text(encoding="utf-8")
        assert 'sort_by: str = Query(default="numero")' in fonte

    def test_a_tela_tambem(self):
        """A tela manda sort_by explicito; se ficasse em data_cotacao, a
        correcao no backend nao apareceria para o usuario."""
        fonte = TELA.read_text(encoding="utf-8")
        assert "sort_by: 'numero'" in fonte
        assert "sort_by: 'data_cotacao'" not in fonte

    def test_desempata_ate_o_id(self):
        """`id` e unico, entao a ordem fica total. Sem isso a paginacao pode
        repetir uma linha e engolir outra."""
        corpo = _corpo(CotacaoService.list)
        assert "direcao(Cotacao.id)" in corpo

    def test_indice_ausente_vai_para_o_fim(self):
        """As cotacoes anteriores a sequence nao tem numero. Em DESC o Postgres
        poe NULL na FRENTE — elas apareceriam antes das numeradas, no topo da
        tela."""
        corpo = _corpo(CotacaoService.list)
        assert corpo.count("nullslast(") >= 2

    def test_sort_by_desconhecido_cai_no_indice(self):
        corpo = _corpo(CotacaoService.list)
        assert 'sort_by if sort_by in _ORDENAVEIS else "numero"' in corpo

    def test_a_lista_de_ordenaveis_e_fechada(self):
        """Antes o `sort_by` da query string ia direto para o getattr: qualquer
        atributo do model servia, inclusive os que nao sao coluna."""
        assert "numero" in _ORDENAVEIS
        assert "metadata" not in _ORDENAVEIS
        assert "registry" not in _ORDENAVEIS
        # Todos precisam existir como coluna de verdade.
        colunas = set(servico_cotacao.Cotacao.__table__.columns.keys())
        assert _ORDENAVEIS <= colunas, _ORDENAVEIS - colunas


class TestPedido:

    def test_desempata_por_criacao_e_id(self):
        """data_pedido tambem e uma DATA: varios pedidos no mesmo dia empatam."""
        corpo = _corpo(PedidoService.list)
        assert "direcao(Pedido.created_at)" in corpo
        assert "direcao(Pedido.id)" in corpo

    def test_nao_ordena_mais_por_uma_coluna_so(self):
        corpo = _corpo(PedidoService.list)
        assert 'order_by(desc(sort_col) if sort_dir == "desc" else asc(sort_col))' not in corpo

    def test_a_direcao_do_desempate_acompanha_a_principal(self):
        """Desempate fixo em desc faria a ordem crescente comecar certa e
        inverter dentro de cada empate."""
        corpo = _corpo(PedidoService.list)
        assert re.search(r"direcao\s*=\s*desc if sort_dir == \"desc\" else asc", corpo)
