import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import Column, String, Integer, Date, DateTime, Text, Numeric, ForeignKey, CheckConstraint, Boolean  # type: ignore[import]
from sqlalchemy.dialects.postgresql import UUID, JSONB  # type: ignore[import]
from sqlalchemy.orm import relationship
from app.database import Base

PRODUTO_STATUSES = [
    "To Buy", "Bought", "In Stock",
    "Pending", "To Purchase", "Received",
    "Ready", "Shipped", "Delivered", "Delayed", "Cancelled",
]


class Produto(Base):
    __tablename__ = "produtos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_pedido = Column(UUID(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False)
    id_vendedor = Column(UUID(as_uuid=True), ForeignKey("vendedores.id"), nullable=False)
    id_comprador = Column(UUID(as_uuid=True), ForeignKey("vendedores.id"), nullable=True)

    descricao = Column(Text, nullable=False)
    quantidade = Column(Integer, nullable=False)

    valor_projetado = Column(Numeric(12, 2), nullable=False)
    preco_custo = Column(Numeric(12, 2), nullable=True)
    valor_compra = Column(Numeric(12, 2), nullable=True)
    # Por quanto o item foi VENDIDO — preco unitario, como na cotacao.
    #
    # Existe porque nao havia onde guardar isso. A coluna "Valor de venda" do
    # documento da OS lia `valor_projetado`, que e o CUSTO projetado, e o preco
    # do cliente ficava emprestado em `valor_compra` ate o item ser comprado —
    # quando aquele campo era sobrescrito pelo valor pago ao fornecedor e o
    # preco de venda sumia sem deixar rastro.
    valor_venda = Column(Numeric(12, 2), nullable=True)
    economia = Column(Numeric(12, 2), nullable=True)

    sub_compras = Column(JSONB, nullable=True)

    # Anotacoes do item, escritas na tela de Produtos. Text pelo mesmo motivo
    # da observacao do pedido e da cotacao: e texto livre e nao deve ter teto.
    observacao = Column(Text, nullable=True)

    fornecedor = Column(Text, nullable=True)
    is_direct_supply = Column(Boolean, nullable=False, default=False)
    porcentagem_fornecedor = Column(Numeric(5, 2), nullable=True)
    frete_fornecedor = Column(Numeric(12, 2), nullable=True)
    nota_fiscal_item = Column(String(100), nullable=True)
    data_compra = Column(Date, nullable=True)
    prazo_entrega = Column(Date, nullable=True)
    data_recebimento = Column(Date, nullable=True)

    status = Column(String(50), nullable=False, default="Pending")

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    pedido = relationship("Pedido", back_populates="produtos")
    vendedor = relationship("Vendedor", foreign_keys=[id_vendedor], back_populates="produtos_vendidos")
    comprador = relationship("Vendedor", foreign_keys=[id_comprador], back_populates="produtos_comprados")

    def __repr__(self):
        return f"<Produto {self.descricao[:30]} status={self.status}>"
