from pydantic import BaseModel, field_validator
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from typing import Optional, List


# ── Item da Cotação ────────────────────────────────────────────────────────────

class ItemCotacaoCreate(BaseModel):
    descricao: str
    quantidade: int
    valor_unitario: Decimal
    valor_fechamento: Optional[Decimal] = None
    fornecedor: Optional[str] = None
    is_direct_supply: bool = False
    porcentagem_fornecedor: Optional[Decimal] = None
    frete_fornecedor: Optional[Decimal] = None

    @field_validator("quantidade")
    @classmethod
    def validate_quantidade(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Quantidade deve ser maior que 0")
        return v


class ItemCotacaoUpdate(BaseModel):
    descricao: Optional[str] = None
    quantidade: Optional[int] = None
    valor_unitario: Optional[Decimal] = None
    valor_fechamento: Optional[Decimal] = None
    fornecedor: Optional[str] = None

    @field_validator("quantidade")
    @classmethod
    def validate_quantidade(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("Quantidade deve ser maior que 0")
        return v


class ItemCotacaoSave(ItemCotacaoCreate):
    id: UUID


class ItemCotacaoResponse(BaseModel):
    id: UUID
    id_cotacao: UUID
    descricao: str
    quantidade: int
    valor_unitario: Decimal
    valor_fechamento: Optional[Decimal]
    fornecedor: Optional[str]
    is_direct_supply: bool
    porcentagem_fornecedor: Optional[Decimal]
    frete_fornecedor: Optional[Decimal]
    valor_total: Optional[Decimal] = None
    valor_total_fechamento: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Phase Update (PATCH /quotes/{id}/phase) ────────────────────────────────────

class PhaseUpdate(BaseModel):
    """Update one or more phases. All fields optional — only provided ones are changed."""
    # Sent
    status_enviada: Optional[bool] = None
    data_envio: Optional[date] = None
    # For Closing
    status_em_fechamento: Optional[bool] = None
    data_prevista_fechamento: Optional[date] = None
    # Closed
    status_fechada: Optional[bool] = None
    data_fechamento: Optional[date] = None
    valor_fechamento: Optional[Decimal] = None
    # Dropped
    status_caida: Optional[bool] = None
    data_queda: Optional[date] = None


# ── Cotação ────────────────────────────────────────────────────────────────────

class CotacaoCreate(BaseModel):
    id_loja: UUID
    id_vendedor: UUID
    numero_requisicao: Optional[str] = None
    b2b_company: Optional[str] = None
    cliente: str
    cnpj_cliente: Optional[str] = None
    data_cotacao: date
    data_validade: Optional[date] = None
    is_direct_billing: bool = False
    fornecedor: Optional[str] = None
    valor_total: Optional[Decimal] = None
    observacao: Optional[str] = None
    pct_imposto_lucky: Optional[Decimal] = None
    pct_imposto_btech: Optional[Decimal] = None
    # Envio de cotação
    data_entrega: Optional[date] = None
    previsao_entrega: Optional[date] = None
    forma_pagamento: Optional[str] = None
    detalhes_pagamento: Optional[str] = None
    prazo_pagamento: Optional[date] = None
    garantia: Optional[str] = None
    itens: List[ItemCotacaoCreate] = []


class CotacaoUpdate(BaseModel):
    itens: Optional[List[ItemCotacaoSave]] = None
    fase: Optional[PhaseUpdate] = None
    id_loja: Optional[UUID] = None
    id_vendedor: Optional[UUID] = None
    numero_requisicao: Optional[str] = None
    b2b_company: Optional[str] = None
    cliente: Optional[str] = None
    cnpj_cliente: Optional[str] = None
    data_cotacao: Optional[date] = None
    data_validade: Optional[date] = None
    is_direct_billing: Optional[bool] = None
    fornecedor: Optional[str] = None
    valor_total: Optional[Decimal] = None
    observacao: Optional[str] = None
    pct_imposto_lucky: Optional[Decimal] = None
    pct_imposto_btech: Optional[Decimal] = None
    # Envio de cotação
    data_entrega: Optional[date] = None
    previsao_entrega: Optional[date] = None
    forma_pagamento: Optional[str] = None
    detalhes_pagamento: Optional[str] = None
    prazo_pagamento: Optional[date] = None
    garantia: Optional[str] = None


class CotacaoResponse(BaseModel):
    id: UUID
    id_loja: UUID
    id_vendedor: UUID
    numero: Optional[int] = None
    numero_loja: Optional[int] = None
    numero_requisicao: Optional[str]
    b2b_company: Optional[str]
    cliente: str
    cnpj_cliente: Optional[str]
    data_cotacao: date
    data_validade: Optional[date]
    # Phases
    status_enviada: bool
    data_envio: Optional[date]
    status_em_fechamento: bool
    data_prevista_fechamento: Optional[date]
    status_fechada: bool
    data_fechamento: Optional[date]
    valor_fechamento: Optional[Decimal]
    status_caida: bool
    data_queda: Optional[date]
    # Other
    is_direct_billing: bool
    fornecedor: Optional[str]
    valor_total: Optional[Decimal]
    observacao: Optional[str]
    pct_imposto_lucky: Optional[Decimal]
    pct_imposto_btech: Optional[Decimal]
    # Envio de cotação
    data_entrega: Optional[date] = None
    previsao_entrega: Optional[date] = None
    forma_pagamento: Optional[str] = None
    detalhes_pagamento: Optional[str] = None
    prazo_pagamento: Optional[date] = None
    garantia: Optional[str] = None
    # Audit
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    # Relations
    itens: List[ItemCotacaoResponse] = []

    class Config:
        from_attributes = True


class CotacaoListResponse(BaseModel):
    items: List[CotacaoResponse]
    total: int
    page: int
    limit: int
    pages: int


# ── Convert (POST /quotes/{id}/convert) ───────────────────────────────────────

class ConversaoResponse(BaseModel):
    """Response after converting a cotacao to a pedido."""
    id_pedido: UUID
    id_cotacao: UUID
    message: str = "Cotação convertida em pedido com sucesso"
