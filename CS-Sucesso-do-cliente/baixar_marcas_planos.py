"""
baixar_marcas_planos.py — a planilha de Marcas e Planos, viva.

O painel lia um `Marcas e Planos.xlsx` versionado no repositório, e ele estava
CONGELADO em abril de 2026: 16 abas, a última "Vesti 04-2026". A planilha de
verdade tem 30 abas e vai até novembro. A diferença aparece no dinheiro — a
Villon tem 2 linhas em abril (R$ 1.549) e 4 em novembro (R$ 2.557), e era por
isso que a Mensalidade Total da Trama Villon não fechava com a planilha
(Laura, 29/10/2026: "precisa dar 2557 mesmo").

Este script baixa a planilha atual e grava `marcas_planos_live.xlsx`, que o
build prefere quando existe. O arquivo é intermediário e fica fora do git: o
`Marcas e Planos.xlsx` versionado continua ali como rede de segurança para
quando a planilha estiver fora do ar.

Acesso: a planilha NÃO é pública. Vai pela service account de leitura de
planilhas, cuja chave o workflow grava a partir de um secret. O e-mail dela
nunca aparece no log — este repositório é público.

Rodar:  python3 baixar_marcas_planos.py
"""

from __future__ import annotations

import io
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).parent
OUT = ROOT / "marcas_planos_live.xlsx"
SHEET_ID = os.environ.get("MARCAS_SHEET_ID") or "1gfo0ORs4ccD0yn13eCuNxHM9USoGH_vjuzytcS1-QyQ"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly",
          "https://www.googleapis.com/auth/drive.readonly"]

CREDENCIAIS = [
    ("planilhas", os.environ.get("SHEETS_SA_FILE")),
    ("planilhas (alt)", os.environ.get("SHEETS_SA_ALT_FILE")),
    ("BigQuery", os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")),
    ("arquivo local", str(ROOT.parent / "CS" / "google_sa.json")),
]


def baixar() -> bytes | None:
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
    cab = {"User-Agent": "Mozilla/5.0"}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=cab), timeout=180) as r:
            dados = r.read()
        if dados[:2] == b"PK":
            print("[marcas] planilha baixada sem credencial (link público)")
            return dados
    except urllib.error.HTTPError as e:
        print(f"[marcas] link público respondeu HTTP {e.code}; tentando com a service account")

    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests
    except ImportError:
        print("[marcas] google-auth não instalado")
        return None

    tentou = False
    for apelido, caminho in CREDENCIAIS:
        if not caminho or not Path(caminho).exists():
            continue
        tentou = True
        try:
            creds = service_account.Credentials.from_service_account_file(caminho, scopes=SCOPES)
            creds.refresh(google.auth.transport.requests.Request())
            # O e-mail da SA NÃO vai para o log: este repositório é público.
            c = dict(cab, Authorization=f"Bearer {creds.token}")
            with urllib.request.urlopen(urllib.request.Request(url, headers=c), timeout=180) as r:
                dados = r.read()
        except Exception as e:
            print(f"[marcas] credencial {apelido}: {type(e).__name__}")
            continue
        if dados[:2] == b"PK":
            print(f"[marcas] planilha baixada com a credencial {apelido}")
            return dados
    if not tentou:
        print("[marcas] nenhuma credencial de service account encontrada")
    return None


def main() -> None:
    dados = baixar()
    if not dados:
        print("[marcas] sem planilha viva — o build cai no xlsx versionado, que é de abril/2026")
        return
    OUT.write_bytes(dados)
    print(f"[write] {OUT.name} ({len(dados)//1024} KB)")
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(dados), read_only=True)
        print(f"[marcas] {len(wb.sheetnames)} abas")
    except Exception:
        pass


if __name__ == "__main__":
    main()
