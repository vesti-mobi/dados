import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from build_data import _canceladas


class CanceladasTest(unittest.TestCase):
    def setUp(self):
        self.hoje = date.today().isoformat()
        self.ambiente = {
            "10": {"ligado": False, "update": self.hoje, "nomePlanilha": "Cancelada"},
            "20": {"ligado": False, "update": self.hoje, "nomePlanilha": "Bloqueada"},
            "30": {"ligado": False, "update": self.hoje, "nomePlanilha": "Sem fatura"},
            "40": {"ligado": False, "update": self.hoje, "nomePlanilha": "Modulo ativo"},
        }
        self.status_faturas = {
            "10": {"status": "canceled", "fatura_id": "fat-10", "vencimento": self.hoje},
            "20": {"status": "pending", "fatura_id": "fat-20", "vencimento": self.hoje},
            "40": {"status": "canceled", "fatura_id": "fat-40", "vencimento": self.hoje},
        }

    def test_exige_modulo_desativado_e_fatura_cancelada(self):
        resultado = _canceladas(
            self.ambiente,
            {"40": {"domain_id": "40"}},
            {},
            [],
            self.status_faturas,
        )

        self.assertEqual(["10"], [item["domain_id"] for item in resultado])
        self.assertEqual("canceled", resultado[0]["faturaIuguStatus"])

    def test_fatura_em_aberto_impede_cancelamento_mesmo_com_status_antigo(self):
        resultado = _canceladas(
            self.ambiente,
            {},
            {},
            [{"domain_id": "10"}],
            self.status_faturas,
        )

        self.assertNotIn("10", [item["domain_id"] for item in resultado])

    def test_ausencia_de_fatura_nao_e_inferida_como_cancelamento(self):
        resultado = _canceladas(self.ambiente, {}, {}, [], {})

        self.assertEqual([], resultado)


if __name__ == "__main__":
    unittest.main()
