from pydantic import BaseModel, field_validator, model_validator
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from typing import Optional, List, Any
from app.schemas.produto import ProdutoResponse


VALID_STATUSES = [
    "To Buy", "Bought", "Received", "To Invoice",
    "Invoiced and Received", "Invoiced and Awaiting Receipt",
    "To Pack", "Ready for Delivery", "Out for Delivery",
    "Delivered", "Delayed", "Cancelled",
]

VALID_TRANSITIONS: dict[str, list[str]] = {
    "To Buy":                        ["Bought", "Cancelled"],
    "Bought":                        ["Received", "Cancelled"],
    "Received":                      ["To Invoice", "Cancelled"],
    "To Invoice":                    ["Invoiced and Received", "Invoiced and Awaiting Receipt", "Cancelled"],
    "Invoiced and Received":         ["To Pack", "Cancelled"],
    "Invoiced and Awaiting Receipt": ["Invoiced and Received", "To Pack", "Cancelled"],
    "To Pack":                       ["Ready for Delivery", "Cancelled"],
    "Ready for Delivery":            ["Out for Delivery", "Delayed", "Cancelled"],
    "Out for Delivery":              ["Delivered", "Delayed", "Cancelled"],
    "Delivered":                     [],
    "Delayed":                       ["Out for Delivery", "Cancelled"],
    "Cancelled":                     [],
}


# ── Forma de pagamento ────────────────────────────────────────────────────────

class FormaPagamentoIn(BaseModel):
    forma: str


class FormaPagamentoOut(BaseModel):
    id: UUID
    forma: str

    class Config:
        from_attributes = True


# ── Frete ─────────────────────────────────────────────────────────────────────

class FreteCreate(BaseModel):
    entregador: Optional[str] = None
    valor: Decimal
    data_frete: date
    pago: bool = False


class FretePagoUpdate(BaseModel):
    pago: bool


class FreteOut(BaseModel):
    id: UUID
    entregador: Optional[str]
    valor: Decimal
    data_frete: date
    pago: bool = False

    class Config:
        from_attributes = True


# ── Custo ─────────────────────────────────────────────────────────────────────

class CustoPedidoIn(BaseModel):
    custo_produto_inicial: Optional[Decimal] = None
    custo_produto_final: Optional[Decimal] = None
    custo_servico: Optional[Decimal] = None
    brinde: Optional[Decimal] = None
    pct_imposto_compra: Optional[Decimal] = None
    imposto_compra: Optional[Decimal] = None
    pct_imposto_venda: Optional[Decimal] = None
    imposto_venda: Optional[Decimal] = None
    pct_custo_credito: Optional[Decimal] = None
    custo_credito: Optional[Decimal] = None
    pct_custo_debito: Optional[Decimal] = None
    custo_debito: Optional[Decimal] = None
    custo_boleto: Optional[Decimal] = None


class CustoPedidoOut(CustoPedidoIn):
    id: UUID

    class Config:
        from_attributes = True


# ── Pedido ────────────────────────────────────────────────────────────────────

class PedidoCreate(BaseModel):
    id_loja: UUID
    id_vendedor: UUID
    id_cotacao: Optional[UUID] = None
    # nome_cliente e a EMPRESA (vai para clientes.nome, junto com o CNPJ);
    # contato_cliente e a pessoa dentro dela.
    nome_cliente: str
    contato_cliente: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    numero_os: Optional[str] = None
    numero_nf: Optional[str] = None
    numero_oc: Optional[str] = None
    data_pedido: date
    data_entrega: date
    status: str = "To Buy"
    is_rma: bool = False
    is_cancelled: bool = False
    is_direct_billing: bool = False
    valor_venda: Optional[Decimal] = None
    parcelas: Optional[int] = None
    observacao: Optional[str] = None
    fornecedor_principal: Optional[str] = None
    nota_fiscal_fornecedor: Optional[str] = None
    formas_pagamento: List[FormaPagamentoIn] = []
    custo: Optional[CustoPedidoIn] = None
    data_pagamento: Optional[date] = None
    multa: Optional[Decimal] = None
    juros: Optional[Decimal] = None
    forma_pagamento_efetiva: Optional[str] = None
    num_parcelas_efetivas: Optional[int] = None
    plano_parcelas: Optional[List[Any]] = None
    plano_parcelas_pedido: Optional[List[Any]] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"Status inválido. Valores aceitos: {VALID_STATUSES}")
        return v


class PedidoUpdate(BaseModel):
    id_loja: Optional[UUID] = None
    id_vendedor: Optional[UUID] = None
    id_cliente: Optional[UUID] = None
    contato_cliente: Optional[str] = None
    numero_os: Optional[str] = None
    numero_nf: Optional[str] = None
    numero_oc: Optional[str] = None
    data_pedido: Optional[date] = None
    data_entrega: Optional[date] = None
    is_rma: Optional[bool] = None
    is_direct_billing: Optional[bool] = None
    valor_venda: Optional[Decimal] = None
    parcelas: Optional[int] = None
    observacao: Optional[str] = None
    fornecedor_principal: Optional[str] = None
    nota_fiscal_fornecedor: Optional[str] = None
    formas_pagamento: Optional[List[FormaPagamentoIn]] = None
    custo: Optional[CustoPedidoIn] = None
    data_pagamento: Optional[date] = None
    multa: Optional[Decimal] = None
    juros: Optional[Decimal] = None
    forma_pagamento_efetiva: Optional[str] = None
    num_parcelas_efetivas: Optional[int] = None
    plano_parcelas: Optional[List[Any]] = None
    plano_parcelas_pedido: Optional[List[Any]] = None


class StatusChangeRequest(BaseModel):
    new_status: str
    reason: Optional[str] = None

    @field_validator("new_status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"Status inválido. Valores aceitos: {VALID_STATUSES}")
        return v


class StatusHistoryOut(BaseModel):
    id: UUID
    old_status: Optional[str]
    new_status: str
    changed_by: UUID
    changed_at: datetime
    reason: Optional[str]

    class Config:
        from_attributes = True


class PedidoResponse(BaseModel):
    id: UUID
    id_loja: UUID
    id_vendedor: UUID
    id_cliente: UUID
    # Indice da cotacao que gerou este pedido; None quando ele foi criado do
    # zero. Vai para o cabecalho do documento impresso.
    numero_cotacao: Optional[int] = None
    contato_cliente: Optional[str] = None
    numero_os: str
    numero_nf: Optional[str]
    numero_oc: Optional[str]
    data_pedido: date
    data_entrega: date
    status: str

    @model_validator(mode='after')
    def auto_delayed(self) -> 'PedidoResponse':
        if self.status not in _FINAL_STATUSES and self.data_entrega < date.today():
            self.status = "Delayed"
        return self
    is_rma: Optional[bool]
    is_cancelled: Optional[bool]
    is_direct_billing: Optional[bool]
    valor_venda: Optional[Decimal]
    parcelas: Optional[int]
    observacao: Optional[str]
    fornecedor_principal: Optional[str]
    nota_fiscal_fornecedor: Optional[str]
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    economia: Optional[Decimal] = None
    formas_pagamento: List[FormaPagamentoOut] = []
    custo: Optional[CustoPedidoOut] = None

    class Config:
        from_attributes = True


class PedidoDetailResponse(PedidoResponse):
    status_history: List[StatusHistoryOut] = []


_FINAL_STATUSES = {"Delivered", "Cancelled", "Delayed"}


class PedidoListItemResponse(BaseModel):
    id: UUID
    id_cotacao: Optional[UUID] = None
    numero_cotacao: Optional[int] = None
    contato_cliente: Optional[str] = None
    numero_os: str
    data_pedido: date
    data_entrega: date
    status: str

    @model_validator(mode='after')
    def auto_delayed(self) -> 'PedidoListItemResponse':
        if self.status not in _FINAL_STATUSES and self.data_entrega < date.today():
            self.status = "Delayed"
        return self
    is_rma: Optional[bool] = None
    is_cancelled: Optional[bool] = None
    is_direct_billing: Optional[bool] = None
    valor_venda: Optional[Decimal] = None
    parcelas: Optional[int] = None
    nome_cliente: Optional[str] = None
    cnpj_cliente: Optional[str] = None
    nome_loja: Optional[str] = None
    nome_vendedor: Optional[str] = None
    numero_oc: Optional[str] = None
    numero_nf: Optional[str] = None
    nota_fiscal_fornecedor: Optional[str] = None
    observacao: Optional[str] = None
    fornecedor_principal: Optional[str] = None
    formas_pagamento: List[FormaPagamentoOut] = []
    fretes: List[FreteOut] = []
    produtos: List[ProdutoResponse] = []
    custo: Optional[CustoPedidoOut] = None
    data_pagamento: Optional[date] = None
    multa: Optional[Decimal] = None
    juros: Optional[Decimal] = None
    forma_pagamento_efetiva: Optional[str] = None
    num_parcelas_efetivas: Optional[int] = None
    plano_parcelas: Optional[List[Any]] = None
    plano_parcelas_pedido: Optional[List[Any]] = None
    valor_total_estornado: Optional[Decimal] = None

    class Config:
        from_attributes = True


class PedidoListResponse(BaseModel):
    items: List[PedidoListItemResponse]
    total: int
    page: int
    limit: int
    pages: int


class FinancialsOut(BaseModel):
    custo_total: Decimal
    lucro_liquido: Optional[Decimal]
    margem_bruta_pct: Optional[Decimal]


class CustoComFinancialsOut(CustoPedidoOut):
    financials: FinancialsOut
