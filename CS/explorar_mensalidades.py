"""
explorar_mensalidades.py — só OLHA a planilha de mensalidades.

Pedido da Laura em 29/10/2026: quando uma marca aparece na Bonificação sem
valor porque não tem mensalidade no Iugu, puxar o valor desta planilha —
"sempre da aba vesti e starter e sempre olhando no mês mais atual que tem lá".

Antes de escrever o leitor de verdade é preciso saber como ela é por dentro:
que abas existem, que colunas cada uma tem e como os meses estão organizados.
É só isso que este script faz.

O LOG DO ACTIONS É PÚBLICO. Então aqui sai o ESQUELETO — nome de aba, nome de
coluna, contagem de linhas — e nunca o conteúdo: nem nome de marca, nem valor,
nem o e-mail da service account.

Roda no workflow "Conferir BigQuery" com modo=mensalidades.
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
SA_JSON = Path(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or (ROOT / "google_sa.json"))
SHEET_ID = os.environ.get("MENS_SHEET_ID") or "1gfo0ORs4ccD0yn13eCuNxHM9USoGH_vjuzytcS1-QyQ"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly",
          "https://www.googleapis.com/auth/drive.readonly"]


def token_sa() -> str:
    if not SA_JSON.exists():
        raise RuntimeError("credencial da service account não encontrada")
    from google.oauth2 import service_account
    import google.auth.transport.requests
    creds = service_account.Credentials.from_service_account_file(str(SA_JSON), scopes=SCOPES)
    creds.refresh(google.auth.transport.requests.Request())
    # O e-mail da SA NÃO vai para o log: este repositório é público.
    return creds.token


def baixar_xlsx() -> bytes:
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
    cab = {"User-Agent": "Mozilla/5.0"}
    try:
        req = urllib.request.Request(url, headers=cab)
        with urllib.request.urlopen(req, timeout=120) as r:
            dados = r.read()
        if dados[:2] == b"PK":
            print("[mens] planilha baixada sem credencial (link público)")
            return dados
    except urllib.error.HTTPError as e:
        print(f"[mens] link público respondeu HTTP {e.code}; tentando com a service account")

    cab["Authorization"] = f"Bearer {token_sa()}"
    req = urllib.request.Request(url, headers=cab)
    with urllib.request.urlopen(req, timeout=120) as r:
        dados = r.read()
    if dados[:2] != b"PK":
        raise RuntimeError("a resposta não é um xlsx — a planilha não está compartilhada com a SA")
    print("[mens] planilha baixada com a service account")
    return dados


def main() -> None:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(baixar_xlsx()), data_only=True, read_only=True)
    print(f"\nABAS ({len(wb.sheetnames)}):")
    for n in wb.sheetnames:
        print("  " + n)

    for nome in wb.sheetnames:
        ws = wb[nome]
        linhas = 0
        cabecalho: list[str] = []
        for i, l in enumerate(ws.iter_rows(values_only=True)):
            if i == 0:
                cabecalho = [str(c).strip() if c is not None else "" for c in l]
            if l and any(c not in (None, "") for c in l):
                linhas += 1
            if i > 4000:
                break
        print(f"\n=== {nome} === {linhas} linhas com conteúdo")
        for i, c in enumerate(cabecalho):
            if c:
                print(f"   [{i}] {c}")
        # Uma amostra do TIPO de cada coluna, nunca do valor.
        amostra = None
        for i, l in enumerate(ws.iter_rows(min_row=2, max_row=6, values_only=True)):
            if l and any(c not in (None, "") for c in l):
                amostra = l
                break
        if amostra:
            tipos = [type(c).__name__ if c is not None else "-" for c in amostra[:24]]
            print("   tipos da 1ª linha: " + " ".join(tipos))


if __name__ == "__main__":
    main()
