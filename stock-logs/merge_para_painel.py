#!/usr/bin/env python3
"""
Le o .csv que stock-logs.py acabou de gerar, agrega (por acao / por origem) e
soma como uma nova busca em dados.js -- o painel (index.html) le esse arquivo.

Cada rodada do workflow ADICIONA uma busca ao historico (nao substitui): times
diferentes podem consultar produtos diferentes e ver o resultado de todo mundo
no mesmo painel. MAX_BUSCAS corta as mais antigas pra o arquivo nao crescer
sem limite -- o .csv bruto de cada rodada fica como artefato do workflow run,
entao nada se perde de verdade, so' sai da vista no painel.

Uso:
    python3 merge_para_painel.py <csv> --company-id=... --product-code=... \
        --start=... --end=...
"""
import argparse
import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
DADOS_JS = ROOT / "dados.js"
MAX_BUSCAS = 200  # historico do painel; o csv de cada rodada fica no artefato


def main():
    p = argparse.ArgumentParser()
    p.add_argument("csv_path")
    p.add_argument("--company-id", required=True)
    p.add_argument("--product-code", required=True)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--triggered-by", default="")
    args = p.parse_args()

    rows = []
    with open(args.csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)

    por_acao, por_origem = {}, {}
    for r in rows:
        a = r.get("action") or "(vazio)"
        o = r.get("origin") or "(vazio)"
        por_acao[a] = por_acao.get(a, 0) + 1
        por_origem[o] = por_origem.get(o, 0) + 1

    busca = {
        "id": f"{args.company_id}_{args.product_code}-{args.start}-{args.end}",
        "companyId": args.company_id,
        "productCode": args.product_code,
        "periodoInicio": args.start,
        "periodoFim": args.end,
        "geradoEm": datetime.now(timezone.utc).isoformat(),
        "solicitadoPor": args.triggered_by,
        "totalLinhas": len(rows),
        "porAcao": por_acao,
        "porOrigem": por_origem,
        "rows": rows,
    }

    dados = {"geradoEm": busca["geradoEm"], "buscas": []}
    if DADOS_JS.exists():
        texto = DADOS_JS.read_text(encoding="utf-8")
        inicio = texto.find("{")
        fim = texto.rfind("}")
        if inicio != -1 and fim != -1:
            try:
                dados = json.loads(texto[inicio:fim + 1])
            except json.JSONDecodeError:
                pass  # dados.js corrompido/vazio -- comeca do zero em vez de travar a carga

    # busca nova primeiro; troca uma busca ja existente com o MESMO id (mesma
    # empresa+produto+periodo) em vez de duplicar
    dados["buscas"] = [b for b in dados.get("buscas", []) if b.get("id") != busca["id"]]
    dados["buscas"].insert(0, busca)
    dados["buscas"] = dados["buscas"][:MAX_BUSCAS]
    dados["geradoEm"] = busca["geradoEm"]

    DADOS_JS.write_text(
        "window.STOCK_LOGS_DADOS = " + json.dumps(dados, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"[merge] busca '{busca['id']}' ({len(rows)} linhas) -> {DADOS_JS.name} "
          f"({len(dados['buscas'])} buscas no historico)")


if __name__ == "__main__":
    main()
