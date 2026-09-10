"""Observacao no produto: o item ganha onde anotar.

O pedido e a cotacao ja tinham um campo de observacoes; o produto nao. Quem
acompanha a compra item a item nao tinha onde escrever fornecedor que ligou,
prazo que mudou, motivo de a compra estar parada — e isso acabava na observacao
do PEDIDO, misturado com o que era dos outros itens.

Duas coisas que este teste trava, e que sao faceis de quebrar sem perceber:

1. Text, nao VARCHAR(n). Observacao e texto livre; um limite aqui cortaria a
   anotacao no meio ou estouraria o UPDATE.

2. update_item usa `model_dump(exclude_none=True)`, entao None significa "nao
   mexi neste campo". Quem quer LIMPAR a anotacao manda string vazia. Se o
   campo virasse obrigatorio, ou se a tela mandasse None em vez de "", apagar
   uma anotacao pararia de funcionar em silencio — e mexer so no status
   apagaria a anotacao junto.
"""
from sqlalchemy import Text

from app.models.produto import Produto
from app.schemas.produto import ProdutoCreate, ProdutoResponse, ProdutoUpdate

MIGRATION = "b8c9d0e1f2a3"


class TestColuna:

    def test_existe_e_e_opcional(self):
        """Opcional porque os produtos que ja existem nasceram sem anotacao —
        e a maioria dos novos tambem nao vai ter."""
        coluna = Produto.__table__.columns["observacao"]
        assert coluna.nullable is True

    def test_e_text_sem_limite(self):
        coluna = Produto.__table__.columns["observacao"]
        assert isinstance(coluna.type, Text)
        assert getattr(coluna.type, "length", None) is None


class TestSchemas:

    def test_criar_item_sem_anotacao_continua_valendo(self):
        """O campo entrou depois; toda chamada que ja existia nao manda ele."""
        p = ProdutoCreate(id_vendedor="00000000-0000-0000-0000-000000000001",
                          descricao="Transistor", quantidade=1, valor_projetado=10)
        assert p.observacao is None

    def test_criar_item_com_anotacao(self):
        p = ProdutoCreate(id_vendedor="00000000-0000-0000-0000-000000000001",
                          descricao="Transistor", quantidade=1, valor_projetado=10,
                          observacao="Fornecedor ligou.")
        assert p.observacao == "Fornecedor ligou."

    def test_da_para_editar(self):
        assert ProdutoUpdate(observacao="Prazo mudou.").observacao == "Prazo mudou."

    def test_string_vazia_e_o_jeito_de_limpar(self):
        """None seria descartado pelo exclude_none do update_item; "" chega e
        apaga. Sem isto nao ha como apagar uma anotacao pela tela."""
        assert ProdutoUpdate(observacao="").observacao == ""
        assert "observacao" in ProdutoUpdate(observacao="").model_dump(exclude_none=True)
        assert "observacao" not in ProdutoUpdate().model_dump(exclude_none=True)

    def test_sem_limite_de_tamanho(self):
        longo = "x" * 100_000
        assert ProdutoUpdate(observacao=longo).observacao == longo
        campo = ProdutoUpdate.model_fields["observacao"]
        assert not [m for m in campo.metadata if hasattr(m, "max_length")]

    def test_a_resposta_devolve_a_anotacao(self):
        """Sem isto a tela salvaria e, ao reabrir o item, a caixa viria vazia."""
        assert "observacao" in ProdutoResponse.model_fields


class TestMigration:

    def test_encadeia_no_head_anterior(self):
        from pathlib import Path
        arquivo = (Path(__file__).resolve().parents[1] / "alembic" / "versions"
                   / f"{MIGRATION}_add_observacao_to_produtos.py")
        fonte = arquivo.read_text(encoding="utf-8")
        assert f"revision: str = '{MIGRATION}'" in fonte
        assert "down_revision: Union[str, None] = 'a7b8c9d0e1f2'" in fonte

    def test_e_idempotente(self):
        from pathlib import Path
        arquivo = (Path(__file__).resolve().parents[1] / "alembic" / "versions"
                   / f"{MIGRATION}_add_observacao_to_produtos.py")
        fonte = arquivo.read_text(encoding="utf-8")
        assert "ADD COLUMN IF NOT EXISTS observacao TEXT" in fonte

    def test_nenhum_id_de_revision_repetido(self):
        """Ja aconteceu: um id repetido faz o alembic detectar ciclo e recusar
        QUALQUER comando — deploy inteiro parado."""
        import re
        from pathlib import Path
        ids: dict[str, list[str]] = {}
        pasta = Path(__file__).resolve().parents[1] / "alembic" / "versions"
        for arquivo in pasta.glob("*.py"):
            achado = re.search(r"^revision: str = ['\"]([^'\"]+)['\"]",
                               arquivo.read_text(encoding="utf-8"), re.M)
            if achado:
                ids.setdefault(achado.group(1), []).append(arquivo.name)
        repetidos = {r: n for r, n in ids.items() if len(n) > 1}
        assert not repetidos, f"revision id repetido: {repetidos}"
