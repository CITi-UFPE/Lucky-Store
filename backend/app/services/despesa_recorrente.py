"""Geracao das ocorrencias mensais de uma despesa recorrente.

Custo fixo se repete todo mes, e a escolha foi materializar cada mes como uma
despesa de verdade — nao um registro unico contado varias vezes. O motivo e
pratico: o aluguel de marco pode estar pago e o de abril nao, e maio pode ter
outro valor. Registro unico nao consegue dizer isso.

Materializar ate quando, porem, e o problema: a recorrencia nao tem fim ("ate
eu mandar parar"), e nao da para gerar linhas ate o infinito. A solucao e uma
JANELA: o sistema garante que existem ocorrencias ate MESES_A_FRENTE meses
adiante, e a janela anda sozinha conforme o tempo passa.

E ai vem a decisao que merece explicacao: isso roda na LEITURA. Nao existe
agendador nesta infra — o Railway sobe o processo e pronto —, entao um "job
mensal" precisaria de infra que nao temos, e um job no startup so rodaria em
deploy: ficar tres meses sem deploy significaria tres meses sem aluguel
lancado, e o Dashboard mostrando lucro maior que o real em silencio. Gerar na
leitura tem a propriedade que importa aqui: quem abrir o sistema em maio ve o
aluguel de maio, tenha havido deploy ou nao.

O preco e um GET que escreve, o que e feio e tem risco real: duas requisicoes
simultaneas tentam criar o mesmo mes. Quem resolve isso e o banco, nao este
codigo — o indice unico (recorrencia_id, competencia) da migration d1a2b3c4e5f6
faz a segunda tentativa falhar em vez de duplicar o aluguel. Por isso o INSERT
aqui e ON CONFLICT DO NOTHING: a corrida e esperada, e perde-la e o resultado
correto.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.despesa import Despesa

logger = logging.getLogger("app.despesa_recorrente")

#: Quantos meses adiante manter materializados, alem do mes corrente.
#: Dois cobrem o uso real — olhar o proximo mes e o seguinte na previsao — sem
#: encher a tabela de meses que ninguem vai olhar e que teriam de ser apagados
#: quando a recorrencia fosse encerrada.
MESES_A_FRENTE = 2


def primeiro_dia(d: date) -> date:
    return d.replace(day=1)


def somar_meses(competencia: date, n: int) -> date:
    """Avanca n meses a partir de uma competencia (sempre dia 1)."""
    total = competencia.month - 1 + n
    return date(competencia.year + total // 12, total % 12 + 1, 1)


def dia_no_mes(competencia: date, dia: int) -> date:
    """O dia pedido dentro daquele mes, sem estourar.

    Aluguel vence dia 31: abril nao tem dia 31, e fevereiro nao tem 30. Sem este
    ajuste a geracao levantaria ValueError e a despesa daquele mes simplesmente
    nao existiria — some do Dashboard sem nenhum erro visivel.
    """
    ultimo = calendar.monthrange(competencia.year, competencia.month)[1]
    return competencia.replace(day=min(dia, ultimo))


def _mae(db: Session, recorrencia_id) -> Optional[Despesa]:
    """A ocorrencia mais antiga do grupo — dela saem os dados das proximas.

    Nao e "a que tem recorrente=true": encerrar marca o grupo todo, e a mae
    precisa continuar identificavel depois disso.
    """
    return (
        db.query(Despesa)
        .filter(
            Despesa.recorrencia_id == recorrencia_id,
            Despesa.deleted_at.is_(None),
        )
        .order_by(Despesa.competencia.asc())
        .first()
    )


def garantir_ocorrencias(db: Session, hoje: Optional[date] = None) -> int:
    """Cria as ocorrencias que faltam de toda recorrencia ativa.

    Devolve quantas criou. Idempotente: rodar de novo nao cria nada.
    """
    hoje = hoje or date.today()
    limite = somar_meses(primeiro_dia(hoje), MESES_A_FRENTE)

    ativas = (
        db.query(Despesa.recorrencia_id)
        .filter(
            Despesa.recorrente.is_(True),
            Despesa.recorrencia_id.isnot(None),
            Despesa.deleted_at.is_(None),
        )
        .distinct()
        .all()
    )

    criadas = 0
    for (recorrencia_id,) in ativas:
        mae = _mae(db, recorrencia_id)
        if mae is None or mae.competencia is None:
            # Grupo sem mae legivel: nao invento uma competencia de origem, que
            # seria chutar em cima de dado financeiro.
            logger.warning("recorrencia %s sem ocorrencia de origem", recorrencia_id)
            continue

        # Inclui as EXCLUIDAS de proposito. Excluir o aluguel de novembro e uma
        # decisao ("esse mes nao teve"), e filtrar por deleted_at aqui faria a
        # geracao recriar novembro na proxima leitura — o vendedor exclui, a
        # tela recarrega, e a despesa esta la de volta sem ninguem ter feito
        # nada. Competencia que ja existiu uma vez nao nasce de novo sozinha.
        #
        # O indice unico continua parcial em deleted_at, entao lancar aquele mes
        # de novo NA MAO continua funcionando. O que nao acontece mais e a
        # ressurreicao automatica.
        existentes = {
            c for (c,) in db.query(Despesa.competencia).filter(
                Despesa.recorrencia_id == recorrencia_id,
            ).all()
        }

        # O dia do vencimento vem da mae. Sem data_prevista (mae lancada como
        # PAGO), cai no dia do pagamento; sem nenhum dos dois, dia 1.
        origem = mae.data_prevista or mae.data_pagamento or mae.competencia
        dia = origem.day

        competencia = somar_meses(mae.competencia, 1)
        while competencia <= limite:
            if competencia not in existentes:
                criadas += _inserir(db, mae, competencia, dia)
            competencia = somar_meses(competencia, 1)

    if criadas:
        db.commit()
    return criadas


def _inserir(db: Session, mae: Despesa, competencia: date, dia: int) -> int:
    """Insere uma ocorrencia, deixando o banco recusar a duplicata.

    A ocorrencia nasce SEMPRE como PREVISAO nao paga, mesmo quando a mae foi
    lancada como PAGO: o aluguel de maio nao esta pago so porque o de abril
    estava. Herdar o pagamento marcaria como quitado o que ninguem pagou, e o
    Dashboard passaria a contar saida que nao aconteceu.

    `recorrente = true` em TODA ocorrencia, e nao so na mae. Se a marca vivesse
    apenas na primeira, excluir aquele mes — coisa banal de fazer — apagaria a
    unica pista de que o grupo esta ativo, e a serie pararia de gerar em
    silencio. Aqui a marca significa "pertence a um grupo ativo", e encerrar
    limpa o grupo inteiro de uma vez.
    """
    resultado = db.execute(
        text(
            """
            INSERT INTO despesas (
                id, tipo, servico, destino, valor_previsto, data_prevista,
                status, observacoes, recorrencia_id, recorrente, competencia,
                created_by, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), 'PREVISAO', :servico, :destino, :valor, :data,
                'Não Pago', :observacoes, :recorrencia_id, true, :competencia,
                :created_by, now(), now()
            )
            ON CONFLICT DO NOTHING
            """
        ),
        {
            "servico": mae.servico,
            "destino": mae.destino or "",
            # O valor de referencia e o previsto; se a mae so tem valor pago,
            # ele vira a previsao dos proximos meses.
            "valor": mae.valor_previsto if mae.valor_previsto is not None else mae.valor_pago,
            "data": dia_no_mes(competencia, dia),
            "observacoes": mae.observacoes,
            "recorrencia_id": mae.recorrencia_id,
            "competencia": competencia,
            "created_by": mae.created_by,
        },
    )
    return resultado.rowcount or 0


def excluir_serie(db: Session, recorrencia_id) -> int:
    """Exclui a despesa recorrente inteira: toda copia que ainda nao foi paga.

    Devolve quantas ocorrencias foram excluidas.

    E o que "excluir" significa numa despesa recorrente. Quem clica em excluir
    cadastrou errado e quer aquilo fora — apagar so o mes aberto deixaria as
    outras onze copias do mesmo engano espalhadas pelo ano, uma por mes, para
    serem cacadas na mao.

    Diferente de `encerrar`, que e para o contrato que acabou: la o passado nao
    pago fica, porque "nao pagamos o aluguel de marco" e informacao. Aqui nao
    fica nada nao pago, porque a despesa inteira nao deveria existir.

    O que sobrevive e o que foi PAGO, em qualquer mes. Nao importa se o cadastro
    estava errado: se o dinheiro saiu, apagar o registro faria o caixa do mes
    fechado mudar sozinho. Esse mes o usuario decide um a um.
    """
    from datetime import datetime, timezone

    nao_pagas = (
        db.query(Despesa)
        .filter(
            Despesa.recorrencia_id == recorrencia_id,
            Despesa.deleted_at.is_(None),
            Despesa.status != "Pago",
            Despesa.tipo != "PAGO",
        )
        .all()
    )

    agora = datetime.now(timezone.utc)
    for d in nao_pagas:
        d.deleted_at = agora

    # Sem isto a geracao recria os meses excluidos na proxima leitura e a
    # despesa "excluida" reaparece inteira.
    db.query(Despesa).filter(
        Despesa.recorrencia_id == recorrencia_id,
    ).update({"recorrente": False}, synchronize_session=False)

    db.commit()
    return len(nao_pagas)


def encerrar(db: Session, recorrencia_id) -> int:
    """Para de gerar meses novos e remove o futuro que ainda nao aconteceu.

    Devolve quantas ocorrencias futuras foram removidas.

    O passado fica: aluguel de marco pago em marco e historico, e apagar
    mudaria o resultado de um mes ja fechado. O futuro nao pago sai, senao
    encerrar o contrato em maio deixaria junho e julho lancados como previsao —
    e o Dashboard continuaria prevendo uma despesa que nao existe mais.

    Ocorrencia futura JA PAGA tambem fica: se alguem adiantou o pagamento, o
    dinheiro saiu de verdade.
    """
    hoje_competencia = primeiro_dia(date.today())

    futuras = (
        db.query(Despesa)
        .filter(
            Despesa.recorrencia_id == recorrencia_id,
            Despesa.deleted_at.is_(None),
            Despesa.competencia > hoje_competencia,
            Despesa.status != "Pago",
            Despesa.tipo != "PAGO",
        )
        .all()
    )

    from datetime import datetime, timezone
    agora = datetime.now(timezone.utc)
    for d in futuras:
        d.deleted_at = agora

    db.query(Despesa).filter(
        Despesa.recorrencia_id == recorrencia_id,
        Despesa.deleted_at.is_(None),
    ).update({"recorrente": False}, synchronize_session=False)

    db.commit()
    return len(futuras)
