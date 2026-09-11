"""Duas migrations que criam a mesma coluna nao podem derrubar a migracao.

O historico do alembic deste projeto NAO e uma linha reta. Ele tem ramos —
trabalho paralelo que saiu do mesmo ponto e se juntou adiante — e em tres
lugares a mesma coisa foi implementada duas vezes, em ramos diferentes:

  cotacoes.numero          -> b1c2d3e4f5a6  e  c0a1b2c3d4e5
  pedidos.data_pagamento   -> c1d2e3f4a5b6  e  d4e5f6a7b8c9
  pedidos.plano_parcelas   -> c1d2e3f4a5b6  e  d4e5f6a7b8c9

Como os ramos se juntam, AS DUAS rodam. A segunda estourava com DuplicateColumn
e parava o `alembic upgrade head` no meio — deixando o banco a meio caminho, com
parte das migrations aplicadas e parte nao. Aconteceu de verdade, num banco que
estava parado em e1f2a3b4c5d6.

Ninguem tinha percebido porque banco novo nao passa por aqui: migrate.py cria o
esquema com create_all e faz `stamp head`. So um banco ANTIGO, que precise
atravessar os ramos, encontra o problema — e banco antigo e justamente o que tem
dado dentro.

A regra que este arquivo trava: se duas migrations adicionam a mesma coluna da
mesma tabela, as duas precisam ser idempotentes. Nao da para simplesmente apagar
uma delas — bancos ja migrados tem a revisao gravada, e sumir com ela quebra a
cadeia.

O teste nao conhece esses tres pares: ele varre as migrations e cobra a regra de
qualquer par novo que apareca.
"""
import re
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parents[1]

ADICIONA_COLUNA = re.compile(
    r"""add_column\(\s*['"](?P<t1>\w+)['"]\s*,\s*sa\.Column\(\s*['"](?P<c1>\w+)['"]"""
    r"""|ALTER\s+TABLE\s+(?P<t2>\w+)\s+ADD\s+COLUMN\s+(?P<ine>IF\s+NOT\s+EXISTS\s+)?(?P<c2>\w+)""",
    re.I,
)


def _revisoes():
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    return list(ScriptDirectory.from_config(cfg).walk_revisions("base", "heads"))


def _corpo_do_upgrade(caminho: str) -> str:
    src = Path(caminho).read_text(encoding="utf-8")
    if "def upgrade" not in src:
        return ""
    return src.split("def upgrade")[1].split("def downgrade")[0]


def _colunas_adicionadas():
    """{(tabela, coluna): [(revisao, idempotente?), ...]}"""
    mapa: dict[tuple[str, str], list[tuple[str, bool]]] = {}
    for r in _revisoes():
        corpo = _corpo_do_upgrade(r.path)
        for m in ADICIONA_COLUNA.finditer(corpo):
            if m.group("t1"):
                alvo, idem = (m.group("t1"), m.group("c1")), False  # op.add_column nunca e
            else:
                alvo, idem = (m.group("t2"), m.group("c2")), bool(m.group("ine"))
            mapa.setdefault((alvo[0].lower(), alvo[1].lower()), []).append((r.revision, idem))
    return mapa


DUPLICADAS = {k: v for k, v in _colunas_adicionadas().items() if len(v) > 1}


def test_o_historico_tem_ramos_mesmo():
    """Se um dia virar linha reta, o resto deste arquivo perde o sentido e este
    teste avisa em vez de deixar a suite guardando uma regra morta."""
    revs = _revisoes()
    filhos: dict[str, list[str]] = {}
    for r in revs:
        pais = r.down_revision if isinstance(r.down_revision, tuple) else [r.down_revision]
        for p in pais:
            if p:
                filhos.setdefault(p, []).append(r.revision)
    assert any(len(f) > 1 for f in filhos.values()), (
        "o historico virou linear — reveja se este arquivo ainda faz sentido"
    )


def test_existe_ao_menos_um_par_duplicado():
    """Guarda o proprio detector: se ele parar de achar os pares conhecidos
    (uma regex que deixou de casar, por exemplo), os testes abaixo passariam
    vazios e nao protegeriam nada."""
    assert DUPLICADAS, "o detector nao achou nenhuma coluna duplicada — ele quebrou?"


@pytest.mark.parametrize("alvo", sorted(DUPLICADAS), ids=lambda a: f"{a[0]}.{a[1]}")
def test_coluna_criada_duas_vezes_e_idempotente_nas_duas(alvo):
    """Quem roda por ultimo tem que virar no-op, nao estourar a migracao."""
    nao_idempotentes = [rev for rev, idem in DUPLICADAS[alvo] if not idem]
    tabela, coluna = alvo
    assert not nao_idempotentes, (
        f"{tabela}.{coluna} e adicionada por mais de uma migration, e "
        f"{', '.join(nao_idempotentes)} nao usa ADD COLUMN IF NOT EXISTS. "
        f"Num banco que atravesse os dois ramos, a segunda estoura com "
        f"DuplicateColumn e para o upgrade no meio."
    )


@pytest.mark.parametrize("alvo", sorted(DUPLICADAS), ids=lambda a: f"{a[0]}.{a[1]}")
def test_o_downgrade_das_duplicadas_tolera_a_coluna_ausente(alvo):
    """Mesma historia na volta: a outra migration do par ja pode ter derrubado
    a coluna, e `op.drop_column` numa coluna que nao existe estoura."""
    tabela, coluna = alvo
    for rev, _ in DUPLICADAS[alvo]:
        caminho = next(r.path for r in _revisoes() if r.revision == rev)
        src = Path(caminho).read_text(encoding="utf-8")
        down = src.split("def downgrade")[1] if "def downgrade" in src else ""
        assert f"op.drop_column('{tabela}', '{coluna}')" not in down, (
            f"{rev} derruba {tabela}.{coluna} sem IF EXISTS, e a outra migration "
            f"do par pode ter derrubado antes"
        )
