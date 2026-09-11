"""Real transaction checks in disposable schemas on an explicitly set test DB."""
import os
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

import app.models  # Register all related tables.
from app.database import Base
from app.models import User, Loja, Vendedor, Cliente, Cotacao, ItemCotacao, Pedido, Produto, Frete, CustoPedido
from app.schemas.cotacao import CotacaoUpdate
from app.schemas.pedido import PedidoUpdate, PedidoCreate
from app.services.cotacao import CotacaoService
from app.services.pedido import PedidoService


@pytest.fixture
def records():
    url = os.environ.get('TEST_MIGRATION_DATABASE_URL')
    if not url:
        pytest.skip('Requires an explicit disposable PostgreSQL test database')
    engine = create_engine(url)
    with engine.connect() as conn:
        outer = conn.begin()
        schema = 'test_save_' + uuid4().hex
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        Base.metadata.create_all(conn)
        with Session(bind=conn, autoflush=False, join_transaction_mode='create_savepoint') as db:
            user = User(id=uuid4(), email='local@example.com', name='Local', password_hash='fake')
            loja = Loja(id=uuid4(), nome='Lucky Store')
            cliente = Cliente(id=uuid4(), nome='Cliente')
            db.add_all([user, loja, cliente]); db.flush()
            vendor = Vendedor(id=uuid4(), id_loja=loja.id, nome='Local')
            db.add(vendor); db.flush()
            quote = Cotacao(id=uuid4(), id_loja=loja.id, id_vendedor=vendor.id,
                            cliente='Cliente', data_cotacao=date.today(), created_by=user.id)
            order = Pedido(id=uuid4(), id_loja=loja.id, id_vendedor=vendor.id, id_cliente=cliente.id,
                           numero_os='123', data_pedido=date.today(), data_entrega=date.today(),
                           status='To Buy', created_by=user.id, multa=100, juros=50,
                           num_parcelas_efetivas=3, data_pagamento=date.today())
            db.add_all([quote, order]); db.flush()
            qi = ItemCotacao(id=uuid4(), id_cotacao=quote.id, descricao='Original', quantidade=1, valor_unitario=100)
            pi = Produto(id=uuid4(), id_pedido=order.id, id_vendedor=vendor.id, descricao='Original',
                         quantidade=1, valor_projetado=50, valor_venda=100, observacao='Preservar',
                         fornecedor='Fornecedor', sub_compras=[{'value': 12}], status='Bought')
            freight = Frete(id=uuid4(), id_pedido=order.id, valor=20, data_frete=date.today(), pago=True)
            db.add_all([qi, pi, freight, CustoPedido(id_pedido=order.id, custo_boleto=25)])
            db.commit()
            yield db, user.id, quote.id, order.id, qi.id, pi.id, freight.id, vendor.id, loja.id
        outer.rollback()
    engine.dispose()


def quote_item(item_id, **changes):
    return dict(id=item_id, descricao='Atualizado', quantidade=2, valor_unitario=150, **changes)


def order_item(item_id, vendor_id, **changes):
    result = dict(id=item_id, id_vendedor=vendor_id, descricao='Atualizado', quantidade=2, valor_projetado=50)
    result.update(changes)
    return result


def test_quote_edit_preserves_ids_and_retry_does_not_duplicate(records):
    db, user, quote, _, old, *_ = records
    new_id = uuid4()
    payload = CotacaoUpdate(cliente='Novo cliente', itens=[quote_item(old), quote_item(new_id)],
                            fase={'status_enviada': True})
    for _ in range(2):
        result = CotacaoService.update(db, quote, payload, user)
        assert {item.id for item in result.itens} == {old, new_id}
        assert result.status_enviada is True
    assert db.get(ItemCotacao, old).descricao == 'Atualizado'


def test_quote_failure_rolls_back_parent_deletions_and_insertions(records):
    db, user, quote, _, old, *_ = records
    with pytest.raises(DataError):
        CotacaoService.update(db, quote, CotacaoUpdate(cliente='Nao salvar', itens=[
            dict(id=uuid4(), descricao='Overflow', quantidade=1, valor_unitario=Decimal('1e30')),
        ]), user)
    db.rollback()
    assert db.get(Cotacao, quote).cliente == 'Cliente'
    assert db.get(ItemCotacao, old).descricao == 'Original'
    assert db.query(ItemCotacao).count() == 1


def test_order_edit_keeps_metadata_and_clears_payment_fields(records):
    db, user, _, order, _, item, freight, vendor, _ = records
    result = PedidoService.update(db, order, PedidoUpdate(
        itens=[order_item(item, vendor, valor_venda=0, valor_compra=0)],
        multa=0, juros=0, num_parcelas_efetivas=1, data_pagamento=None,
        plano_parcelas=[], plano_parcelas_pedido=[],
    ), user)
    saved = db.get(Produto, item)
    assert saved.descricao == 'Atualizado'
    assert saved.valor_venda == 0
    assert saved.fornecedor == 'Fornecedor' and saved.observacao == 'Preservar'
    assert saved.sub_compras == [{'value': 12}] and saved.status == 'Bought'
    assert result.multa == result.juros == 0 and result.num_parcelas_efetivas == 1
    assert result.data_pagamento is None and result.plano_parcelas == []
    assert result.custo.custo_boleto == 25
    assert db.get(Frete, freight).pago is True


def test_order_failure_rolls_back_items_freight_and_costs(records):
    db, user, _, order, _, item, freight, vendor, _ = records
    with pytest.raises(DataError):
        PedidoService.update(db, order, PedidoUpdate(
            observacao='Nao salvar', custo={'custo_boleto': 0}, fretes=[],
            itens=[order_item(uuid4(), vendor, valor_venda=Decimal('1e30'))],
        ), user)
    db.rollback()
    assert db.get(Produto, item).descricao == 'Original'
    assert db.get(Frete, freight).pago is True
    assert db.get(Pedido, order).custo.custo_boleto == 25
    assert db.get(Pedido, order).observacao is None


def test_order_retry_keeps_added_items_and_freight_once(records):
    db, user, _, order, _, item, _, vendor, _ = records
    added, freight = uuid4(), uuid4()
    payload = PedidoUpdate(itens=[order_item(item, vendor), order_item(added, vendor)],
                           fretes=[dict(id=freight, valor=20, data_frete=date.today(), pago=True)])
    for _ in range(2):
        result = PedidoService.update(db, order, payload, user)
        assert {p.id for p in result.produtos} == {item, added}
        assert [f.id for f in result.fretes] == [freight]


def test_order_create_failure_does_not_leave_empty_order(records):
    db, user, _, _, _, _, _, _, loja = records
    vendor = db.query(Vendedor).first().id
    with pytest.raises(IntegrityError):
        PedidoService.create(db, PedidoCreate(
            id_loja=loja, id_vendedor=vendor, nome_cliente='Cliente', numero_os='456',
            data_pedido=date.today(), data_entrega=date.today(),
            itens=[order_item(uuid4(), uuid4())],
        ), user)
    db.rollback()
    assert db.query(Pedido).count() == 1


def test_child_cannot_be_moved_from_another_parent(records):
    db, user, quote, _, old, *_ = records
    other = Cotacao(id=uuid4(), id_loja=db.get(Cotacao, quote).id_loja,
                   id_vendedor=db.get(Cotacao, quote).id_vendedor,
                   cliente='Outro', data_cotacao=date.today(), created_by=user)
    db.add(other); db.commit()
    with pytest.raises(ValueError, match='outro registro'):
        CotacaoService.update(db, other.id, CotacaoUpdate(itens=[quote_item(old)]), user)
    db.rollback()
    assert db.get(ItemCotacao, old).id_cotacao == quote


def test_order_creation_saves_all_children_once_with_schema_defaults(records):
    db, user, _, _, _, _, _, vendor, loja = records
    item, freight = uuid4(), uuid4()
    payload = PedidoCreate(
        id_loja=loja, id_vendedor=vendor, nome_cliente='Cliente', numero_os='456',
        data_pedido=date.today(), data_entrega=date.today(),
        itens=[order_item(item, vendor, is_direct_supply=True)],
        fretes=[dict(id=freight, valor=30, data_frete=date.today(), pago=True)],
    )
    first = PedidoService.create(db, payload, user, idempotency_key='same-save')
    second = PedidoService.create(db, payload, user, idempotency_key='same-save')
    assert first.id == second.id
    assert db.query(Produto).filter(Produto.id_pedido == first.id).count() == 1
    assert db.get(Produto, item).status == 'To Buy'
    assert db.get(Produto, item).is_direct_supply is True
    assert db.get(Frete, freight).pago is True


def test_quote_omitted_items_preserves_them_and_explicit_empty_list_removes(records):
    db, user, quote, _, item, *_ = records
    CotacaoService.update(db, quote, CotacaoUpdate(observacao='Só anotação'), user)
    assert db.get(ItemCotacao, item) is not None
    CotacaoService.update(db, quote, CotacaoUpdate(itens=[]), user)
    assert db.get(ItemCotacao, item) is None
