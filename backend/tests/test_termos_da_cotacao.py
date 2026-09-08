"""As condicoes da cotacao viajam junto com o pedido, para o documento da OS.

Previsao de entrega, forma e detalhes de pagamento e garantia sao campos da
COTACAO — o pedido nao tem nenhum deles. Ate agora so o timbrado da cotacao os
mostrava: o cliente fechava a compra vendo garantia e previsao de entrega, e a
ordem de servico chegava a ele sem nenhuma das duas.

Elas saem na resposta do pedido pela mesma porta do numero_cotacao, e pelo mesmo
motivo: o relacionamento ja e carregado com joinedload, entao imprimir uma folha
continua sendo uma requisicao e a listagem nao vira uma por linha.
"""
from pathlib import Path
from types import SimpleNamespace

from app.schemas.pedido import (
    PedidoResponse,
    PedidoListItemResponse,
    TermosCotacaoOut,
)
from app.services.pedido import _termos_da_cotacao

BACKEND = Path(__file__).resolve().parents[1]
SERVICO = BACKEND / "app" / "services" / "pedido.py"
ROTA = BACKEND / "app" / "api" / "routes" / "pedidos.py"


def _pedido(**termos):
    """Pedido de mentira com uma cotacao de origem — so os campos que importam."""
    padrao = dict(previsao_entrega=None, forma_pagamento=None,
                  detalhes_pagamento=None, garantia=None)
    padrao.update(termos)
    return SimpleNamespace(cotacao=SimpleNamespace(**padrao))


class TestExtracao:

    def test_devolve_os_quatro_termos(self):
        p = _pedido(previsao_entrega="2026-09-08", forma_pagamento="Credit Card",
                    detalhes_pagamento="3X", garantia="1 ANO")
        assert _termos_da_cotacao(p) == {
            "previsao_entrega": "2026-09-08",
            "forma_pagamento": "Credit Card",
            "detalhes_pagamento": "3X",
            "garantia": "1 ANO",
        }

    def test_pedido_criado_do_zero_nao_tem_termos(self):
        """Sem cotacao de origem nao ha o que herdar, e o bloco some do papel."""
        assert _termos_da_cotacao(SimpleNamespace(cotacao=None)) is None

    def test_cotacao_sem_termo_nenhum_nao_vira_objeto_vazio(self):
        """A tela so precisa saber "tem bloco" ou "nao tem". Um objeto com
        quatro nulos faria a OS imprimir uma caixa com quatro travessoes."""
        assert _termos_da_cotacao(_pedido()) is None

    def test_termo_so_com_espaco_nao_conta_como_preenchido(self):
        assert _termos_da_cotacao(_pedido(garantia="   ")) is None

    def test_um_termo_preenchido_ja_traz_o_bloco(self):
        termos = _termos_da_cotacao(_pedido(garantia="1 ANO"))
        assert termos is not None
        assert termos["garantia"] == "1 ANO"
        assert termos["previsao_entrega"] is None


class TestResposta:

    def test_o_campo_existe_nas_duas_respostas(self):
        """A OS e impressa a partir da LISTAGEM (pedidoListToOrder), nao do
        detalhe — se o campo faltar la, o bloco nunca aparece."""
        assert "termos_cotacao" in PedidoResponse.model_fields
        assert "termos_cotacao" in PedidoListItemResponse.model_fields

    def test_e_opcional_nos_dois(self):
        for schema in (PedidoResponse, PedidoListItemResponse):
            campo = schema.model_fields["termos_cotacao"]
            assert campo.default is None, schema.__name__

    def test_o_schema_carrega_os_quatro_campos(self):
        assert set(TermosCotacaoOut.model_fields) == {
            "previsao_entrega", "forma_pagamento", "detalhes_pagamento", "garantia",
        }

    def test_a_rota_de_listagem_repassa_o_campo(self):
        """PedidoListItemResponse e montado campo a campo na rota; sem esta
        linha o valor calculado no service nao chega na resposta."""
        assert 'termos_cotacao=getattr(p, "termos_cotacao", None),' in ROTA.read_text(encoding="utf-8")


class TestCarregamento:

    def test_a_cotacao_continua_vindo_no_joinedload(self):
        """Sem isto seria uma consulta extra por pedido na listagem — o mesmo
        motivo pelo qual numero_cotacao ja vinha por aqui."""
        assert "joinedload(Pedido.cotacao)" in SERVICO.read_text(encoding="utf-8")

    def test_todo_ponto_que_preenche_numero_cotacao_preenche_os_termos(self):
        """Os dois saem da mesma cotacao e servem ao mesmo documento. Um ponto
        que preencha so um dos dois imprime "Cotacao n 70" sem as condicoes."""
        fonte = SERVICO.read_text(encoding="utf-8")
        numeros = fonte.count("numero_cotacao = _numero_cotacao(")
        termos = fonte.count("termos_cotacao = _termos_da_cotacao(")
        assert numeros > 0
        assert numeros == termos, (
            f"{numeros} ponto(s) preenchem numero_cotacao e {termos} preenchem "
            "termos_cotacao; os dois saem da mesma cotacao"
        )
