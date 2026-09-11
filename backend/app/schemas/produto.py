from pydantic import BaseModel, field_validator, Field
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from typing import Optional, List, Any
from app.models.produto import PRODUTO_STATUSES


class ProdutoCreate(BaseModel):
    id_vendedor: UUID
    id_comprador: Optional[UUID] = None
    descricao: str
    observacao: Optional[str] = None
    quantidade: int = Field(gt=0)
    valor_projetado: Decimal = Field(gt=0)
    preco_custo: Optional[Decimal] = None
    valor_compra: Optional[Decimal] = None
    valor_venda: Optional[Decimal] = None
    fornecedor: Optional[str] = None
    is_direct_supply: bool = False
    porcentagem_fornecedor: Optional[Decimal] = None
    frete_fornecedor: Optional[Decimal] = None
    nota_fiscal_item: Optional[str] = None
    data_compra: Optional[date] = None
    prazo_entrega: Optional[date] = None
    data_recebimento: Optional[date] = None
    status: str = "To Buy"


class ProdutoUpdate(BaseModel):
    descricao: Optional[str] = None
    # String vazia limpa a anotacao; None a deixa como esta. E de proposito:
    # update_item usa exclude_none, entao None significa "nao mexi neste
    # campo" e nunca chega a apagar nada sem querer.
    observacao: Optional[str] = None
    preco_custo: Optional[Decimal] = None
    valor_compra: Optional[Decimal] = None
    valor_venda: Optional[Decimal] = None
    fornecedor: Optional[str] = None
    data_compra: Optional[date] = None
    prazo_entrega: Optional[date] = None
    data_recebimento: Optional[date] = None
    status: Optional[str] = None
    quantidade: Optional[int] = None
    valor_projetado: Optional[Decimal] = None
    sub_compras: Optional[List[Any]] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in PRODUTO_STATUSES:
            raise ValueError(f"Status inválido. Valores aceitos: {PRODUTO_STATUSES}")
        return v


class ProdutoStatusUpdate(BaseModel):
    new_status: str

    @field_validator("new_status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in PRODUTO_STATUSES:
            raise ValueError(f"Status inválido. Valores aceitos: {PRODUTO_STATUSES}")
        return v


class ProdutoResponse(BaseModel):
    id: UUID
    id_pedido: UUID
    id_vendedor: UUID
    id_comprador: Optional[UUID]
    descricao: str
    observacao: Optional[str] = None
    quantidade: int
    valor_projetado: Decimal
    preco_custo: Optional[Decimal]
    valor_compra: Optional[Decimal]
    valor_venda: Optional[Decimal]
    economia: Optional[Decimal]
    sub_compras: Optional[List[Any]] = None
    fornecedor: Optional[str]
    is_direct_supply: bool
    porcentagem_fornecedor: Optional[Decimal]
    frete_fornecedor: Optional[Decimal]
    nota_fiscal_item: Optional[str]
    data_compra: Optional[date]
    prazo_entrega: Optional[date]
    data_recebimento: Optional[date]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
