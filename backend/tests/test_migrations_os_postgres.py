"""Executa as migrations locais em schemas descartáveis de um Postgres de teste.

Defina TEST_MIGRATION_DATABASE_URL explicitamente. Nunca usa DATABASE_URL.
Cada teste cria um schema próprio, e toda a transação é revertida no final.
"""
import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
PRECO = "f1e2d3c4b5a6"
NUMEROS = ("b1c2d3e4f5a6", "c0a1b2c3d4e5")
PAGAMENTOS = ("c1d2e3f4a5b6", "d4e5f6a7b8c9")


@pytest.fixture
def pg():
    url = os.environ.get("TEST_MIGRATION_DATABASE_URL")
    if not url:
        pytest.skip("Defina TEST_MIGRATION_DATABASE_URL para um Postgres de teste")
    engine = create_engine(url)
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            schema = "test_os_" + uuid4().hex
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            yield conn
        finally:
            transaction.rollback()
    engine.dispose()


def executar(conn, revision):
    path = next(VERSOES.glob(f"{revision}_*.py"))
    spec = importlib.util.spec_from_file_location(revision, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(MigrationContext.configure(conn)):
        module.upgrade()


def preparar_itens(conn):
    conn.execute(text("CREATE TABLE pedidos (id INTEGER PRIMARY KEY, id_cotacao INTEGER)"))
    conn.execute(text("""CREATE TABLE produtos (
        id INTEGER PRIMARY KEY, id_pedido INTEGER, descricao TEXT,
        quantidade INTEGER, is_direct_supply BOOLEAN,
        valor_compra NUMERIC(12,2), valor_projetado NUMERIC(12,2))"""))
    conn.execute(text("""CREATE TABLE item_cotacao (
        id INTEGER PRIMARY KEY, id_cotacao INTEGER, descricao TEXT,
        quantidade INTEGER, is_direct_supply BOOLEAN, valor_fechamento NUMERIC(12,2))"""))
    conn.execute(text("INSERT INTO pedidos VALUES (1, 10), (2, NULL)"))
    conn.execute(text("""INSERT INTO produtos VALUES
        (1, 1, 'Notebook', 2, false, 8000, 4000),
        (2, 1, 'Repetido', 1, false, 300, 250),
        (3, 1, 'Sem preco', 1, false, 10, 9),
        (4, 1, 'Notebook', 2, true, 6000, 4000),
        (5, 2, 'Notebook', 2, false, 200, 150),
        (6, 1, 'Ausente', 1, false, 300, 250),
        (7, 1, 'Notebook', 9, false, 300, 250),
        (8, 1, 'Ambiguo nulo', 1, false, 20, 10),
        (9, 1, 'Gratis', 1, false, 0, 0)"""))
    conn.execute(text("""INSERT INTO item_cotacao VALUES
        (1, 10, 'Notebook', 2, false, 6480),
        (2, 10, 'Repetido', 1, false, 500),
        (3, 10, 'Repetido', 1, false, 700),
        (4, 10, 'Sem preco', 1, false, NULL),
        (5, 10, 'Notebook', 2, true, 9000),
        (6, 10, 'Ambiguo nulo', 1, false, 100),
        (7, 10, 'Ambiguo nulo', 1, false, NULL),
        (8, 10, 'Gratis', 1, false, 0)"""))


def test_preco_copia_apenas_correspondencias_unicas_sem_mudar_custos(pg):
    preparar_itens(pg)
    antes = pg.execute(text("SELECT * FROM produtos ORDER BY id")).all()
    executar(pg, PRECO)
    precos = dict(pg.execute(text("SELECT id, valor_venda FROM produtos")).all())
    assert precos == {1: 6480, 2: None, 3: None, 4: 9000, 5: None,
                      6: None, 7: None, 8: None, 9: 0}
    depois = pg.execute(text("""SELECT id, id_pedido, descricao, quantidade,
        is_direct_supply, valor_compra, valor_projetado FROM produtos ORDER BY id""")).all()
    assert antes == depois


def test_preco_preserva_correcao_manual_e_aceita_coluna_existente(pg):
    preparar_itens(pg)
    pg.execute(text("ALTER TABLE produtos ADD COLUMN valor_venda NUMERIC(12,2)"))
    pg.execute(text("UPDATE produtos SET valor_venda = 1234 WHERE id = 1"))
    executar(pg, PRECO)
    executar(pg, PRECO)
    assert pg.execute(text("SELECT valor_venda FROM produtos WHERE id = 1")).scalar_one() == 1234


@pytest.mark.parametrize("ordem", [NUMEROS, NUMEROS[::-1]])
def test_numeracao_preserva_existentes_em_ambas_ordens(pg, ordem):
    pg.execute(text("CREATE TABLE cotacoes (id INTEGER PRIMARY KEY, created_at TIMESTAMP, numero INTEGER)"))
    pg.execute(text("""INSERT INTO cotacoes VALUES
        (1, '2026-01-01', 42), (2, '2026-01-02', NULL), (3, '2026-01-03', NULL)"""))
    for revision in ordem:
        executar(pg, revision)
    assert pg.execute(text("SELECT numero FROM cotacoes ORDER BY id")).scalars().all() == [42, 43, 44]
    assert pg.execute(text("SELECT nextval('cotacao_numero_seq')")).scalar_one() == 45


@pytest.mark.parametrize("ordem", [NUMEROS, NUMEROS[::-1]])
def test_numeracao_cria_coluna_uma_vez(pg, ordem):
    pg.execute(text("CREATE TABLE cotacoes (id INTEGER PRIMARY KEY, created_at TIMESTAMP)"))
    pg.execute(text("INSERT INTO cotacoes VALUES (1, '2026-01-01')"))
    for revision in ordem:
        executar(pg, revision)
    assert pg.execute(text("SELECT numero FROM cotacoes")).scalar_one() == 1


@pytest.mark.parametrize("ordem", [PAGAMENTOS, PAGAMENTOS[::-1]])
def test_pagamentos_preservam_dados_em_ambas_ordens(pg, ordem):
    pg.execute(text("CREATE TABLE pedidos (id INTEGER PRIMARY KEY)"))
    executar(pg, ordem[0])
    pg.execute(text("""INSERT INTO pedidos (id, data_pagamento, plano_parcelas)
        VALUES (1, '2026-09-01', :plano)"""),
        {"plano": '[{"date":"2026-09-01","value":250}]'})
    antes = pg.execute(text("SELECT data_pagamento, plano_parcelas FROM pedidos")).one()
    executar(pg, ordem[1])
    assert pg.execute(text("SELECT data_pagamento, plano_parcelas FROM pedidos")).one() == antes
    # Todos os campos usados pelo modelo continuam disponíveis.
    pg.execute(text("SELECT multa, juros, forma_pagamento_efetiva, num_parcelas_efetivas FROM pedidos"))
