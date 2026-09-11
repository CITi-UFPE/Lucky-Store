"""Despesa recorrente: uma despesa de verdade por mes.

Custo fixo se repete todo mes — aluguel, salario, contador — mas cada despesa
era um registro solto com uma data so. Para o Dashboard mostrar o custo fixo em
tres meses, alguem cadastrava o aluguel tres vezes; esquecendo um mes, o
Dashboard mostrava lucro maior que o real e nao avisava nada.

A escolha foi materializar cada mes, e nao contar um registro varias vezes:
assim marco pode estar pago e abril nao, e maio pode ter outro valor.

O que este arquivo trava sao as decisoes que quebram em silencio se alguem
mexer sem saber por que estao ali. Os casos de comportamento foram medidos
contra Postgres real (ver a mensagem do commit); aqui ficam as regras que dao
para verificar sem banco, mais a forma da migration.
"""
import re
from datetime import date
from pathlib import Path

import pytest

from app.models.despesa import Despesa
from app.schemas.despesa import DespesaCreate, DespesaOut, DespesaUpdate
from app.services.despesa_recorrente import (
    MESES_A_FRENTE,
    dia_no_mes,
    primeiro_dia,
    somar_meses,
)

MIGRATION = "d1a2b3c4e5f6"
VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
FONTE_MIGRATION = (VERSOES / f"{MIGRATION}_despesa_recorrente.py").read_text(encoding="utf-8")
FONTE_SERVICO = (
    Path(__file__).resolve().parents[1] / "app" / "services" / "despesa_recorrente.py"
).read_text(encoding="utf-8")


class TestCalendario:
    """A aritmetica de meses, que e onde este tipo de coisa costuma errar."""

    def test_avanca_virando_o_ano(self):
        assert somar_meses(date(2026, 11, 1), 1) == date(2026, 12, 1)
        assert somar_meses(date(2026, 12, 1), 1) == date(2027, 1, 1)
        assert somar_meses(date(2026, 3, 1), 12) == date(2027, 3, 1)

    def test_competencia_e_sempre_o_dia_primeiro(self):
        """Duas ocorrencias do mesmo mes com dias diferentes precisam colidir no
        indice unico. Guardando o dia real, nao colidiriam."""
        assert primeiro_dia(date(2026, 9, 30)) == date(2026, 9, 1)

    @pytest.mark.parametrize("competencia,dia,esperado", [
        (date(2027, 2, 1), 31, date(2027, 2, 28)),   # fevereiro comum
        (date(2028, 2, 1), 31, date(2028, 2, 29)),   # fevereiro bissexto
        (date(2027, 4, 1), 31, date(2027, 4, 30)),   # mes de 30 dias
        (date(2027, 5, 1), 31, date(2027, 5, 31)),   # cabe inteiro
        (date(2027, 5, 1), 5, date(2027, 5, 5)),     # dia comum
    ])
    def test_vencimento_nao_estoura_em_mes_curto(self, competencia, dia, esperado):
        """Aluguel vence dia 31 e abril nao tem dia 31.

        Sem o ajuste, date() levanta ValueError no meio da geracao: a despesa
        daquele mes simplesmente nao existe, some do Dashboard, e nao aparece
        erro nenhum na tela.
        """
        assert dia_no_mes(competencia, dia) == esperado


class TestColunas:

    def test_a_despesa_comum_nao_vira_recorrente_por_acidente(self):
        """`recorrente` e NOT NULL com default false: toda despesa que ja existe
        e toda chamada que nao manda o campo continuam valendo como antes."""
        coluna = Despesa.__table__.columns["recorrente"]
        assert coluna.nullable is False
        assert coluna.default.arg is False

    def test_competencia_existe_e_e_opcional(self):
        """Opcional porque despesa nao recorrente nao tem mes de competencia —
        ela e o que e, na data que tem."""
        assert Despesa.__table__.columns["competencia"].nullable is True

    def test_o_grupo_tem_identificador(self):
        assert Despesa.__table__.columns["recorrencia_id"].nullable is True


class TestSchemas:

    def test_da_para_pedir_recorrencia_ao_criar(self):
        d = DespesaCreate(tipo="PREVISAO", servico="Aluguel", recorrente=True)
        assert d.recorrente is True

    def test_quem_nao_pede_nao_recebe(self):
        assert DespesaCreate(tipo="PAGO", servico="Cabo HDMI").recorrente is False

    def test_o_update_nao_mexe_na_recorrencia(self):
        """Desligar a recorrencia nao e virar um booleano: tambem decide o que
        fazer com os meses futuros ja lancados. Escondido num PUT, alguem
        desmarcaria achando que so para de repetir e apagaria previsoes junto.
        Por isso encerrar tem rota propria."""
        assert "recorrente" not in DespesaUpdate.model_fields

    def test_a_resposta_conta_o_que_a_tela_precisa(self):
        for campo in ("recorrente", "recorrencia_id", "competencia"):
            assert campo in DespesaOut.model_fields, campo


class TestGeracao:

    def test_a_janela_anda_sozinha(self):
        """A recorrencia nao tem fim, entao nao da para gerar ate o infinito: o
        sistema mantem uma janela a frente e ela avanca com o tempo."""
        assert MESES_A_FRENTE >= 1

    def test_a_ocorrencia_nasce_nao_paga(self):
        """O aluguel de maio nao esta pago so porque o de abril estava. Herdar o
        pagamento marcaria como quitado o que ninguem pagou, e o Dashboard
        contaria uma saida que nao aconteceu."""
        assert "'PREVISAO', :servico" in FONTE_SERVICO
        assert "'Não Pago', :observacoes" in FONTE_SERVICO

    def test_a_corrida_e_resolvida_pelo_banco(self):
        """A geracao roda na leitura, entao duas requisicoes simultaneas tentam
        criar o mesmo mes. Sem o ON CONFLICT, uma das duas duplica o aluguel."""
        assert "ON CONFLICT DO NOTHING" in FONTE_SERVICO

    def test_toda_ocorrencia_marca_o_grupo_como_ativo(self):
        """Se a marca vivesse so na primeira, excluir aquele mes — coisa banal —
        apagaria a unica pista de que o grupo esta ativo e a serie pararia de
        gerar em silencio."""
        assert ":recorrencia_id, true, :competencia" in FONTE_SERVICO

    def test_o_mes_excluido_nao_ressuscita(self):
        """Excluir o aluguel de novembro e uma decisao: "esse mes nao teve".

        Se a busca por competencias existentes filtrasse deleted_at, a geracao
        recriaria novembro na leitura seguinte — o vendedor exclui, a tela
        recarrega, e a despesa esta de volta sem ninguem ter feito nada. Foi
        exatamente o que acontecia; medido contra Postgres real antes e depois.
        """
        trecho = FONTE_SERVICO[
            FONTE_SERVICO.index("existentes = {"):FONTE_SERVICO.index("# O dia do vencimento")
        ]
        assert "deleted_at" not in trecho, (
            "a consulta das competencias existentes voltou a ignorar as "
            "excluidas — mes excluido vai ressuscitar sozinho"
        )

    def test_excluir_leva_todas_as_copias_nao_pagas(self):
        """Excluir uma recorrente e excluir A DESPESA, nao aquele mes.

        Quem clica em excluir cadastrou errado e quer aquilo fora. Apagar so a
        copia aberta deixaria as outras onze do mesmo engano espalhadas pelo
        ano, uma por mes, para serem cacadas na mao.

        O que sobrevive e o que foi PAGO, em qualquer mes: se o dinheiro saiu,
        apagar o registro faria o caixa de um mes ja fechado mudar sozinho.
        """
        trecho = FONTE_SERVICO[FONTE_SERVICO.index("def excluir_serie"):
                               FONTE_SERVICO.index("def encerrar")]
        assert 'Despesa.status != "Pago"' in trecho
        assert 'Despesa.tipo != "PAGO"' in trecho
        # Sem competencia no filtro: leva o nao pago de QUALQUER mes, e nao so
        # o futuro (essa e a diferenca para o encerrar).
        assert "competencia" not in trecho
        # E precisa desligar a recorrencia, senao a geracao recria tudo na
        # proxima leitura e a despesa "excluida" reaparece inteira.
        assert '{"recorrente": False}' in trecho

    def test_excluir_e_diferente_de_encerrar(self):
        """Encerrar e para o contrato que acabou: o passado nao pago fica,
        porque "nao pagamos o aluguel de marco" e informacao. Excluir e para o
        cadastro errado: nao fica nada nao pago."""
        encerrar = FONTE_SERVICO[FONTE_SERVICO.index("def encerrar"):]
        assert "Despesa.competencia > hoje_competencia" in encerrar

    def test_encerrar_preserva_o_que_ja_aconteceu(self):
        """Passado e historico: apagar mudaria o resultado de um mes fechado. E
        mes futuro JA PAGO tambem fica, porque o dinheiro saiu de verdade."""
        trecho = FONTE_SERVICO[FONTE_SERVICO.index("def encerrar"):]
        assert 'Despesa.competencia > hoje_competencia' in trecho
        assert 'Despesa.status != "Pago"' in trecho
        assert 'Despesa.tipo != "PAGO"' in trecho


class TestMigration:

    def test_encadeia_no_head_anterior(self):
        assert f"revision: str = '{MIGRATION}'" in FONTE_MIGRATION
        assert "down_revision: Union[str, None] = 'b8c9d0e1f2a3'" in FONTE_MIGRATION

    def test_o_indice_unico_impede_o_mes_repetido(self):
        """E ele que torna a geracao na leitura segura."""
        assert "CREATE UNIQUE INDEX IF NOT EXISTS uq_despesa_recorrencia_competencia" in FONTE_MIGRATION
        assert "ON despesas (recorrencia_id, competencia)" in FONTE_MIGRATION

    def test_o_indice_ignora_o_que_foi_excluido(self):
        """Parcial em deleted_at: excluir o aluguel de um mes tem que permitir
        lancar aquele mes de novo."""
        assert "WHERE recorrencia_id IS NOT NULL AND deleted_at IS NULL" in FONTE_MIGRATION

    def test_e_idempotente(self):
        assert FONTE_MIGRATION.count("IF NOT EXISTS") >= 4

    def test_nenhum_id_de_revision_repetido(self):
        """Ja aconteceu: id repetido faz o alembic detectar ciclo e recusar
        QUALQUER comando — deploy inteiro parado."""
        ids: dict[str, list[str]] = {}
        for arquivo in VERSOES.glob("*.py"):
            achado = re.search(
                r"^revision: str = ['\"]([^'\"]+)['\"]",
                arquivo.read_text(encoding="utf-8"), re.M,
            )
            if achado:
                ids.setdefault(achado.group(1), []).append(arquivo.name)
        repetidos = {r: n for r, n in ids.items() if len(n) > 1}
        assert not repetidos, f"revision id repetido: {repetidos}"
