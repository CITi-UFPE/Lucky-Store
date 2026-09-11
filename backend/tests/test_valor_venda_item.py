"""Quanto o item foi VENDIDO tem onde ficar guardado.

O documento da OS imprime duas colunas de dinheiro: "Valor de compra" e "Valor
de venda". Elas saiam trocadas em relacao ao rotulo, e a de venda saia ZERADA no
caso mais comum.

A causa estava na conversao da cotacao em pedido:

  - `valor_projetado` recebia `item.valor_unitario`, o CUSTO da cotacao. Como se
    cota o preco do cliente e o custo so aparece na hora de comprar, esse campo
    costuma ser zero. A coluna "Valor de venda" lia ele: zerava.
  - `valor_compra` recebia `item.valor_fechamento`, o preco do CLIENTE, embora
    nada tivesse sido comprado ainda. A coluna "Valor de compra" lia ele:
    imprimia o preco de venda.

E havia uma perda silenciosa alem do rotulo trocado: o preco do cliente estava
guardado emprestado num campo de outra coisa. Quando o item era efetivamente
comprado, `valor_compra` era substituido pelo valor pago ao fornecedor e o
quanto aquilo foi vendido sumia, sem deixar rastro.

Agora existe `valor_venda`, campo proprio, unitario como o `valor_fechamento` de
onde ele vem.

Os testes de conversao aqui NAO procuram trechos no codigo: eles rodam
`convert_to_pedido` e leem os objetos `Produto` que sairam. Foi o resultado que
estava errado, entao e o resultado que fica travado. O comportamento tambem foi
medido contra Postgres real antes deste arquivo existir.
"""
import re
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from app.models.item_cotacao import ItemCotacao
from app.models.produto import Produto
from app.schemas.produto import ProdutoCreate, ProdutoResponse, ProdutoUpdate
from app.services import conversao_cotacao as mod
from app.services.conversao_cotacao import ConversaoCotacaoService

MIGRATION = "f1e2d3c4b5a6"
VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
FONTE_MIGRATION = (
    VERSOES / f"{MIGRATION}_valor_venda_no_item_do_pedido.py"
).read_text(encoding="utf-8")


# ── a conversao, rodada de verdade ──────────────────────────────────────────

class _Cotacao:
    """Cotacao minima; so o que a conversao le."""

    def __init__(self, **kw):
        self.id = uuid4()
        self.id_loja = uuid4()
        self.id_vendedor = uuid4()
        self.deleted_at = None
        self.status_caida = False
        self.status_fechada = False
        self.data_fechamento = None
        self.cliente = "Fulano"
        self.b2b_company = "Tech Corp"
        self.cnpj_cliente = None
        self.numero_requisicao = "REQ-1"
        self.data_prevista_fechamento = None
        self.is_direct_billing = False
        self.fornecedor = None
        self.observacao = None
        self.valor_total = None
        self.valor_fechamento = None
        self.__dict__.update(kw)


class _Query:
    def __init__(self, resultado):
        self._r = resultado

    def filter(self, *a, **k):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self._r[0] if self._r else None

    def all(self):
        return list(self._r)


class _DB:
    """Sessao falsa que guarda tudo que foi adicionado."""

    def __init__(self, cotacao, itens):
        self._por_modelo = {"Cotacao": [cotacao], "Pedido": [], "ItemCotacao": itens}
        self.adicionados = []

    def query(self, modelo):
        return _Query(self._por_modelo.get(modelo.__name__, []))

    def add(self, obj):
        self.adicionados.append(obj)

    def flush(self):
        pass

    def commit(self):
        pass

    def refresh(self, obj):
        pass

    def produtos(self):
        return [o for o in self.adicionados if isinstance(o, Produto)]


def _converter(itens, monkeypatch) -> list[Produto]:
    """Roda a conversao de verdade e devolve os itens do pedido que nasceram."""
    cot = _Cotacao()
    for i in itens:
        i.id_cotacao = cot.id
    db = _DB(cot, itens)
    monkeypatch.setattr(mod, "obter_ou_criar_cliente",
                        lambda *a, **k: MagicMock(id=uuid4()))
    monkeypatch.setattr(mod, "_generate_numero_os", lambda db: "OS-001")
    monkeypatch.setattr(mod, "_numero_provisorio", lambda pid: "PROV")
    ConversaoCotacaoService.convert_to_pedido(db, cot.id, uuid4())
    return db.produtos()


def _item(**kw) -> ItemCotacao:
    base = dict(
        id=uuid4(), descricao="Notebook", quantidade=2,
        valor_unitario=Decimal("0.00"), valor_fechamento=Decimal("6480.00"),
        is_direct_supply=False, fornecedor=None,
        porcentagem_fornecedor=None, frete_fornecedor=None,
    )
    base.update(kw)
    return ItemCotacao(**base)


class TestConversao:
    """O caso que o usuario viu: cotacao com preco do cliente e custo zerado."""

    def test_o_preco_do_cliente_vai_para_valor_venda(self, monkeypatch):
        (p,) = _converter([_item()], monkeypatch)
        assert p.valor_venda == Decimal("6480.00")

    def test_item_normal_nasce_sem_valor_de_compra(self, monkeypatch):
        """Nada foi comprado ainda. Preenchendo aqui, o documento imprimia o
        preco de venda na coluna de compra — e a compra depois apagava o
        preco de venda."""
        (p,) = _converter([_item()], monkeypatch)
        assert p.valor_compra is None

    def test_o_custo_projetado_continua_sendo_o_custo(self, monkeypatch):
        (p,) = _converter([_item(valor_unitario=Decimal("4100.00"))], monkeypatch)
        assert p.valor_projetado == Decimal("4100.00")

    def test_a_coluna_de_venda_nao_zera_quando_o_custo_e_zero(self, monkeypatch):
        """Era exatamente isto que saia zerado no papel: custo nao preenchido
        na cotacao, coluna 'Valor de venda' em R$ 0,00 em todas as linhas."""
        (p,) = _converter([_item(valor_unitario=Decimal("0.00"))], monkeypatch)
        impresso = (p.valor_venda or Decimal("0")) * p.quantidade
        assert impresso == Decimal("12960.00")

    def test_fornecimento_direto_mantem_a_convencao_antiga(self, monkeypatch):
        """Ali `valor_compra` guarda o valor de VENDA por convencao (ver
        item_pedido.add_item) e e dele que saem a margem e o custo do
        fornecedor. Esvaziar zeraria essas contas."""
        (p,) = _converter([_item(is_direct_supply=True, fornecedor="ACME",
                                 valor_fechamento=Decimal("9000.00"))], monkeypatch)
        assert p.valor_compra == Decimal("9000.00")
        assert p.valor_venda == Decimal("9000.00")

    def test_cotacao_sem_preco_fechado_deixa_o_campo_vazio(self, monkeypatch):
        """NULL e a verdade: ninguem registrou por quanto aquilo foi vendido.
        O documento imprime um travessao."""
        (p,) = _converter([_item(valor_fechamento=None)], monkeypatch)
        assert p.valor_venda is None

    def test_cada_item_leva_o_proprio_preco(self, monkeypatch):
        itens = [
            _item(descricao="Notebook", valor_fechamento=Decimal("6480.00")),
            _item(descricao="Servidor", valor_fechamento=Decimal("9000.00")),
        ]
        por_nome = {p.descricao: p.valor_venda for p in _converter(itens, monkeypatch)}
        assert por_nome == {"Notebook": Decimal("6480.00"),
                            "Servidor": Decimal("9000.00")}


# ── o campo atravessa a API ─────────────────────────────────────────────────

class TestSchemas:
    def test_create_aceita_valor_venda(self):
        p = ProdutoCreate(id_vendedor=uuid4(), descricao="X", quantidade=1,
                          valor_projetado=Decimal("1.00"),
                          valor_venda=Decimal("6480.00"))
        assert p.valor_venda == Decimal("6480.00")

    def test_create_sem_valor_venda_continua_valendo(self):
        """Item criado na mao, antes de alguem saber o preco."""
        p = ProdutoCreate(id_vendedor=uuid4(), descricao="X", quantidade=1,
                          valor_projetado=Decimal("1.00"))
        assert p.valor_venda is None

    def test_update_aceita_valor_venda(self):
        """Sem isto, corrigir o preco de venda de um item pela tela nao chegava
        ao banco — e o PUT respondia 200 do mesmo jeito."""
        assert "valor_venda" in ProdutoUpdate.model_fields

    def test_a_resposta_devolve_valor_venda(self):
        """A tela le daqui para preencher a coluna. Faltando o campo, o valor
        existe no banco e some no caminho."""
        assert "valor_venda" in ProdutoResponse.model_fields


class TestServicoDeItem:
    def test_add_item_grava_o_valor_venda_recebido(self, monkeypatch):
        from app.services import item_pedido as ip

        capturados = []
        db = MagicMock()
        db.add.side_effect = lambda o: capturados.append(o)
        monkeypatch.setattr(ip.PedidoService, "get_by_id", lambda *a, **k: MagicMock())

        ip.ItemPedidoService.add_item(
            db, uuid4(),
            ProdutoCreate(id_vendedor=uuid4(), descricao="X", quantidade=3,
                          valor_projetado=Decimal("1.00"),
                          valor_venda=Decimal("500.00")),
            uuid4(),
        )
        (produto,) = [o for o in capturados if isinstance(o, Produto)]
        assert produto.valor_venda == Decimal("500.00")


# ── a migration ─────────────────────────────────────────────────────────────

class TestMigration:
    def test_cria_a_coluna(self):
        assert re.search(r"ADD COLUMN IF NOT EXISTS valor_venda", FONTE_MIGRATION)

    def test_o_backfill_vem_da_cotacao_de_origem(self):
        """O `valor_compra` dos itens ja comprados foi sobrescrito pelo valor
        pago ao fornecedor; ele nao serve como fonte. A cotacao serve."""
        assert "valor_venda = ic.valor_fechamento" in FONTE_MIGRATION
        assert "p.valor_compra" not in FONTE_MIGRATION

    def test_o_backfill_casa_por_descricao_e_quantidade(self):
        """So por descricao, uma cotacao que repete o produto casaria linhas
        erradas."""
        assert "ic.descricao = p.descricao" in FONTE_MIGRATION
        assert "ic.quantidade = p.quantidade" in FONTE_MIGRATION

    def test_o_backfill_e_idempotente(self):
        """Rodar de novo nao pode sobrescrever valor corrigido na mao."""
        assert "p.valor_venda IS NULL" in FONTE_MIGRATION

    def test_downgrade_derruba_a_coluna(self):
        assert "DROP COLUMN IF EXISTS valor_venda" in FONTE_MIGRATION

    def test_encadeia_na_migration_anterior(self):
        assert re.search(r"down_revision[^\n]*=\s*'d1a2b3c4e5f6'", FONTE_MIGRATION)


class TestModelo:
    def test_o_produto_tem_a_coluna(self):
        assert hasattr(Produto, "valor_venda")

    def test_valor_venda_aceita_vazio(self):
        """Pedido antigo sem cotacao de origem fica sem valor, e tudo bem."""
        assert Produto.__table__.c.valor_venda.nullable
