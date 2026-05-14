"""Diagnostico 2: identifica as 32 purchases Alcance 13/05 faltantes
no invoices.js. Pra cada uma, tenta o endpoint /purchase/{id} e mostra
o status HTTP — pra ver se sao falhas individuais do fetch_purchase.
"""
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timedelta

WS = "6602349567016960"
URL_LIST = f"https://apivesti.vesti.mobi/payment/v1/starkbank/workspace/{WS}/purchases"
URL_DET = f"https://apivesti.vesti.mobi/payment/v1/starkbank/workspace/{WS}/purchase/{{pid}}"
TOKEN = os.environ["VESTIAPI_TOKEN"].strip()

def _get(url):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
        "User-Agent": "debug-missing/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")[:300]
        except Exception:
            pass
        return e.code, body
    except Exception as e:
        return -1, str(e)


def brt(s):
    if not s: return None
    try:
        return datetime.fromisoformat(s.replace("Z","+00:00")) + timedelta(hours=-3)
    except: return None


def list_all():
    out = []
    cursor = None
    while True:
        url = URL_LIST + (f"?cursor={cursor}" if cursor else "")
        _, resp = _get(url)
        msg = (resp or {}).get("message") or {}
        out.extend(msg.get("purchases") or [])
        cursor = msg.get("cursor") or None
        if not cursor: break
    return out


def main():
    api = list_all()
    api_13 = [p for p in api if (brt(p.get("created")) and brt(p.get("created")).date().isoformat()=="2026-05-13")]
    print(f"[api] {len(api_13)} purchases criadas em 13/05 BRT")

    # carrega invoices.js
    with open("relatoriostarkbank/invoices.js", encoding="utf-8") as f:
        t = f.read()
    import re
    inv = json.loads(re.match(r"window\.INVOICES\s*=\s*(.*);\s*$", t.strip(), re.DOTALL).group(1))
    inv_tids = {f.get("transactionId") for f in inv.get("faturas") or []}
    print(f"[invoices.js] {len(inv_tids)} tids totais")

    miss = [p for p in api_13 if p.get("id") not in inv_tids]
    print(f"\n=== {len(miss)} purchases de 13/05 BRT FALTANDO em invoices.js ===\n")
    for p in miss:
        pid = p.get("id")
        c = brt(p.get("created"))
        amt = (p.get("amount") or 0)/100
        st = p.get("status")
        # tenta o endpoint detalhe individual (mesmo que fetch_invoices.py chama)
        code, body = _get(URL_DET.format(pid=pid))
        ok = "OK" if (isinstance(body, dict) and body.get("success")) else "FALHA"
        print(f"  {pid}  {c.strftime('%H:%M')}  {st:>10}  R${amt:>9.2f}  detalhe={code} {ok}")
        if ok == "FALHA":
            print(f"    body: {str(body)[:200]}")


if __name__ == "__main__":
    main()
