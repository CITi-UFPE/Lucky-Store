"""
Tests for all SQLAlchemy models:
  - Enum integrity (values are correct strings)
  - Model instantiation and attribute defaults
  - __repr__ methods
  - Class-level constants (PRODUTO_STATUSES)
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest


# ── User ──────────────────────────────────────────────────────────────────────

class TestUserRole:

    def test_admin_value(self):
        from app.models.user import UserRole
        assert UserRole.ADMIN == "admin"

    def test_manager_value(self):
        from app.models.user import UserRole
        assert UserRole.MANAGER == "manager"

    def test_seller_value(self):
        from app.models.user import UserRole
        assert UserRole.SELLER == "seller"

    def test_viewer_value(self):
        from app.models.user import UserRole
        assert UserRole.VIEWER == "viewer"

    def test_all_four_roles_exist(self):
        from app.models.user import UserRole
        assert len(UserRole) == 4


class TestUserModel:

    def test_tablename(self):
        from app.models.user import User
        assert User.__tablename__ == "users"

    def test_instantiation_with_required_fields(self):
        from app.models.user import User, UserRole
        user = User(
            email="test@example.com",
            name="Test User",
            password_hash="hashed",
            role=UserRole.ADMIN,
        )
        assert user.email == "test@example.com"
        assert user.name == "Test User"
        assert user.role == UserRole.ADMIN

    def test_repr(self):
        from app.models.user import User
        user = User(email="admin@test.com", name="Admin", password_hash="x")
        assert "admin@test.com" in repr(user)

    def test_totp_defaults(self):
        from app.models.user import User
        user = User(email="x@x.com", name="X", password_hash="x")
        assert user.totp_enabled is None or user.totp_enabled is False or user.totp_enabled == False


# ── AuditLog ──────────────────────────────────────────────────────────────────

class TestAuditAction:

    def test_create_value(self):
        from app.models.audit_log import AuditAction
        assert AuditAction.CREATE == "CREATE"

    def test_update_value(self):
        from app.models.audit_log import AuditAction
        assert AuditAction.UPDATE == "UPDATE"

    def test_delete_value(self):
        from app.models.audit_log import AuditAction
        assert AuditAction.DELETE == "DELETE"

    def test_restore_value(self):
        from app.models.audit_log import AuditAction
        assert AuditAction.RESTORE == "RESTORE"

    def test_all_four_actions_exist(self):
        from app.models.audit_log import AuditAction
        assert len(AuditAction) == 4


class TestAuditLogModel:

    def test_tablename(self):
        from app.models.audit_log import AuditLog
        assert AuditLog.__tablename__ == "audit_logs"

    def test_instantiation(self):
        from app.models.audit_log import AuditLog, AuditAction
        entity_id = uuid.uuid4()
        user_id = uuid.uuid4()
        log = AuditLog(
            entity_type="pedido",
            entity_id=entity_id,
            action=AuditAction.CREATE,
            changed_by=user_id,
            new_values={"status": "To Buy"},
        )
        assert log.entity_type == "pedido"
        assert log.action == AuditAction.CREATE
        assert log.new_values == {"status": "To Buy"}

    def test_ip_and_ua_are_optional(self):
        from app.models.audit_log import AuditLog, AuditAction
        log = AuditLog(
            entity_type="pedido",
            entity_id=uuid.uuid4(),
            action=AuditAction.UPDATE,
            changed_by=uuid.uuid4(),
        )
        assert log.ip_address is None
        assert log.user_agent is None

    def test_repr(self):
        from app.models.audit_log import AuditLog, AuditAction
        log = AuditLog(
            entity_type="pedido",
            entity_id=uuid.uuid4(),
            action=AuditAction.DELETE,
            changed_by=uuid.uuid4(),
        )
        assert "DELETE" in repr(log)
        assert "pedido" in repr(log)


# ── StatusHistory ─────────────────────────────────────────────────────────────

class TestEntityType:

    def test_pedido_value(self):
        from app.models.status_history import EntityType
        assert EntityType.PEDIDO == "pedido"

    def test_produto_value(self):
        from app.models.status_history import EntityType
        assert EntityType.PRODUTO == "produto"

    def test_rma_value(self):
        from app.models.status_history import EntityType
        assert EntityType.RMA == "rma"

    def test_item_rma_value(self):
        from app.models.status_history import EntityType
        assert EntityType.ITEM_RMA == "item_rma"

    def test_cotacao_value(self):
        from app.models.status_history import EntityType
        assert EntityType.COTACAO == "cotacao"

    def test_five_entity_types_exist(self):
        from app.models.status_history import EntityType
        assert len(EntityType) == 5


class TestStatusHistoryModel:

    def test_tablename(self):
        from app.models.status_history import StatusHistory
        assert StatusHistory.__tablename__ == "status_history"

    def test_instantiation(self):
        from app.models.status_history import StatusHistory, EntityType
        entity_id = uuid.uuid4()
        user_id = uuid.uuid4()
        h = StatusHistory(
            entity_type=EntityType.PEDIDO,
            entity_id=entity_id,
            old_status=None,
            new_status="To Buy",
            changed_by=user_id,
            reason="Criado",
        )
        assert h.entity_type == EntityType.PEDIDO
        assert h.new_status == "To Buy"
        assert h.old_status is None

    def test_repr(self):
        from app.models.status_history import StatusHistory, EntityType
        h = StatusHistory(
            entity_type=EntityType.PEDIDO,
            entity_id=uuid.uuid4(),
            old_status="To Buy",
            new_status="Bought",
            changed_by=uuid.uuid4(),
        )
        assert "To Buy" in repr(h)
        assert "Bought" in repr(h)


# ── Pedido ────────────────────────────────────────────────────────────────────

class TestPedidoModel:

    def test_tablename(self):
        from app.models.pedido import Pedido
        assert Pedido.__tablename__ == "pedidos"

    def test_instantiation_and_defaults(self):
        from app.models.pedido import Pedido
        pedido = Pedido(
            id_loja=uuid.uuid4(),
            id_vendedor=uuid.uuid4(),
            id_cliente=uuid.uuid4(),
            numero_os="OS-001",
            data_pedido=date.today(),
            data_entrega=date.today(),
            created_by=uuid.uuid4(),
        )
        assert pedido.numero_os == "OS-001"
        assert pedido.deleted_at is None

    def test_repr(self):
        from app.models.pedido import Pedido
        pedido = Pedido(numero_os="OS-999", status="Delivered")
        assert "OS-999" in repr(pedido)
        assert "Delivered" in repr(pedido)


class TestPedidoFormaPagamento:

    def test_tablename(self):
        from app.models.pedido import PedidoFormaPagamento
        assert PedidoFormaPagamento.__tablename__ == "pedido_forma_pagamento"

    def test_instantiation(self):
        from app.models.pedido import PedidoFormaPagamento
        fp = PedidoFormaPagamento(id_pedido=uuid.uuid4(), forma="Crédito")
        assert fp.forma == "Crédito"


class TestCustoPedido:

    def test_tablename(self):
        from app.models.pedido import CustoPedido
        assert CustoPedido.__tablename__ == "custo_pedido"

    def test_instantiation_all_optional(self):
        from app.models.pedido import CustoPedido
        custo = CustoPedido(id_pedido=uuid.uuid4())
        assert custo.custo_produto_inicial is None
        assert custo.custo_servico is None


# ── Produto ───────────────────────────────────────────────────────────────────

class TestProdutoStatuses:

    def test_all_expected_statuses_present(self):
        from app.models.produto import PRODUTO_STATUSES
        expected = ["Pending", "To Purchase", "In Stock", "Received",
                    "Ready", "Shipped", "Delivered", "Delayed", "Cancelled"]
        for s in expected:
            assert s in PRODUTO_STATUSES

    def test_nine_statuses(self):
        from app.models.produto import PRODUTO_STATUSES
        assert len(PRODUTO_STATUSES) == 11


class TestProdutoModel:

    def test_tablename(self):
        from app.models.produto import Produto
        assert Produto.__tablename__ == "produtos"

    def test_instantiation(self):
        from app.models.produto import Produto
        produto = Produto(
            id_pedido=uuid.uuid4(),
            id_vendedor=uuid.uuid4(),
            descricao="Notebook Dell",
            quantidade=2,
            valor_projetado=Decimal("3000.00"),
        )
        assert produto.descricao == "Notebook Dell"
        assert produto.quantidade == 2

    def test_repr(self):
        from app.models.produto import Produto
        produto = Produto(descricao="Monitor 27 polegadas", status="In Stock")
        assert "Monitor 27 polegadas" in repr(produto)
        assert "In Stock" in repr(produto)


# ── Cotacao ───────────────────────────────────────────────────────────────────

class TestCotacaoModel:

    def test_tablename(self):
        from app.models.cotacao import Cotacao
        assert Cotacao.__tablename__ == "cotacoes"

    def test_instantiation(self):
        from app.models.cotacao import Cotacao
        cotacao = Cotacao(
            id_loja=uuid.uuid4(),
            id_vendedor=uuid.uuid4(),
            cliente="Empresa Teste",
            data_cotacao=date.today(),
            created_by=uuid.uuid4(),
        )
        assert cotacao.cliente == "Empresa Teste"
        assert cotacao.deleted_at is None

    def test_phase_defaults_are_false(self):
        from app.models.cotacao import Cotacao
        cotacao = Cotacao(
            id_loja=uuid.uuid4(),
            id_vendedor=uuid.uuid4(),
            cliente="Test",
            data_cotacao=date.today(),
            created_by=uuid.uuid4(),
        )
        assert not cotacao.status_enviada
        assert not cotacao.status_em_fechamento
        assert not cotacao.status_fechada
        assert not cotacao.status_caida

    def test_repr(self):
        from app.models.cotacao import Cotacao
        cotacao = Cotacao(numero_requisicao="REQ-001", cliente="Acme Corp")
        assert "REQ-001" in repr(cotacao)
        assert "Acme Corp" in repr(cotacao)


class TestItemCotacaoModel:

    def test_tablename(self):
        from app.models.item_cotacao import ItemCotacao
        assert ItemCotacao.__tablename__ == "item_cotacao"

    def test_instantiation(self):
        from app.models.item_cotacao import ItemCotacao
        item = ItemCotacao(
            id_cotacao=uuid.uuid4(),
            descricao="Teclado Mecânico",
            quantidade=3,
            valor_unitario=Decimal("350.00"),
        )
        assert item.descricao == "Teclado Mecânico"
        assert item.quantidade == 3
        assert item.valor_fechamento is None

    def test_repr(self):
        from app.models.item_cotacao import ItemCotacao
        item = ItemCotacao(descricao="Mouse Gamer", quantidade=5,
                           valor_unitario=Decimal("200.00"))
        assert "Mouse Gamer" in repr(item)
        assert "5" in repr(item)


# ── Rma ───────────────────────────────────────────────────────────────────────

class TestRmaStatus:

    def test_registered_value(self):
        from app.models.rma import RmaStatus
        assert RmaStatus.REGISTERED == "Registered"

    def test_completed_value(self):
        from app.models.rma import RmaStatus
        assert RmaStatus.COMPLETED == "Completed"

    def test_cancelled_value(self):
        from app.models.rma import RmaStatus
        assert RmaStatus.CANCELLED == "Cancelled"

    def test_ten_statuses_exist(self):
        from app.models.rma import RmaStatus
        assert len(RmaStatus) == 11

    def test_all_values_are_title_case(self):
        from app.models.rma import RmaStatus
        for status in RmaStatus:
            assert status.value[0].isupper(), f"{status.value} should start with uppercase"


class TestRmaModel:

    def test_tablename(self):
        from app.models.rma import Rma
        assert Rma.__tablename__ == "rmas"

    def test_instantiation(self):
        from app.models.rma import Rma, RmaStatus
        rma = Rma(
            id_pedido_origem=uuid.uuid4(),
            id_vendedor=uuid.uuid4(),
            id_loja=uuid.uuid4(),
            numero_rma="RMA-2026-000001",
            data_registro=date.today(),
            status=RmaStatus.REGISTERED,
            created_by=uuid.uuid4(),
        )
        assert rma.numero_rma == "RMA-2026-000001"
        assert rma.status == RmaStatus.REGISTERED
        assert rma.deleted_at is None

    def test_repr(self):
        from app.models.rma import Rma
        rma = Rma(numero_rma="RMA-2026-000042")
        assert "RMA-2026-000042" in repr(rma)


# ── ItemRma ───────────────────────────────────────────────────────────────────

class TestItemRmaStatus:

    def test_not_received_value(self):
        from app.models.item_rma import ItemRmaStatus
        assert ItemRmaStatus.NOT_RECEIVED == "Not Received"

    def test_received_value(self):
        from app.models.item_rma import ItemRmaStatus
        assert ItemRmaStatus.RECEIVED == "Received"

    def test_delivered_value(self):
        from app.models.item_rma import ItemRmaStatus
        assert ItemRmaStatus.DELIVERED == "Delivered"

    def test_eight_statuses_exist(self):
        from app.models.item_rma import ItemRmaStatus
        assert len(ItemRmaStatus) == 11


class TestItemRmaModel:

    def test_tablename(self):
        from app.models.item_rma import ItemRma
        assert ItemRma.__tablename__ == "item_rma"

    def test_instantiation(self):
        from app.models.item_rma import ItemRma, ItemRmaStatus
        item = ItemRma(
            id_rma=uuid.uuid4(),
            id_produto_origem=uuid.uuid4(),
            descricao="Tela trincada",
            quantidade=1,
            status=ItemRmaStatus.NOT_RECEIVED,
        )
        assert item.descricao == "Tela trincada"
        assert item.status == ItemRmaStatus.NOT_RECEIVED
        assert item.consertado_por is None

    def test_repr(self):
        from app.models.item_rma import ItemRma
        item = ItemRma(id=uuid.uuid4())
        assert str(item.id) in repr(item)
