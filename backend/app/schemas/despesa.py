from pydantic import BaseModel
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from typing import Optional, List


class PlanoParcelaItem(BaseModel):
    date: str
    value: Decimal


class DespesaCreate(BaseModel):
    tipo: str                              # 'PREVISAO' | 'PAGO'
    servico: str
    destino: str = ''
    valor_previsto: Optional[Decimal] = None
    data_prevista: Optional[date] = None
    status: Optional[str] = None          # 'Não Pago' | 'Pago'
    valor_pago: Optional[Decimal] = None
    data_pagamento: Optional[date] = None
    metodo_pagamento: Optional[str] = None
    parcelas: Optional[int] = None
    plano_parcelas: Optional[List[PlanoParcelaItem]] = None
    observacoes: Optional[str] = None
    # Custo fixo se repete todo mes. Marcando aqui, esta despesa vira a origem
    # de um grupo e o sistema passa a criar uma despesa por mes a partir dela.
    recorrente: bool = False


class DespesaUpdate(BaseModel):
    tipo: Optional[str] = None
    servico: Optional[str] = None
    destino: Optional[str] = None
    valor_previsto: Optional[Decimal] = None
    data_prevista: Optional[date] = None
    status: Optional[str] = None
    valor_pago: Optional[Decimal] = None
    data_pagamento: Optional[date] = None
    metodo_pagamento: Optional[str] = None
    parcelas: Optional[int] = None
    plano_parcelas: Optional[List[PlanoParcelaItem]] = None
    observacoes: Optional[str] = None
    # Ausente de proposito: ligar ou desligar a recorrencia nao e edicao de
    # campo, porque desligar tambem precisa decidir o que fazer com os meses
    # futuros ja lancados. Isso tem rota propria (POST .../encerrar-recorrencia).


class DespesaOut(BaseModel):
    id: UUID
    tipo: str
    servico: str
    destino: str
    valor_previsto: Optional[Decimal] = None
    data_prevista: Optional[date] = None
    status: Optional[str] = None
    valor_pago: Optional[Decimal] = None
    data_pagamento: Optional[date] = None
    metodo_pagamento: Optional[str] = None
    parcelas: Optional[int] = None
    plano_parcelas: Optional[List[PlanoParcelaItem]] = None
    observacoes: Optional[str] = None
    # A tela usa os tres para mostrar o selo de recorrente, dizer de que mes e
    # a ocorrencia e oferecer o encerrar apenas onde ele faz sentido.
    recorrente: bool = False
    recorrencia_id: Optional[UUID] = None
    competencia: Optional[date] = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
