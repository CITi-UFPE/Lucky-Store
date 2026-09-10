"""Observacao nao tem limite de caracteres, e nao pode ganhar um sem querer.

A suspeita era de limite baixo. Nao existe limite nenhum:

  - a coluna e Text, que no Postgres nao tem teto (conferido em
    information_schema: character_maximum_length e NULL nas duas tabelas);
  - os schemas sao Optional[str], sem max_length;
  - o campo da tela nao tem maxLength.

Medido contra Postgres real: 500.000 caracteres gravam e voltam inteiros, na
criacao e na edicao, com acentos e quebras de linha preservados — no pedido e na
cotacao.

Este teste existe porque um limite aqui cortaria texto EM SILENCIO. Um
max_length no Pydantic devolve 422 e o vendedor perde o formulario; um
String(n) na coluna estoura no INSERT. Nos dois casos a perda so aparece quando
alguem for procurar a informacao no pedido e ela nao estiver la.
"""
from sqlalchemy import Text

from app.models.cotacao import Cotacao
from app.models.pedido import Pedido
from app.schemas.cotacao import CotacaoCreate, CotacaoUpdate
from app.schemas.pedido import PedidoCreate, PedidoUpdate

MODELS = [("pedido", Pedido), ("cotacao", Cotacao)]
SCHEMAS = [
    ("PedidoCreate", PedidoCreate), ("PedidoUpdate", PedidoUpdate),
    ("CotacaoCreate", CotacaoCreate), ("CotacaoUpdate", CotacaoUpdate),
]


class TestColuna:

    def test_e_text_e_nao_varchar(self):
        """String(n) truncaria — ou pior, estouraria o INSERT com o formulario
        inteiro preenchido."""
        for nome, model in MODELS:
            coluna = model.__table__.columns["observacao"]
            assert isinstance(coluna.type, Text), f"{nome}: {coluna.type}"

    def test_sem_tamanho_maximo(self):
        for nome, model in MODELS:
            coluna = model.__table__.columns["observacao"]
            assert getattr(coluna.type, "length", None) is None, nome


class TestSchema:

    def test_sem_max_length(self):
        """Com max_length o backend responde 422 e o vendedor perde tudo o que
        digitou — sem saber que o problema era o tamanho da observacao."""
        for nome, schema in SCHEMAS:
            campo = schema.model_fields["observacao"]
            limites = [m for m in campo.metadata if hasattr(m, "max_length")]
            assert not limites, f"{nome}: {limites}"

    def test_aceita_texto_longo(self):
        longo = "x" * 100_000
        assert PedidoCreate.model_construct(observacao=longo).observacao == longo
        assert CotacaoUpdate(observacao=longo).observacao == longo

    def test_acentos_e_quebras_de_linha_passam_inteiros(self):
        texto = "Observação com acento.\nSegunda linha.\r\nTerceira."
        assert CotacaoUpdate(observacao=texto).observacao == texto
