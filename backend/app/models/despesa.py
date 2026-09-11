import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, String, Integer, Date, DateTime, Text, Numeric, ForeignKey  # type: ignore[import]
from sqlalchemy.dialects.postgresql import UUID, JSONB  # type: ignore[import]
from app.database import Base


class Despesa(Base):
    __tablename__ = "despesas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tipo = Column(String(10), nullable=False)          # 'PREVISAO' | 'PAGO'
    servico = Column(String(200), nullable=False)
    destino = Column(String(200), nullable=False, default='')
    valor_previsto = Column(Numeric(12, 2), nullable=True)
    data_prevista = Column(Date, nullable=True)
    status = Column(String(20), nullable=True)         # 'Não Pago' | 'Pago'
    valor_pago = Column(Numeric(12, 2), nullable=True)
    data_pagamento = Column(Date, nullable=True)
    metodo_pagamento = Column(String(50), nullable=True)
    parcelas = Column(Integer, nullable=True)
    plano_parcelas = Column(JSONB, nullable=True)      # [{"date": "yyyy-mm-dd", "value": 0.00}]
    observacoes = Column(Text, nullable=True)

    # ── Recorrencia ───────────────────────────────────────────────────────────
    # Custo fixo se repete todo mes. Em vez de um registro contado varias vezes,
    # cada mes e uma despesa de verdade: assim o aluguel de marco pode estar
    # pago e o de abril nao, e um mes pode ter valor diferente.
    #
    # `recorrencia_id` agrupa as ocorrencias — a primeira leva o proprio id.
    # `recorrente` diz se o grupo ainda gera meses novos; encerrar e por false,
    # e o que ja existe fica, porque e historico.
    # `competencia` e o mes da ocorrencia, sempre no dia 1. Nao da para usar
    # data_prevista no lugar: o dia do mes varia (31 vira 30 em abril) e a data
    # pode ser editada depois, o que quebraria a unicidade que impede duplicar.
    recorrencia_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    recorrente = Column(Boolean, nullable=False, default=False)
    competencia = Column(Date, nullable=True)

    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<Despesa {self.tipo} {self.servico}>"
