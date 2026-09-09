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

O mesmo valia para pedidos — com um agravante proprio. Ali o "indice" e o
numero da OS, que e VARCHAR: "OS-013". Ordenar a coluna e ordenacao ALFABETICA,
nao numerica, e por isso a tela mostrava OS-013, OS-011, OS-012. Alfabeticamente
ela ainda quebra na virada de casa — "OS-1000" < "OS-999", porque '0' vem antes
de '9' —, e o zfill(3) de hoje so adia isso ate a OS-999.
"""
import inspect
import re
from pathlib import Path

from sqlalchemy.dialects import postgresql

from app.services import cotacao as servico_cotacao
from app.services.cotacao import CotacaoService, _ORDENAVEIS
from app.services.pedido import PedidoService, _NUMERO_OS_NUMERICO

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

    def test_o_padrao_e_o_numero_da_os(self):
        assinatura = inspect.signature(PedidoService.list)
        assert assinatura.parameters["sort_by"].default == "numero_os"
        assert assinatura.parameters["sort_dir"].default == "desc"

    def test_a_rota_pede_o_mesmo_padrao(self):
        fonte = (BACKEND / "app" / "api" / "routes" / "pedidos.py").read_text(encoding="utf-8")
        assert 'sort_by: str = Query(default="numero_os")' in fonte

    def test_a_tela_tambem(self):
        fonte = TELA.read_text(encoding="utf-8")
        assert "sort_by: 'numero_os'" in fonte
        assert "sort_by: 'data_pedido', sort_dir: 'desc'," not in fonte

    def test_a_os_ordena_pelo_numero_e_nao_pelo_texto(self):
        """A coluna e VARCHAR. Como texto, "OS-013" < "OS-11" e "OS-1000" <
        "OS-999" — a ordem sai alfabetica e quebra na virada de casa."""
        sql = str(_NUMERO_OS_NUMERICO.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        assert "substring" in sql.lower()
        assert "INTEGER" in sql.upper()

    def test_pega_o_primeiro_grupo_de_digitos(self):
        """E nao todos os digitos: o numero provisorio TMP-<uuid> so existe
        dentro da transacao, mas o apanhado dos digitos dele estouraria o
        inteiro se algum dia escapasse."""
        sql = str(_NUMERO_OS_NUMERICO.compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        assert r"\d+" in sql or r"\d" in sql

    def test_desempata_pela_os_e_pelo_id(self):
        """data_pedido, data_entrega e status empatam muito. O desempate e o
        mesmo criterio da cotacao: o numero, e depois o id."""
        corpo = _corpo(PedidoService.list)
        assert "nullslast(direcao(_NUMERO_OS_NUMERICO))" in corpo
        assert "direcao(Pedido.id)" in corpo

    def test_nao_ordena_mais_por_uma_coluna_so(self):
        corpo = _corpo(PedidoService.list)
        assert 'order_by(desc(sort_col) if sort_dir == "desc" else asc(sort_col))' not in corpo

    def test_a_direcao_do_desempate_acompanha_a_principal(self):
        """Desempate fixo em desc faria a ordem crescente comecar certa e
        inverter dentro de cada empate."""
        corpo = _corpo(PedidoService.list)
        assert re.search(r"direcao\s*=\s*desc if sort_dir == \"desc\" else asc", corpo)
