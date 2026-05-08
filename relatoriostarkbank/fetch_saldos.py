"""
fetch_saldos.py — busca saldo Starkbank de cada workspace e gera saldos.js

Lê os workspaceIds presentes em dados.js e, pra cada um, chama:
  GET /payment/v1/starkbank/workspace/{id}/transactions?limit=1
A resposta tem `message.balance` (em centavos).

Saída: saldos.js com:
  window.SALDO_VESTIPAGO   — saldo da workspace central
  window.SALDOS            — { wsId: saldo_em_reais }
  window.SALDO_BY_COMPANY  — { companyId: saldo_em_reais }
  window.SALDO_TOTAL_MARCAS, SALDO_GERADO_EM
"""
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib import request, error

DIR = Path(__file__).parent
DADOS = DIR / 'dados.js'
OUT = DIR / 'saldos.js'

WS_VESTIPAGO = '4891441503404032'

TOKEN = os.environ.get('VESTI_API_TOKEN', '').strip()
if not TOKEN:
    tf = DIR / '.token'
    if tf.exists():
        TOKEN = tf.read_text(encoding='utf-8').strip()
if not TOKEN:
    print('ERRO: defina VESTI_API_TOKEN no env ou crie .token')
    sys.exit(1)

API = 'https://apivesti.vesti.mobi/payment/v1/starkbank/workspace/{wid}/transactions?limit=1'
HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Accept': 'application/json',
    'User-Agent': 'curl/8.0',
}


def get_balance(wid):
    req = request.Request(API.format(wid=wid), headers=HEADERS)
    try:
        with request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return (data.get('message') or {}).get('balance')
    except error.HTTPError as e:
        return f'HTTP{e.code}'
    except Exception as e:
        return f'ERRO {e}'


def main():
    text = DADOS.read_text(encoding='utf-8')
    m = re.search(r'window\.DADOS\s*=\s*(\{.*\})\s*;?\s*$', text, re.DOTALL)
    d = json.loads(m.group(1))

    ws_by_company, name_by_ws, name_by_company = {}, {}, {}
    for p in d.get('pedidos', []):
        cid = p.get('companyId'); wid = p.get('workspaceId'); n = p.get('nomeFantasia')
        if cid and wid:
            ws_by_company[cid] = wid
            name_by_ws[wid] = n
            name_by_company[cid] = n

    workspaces = sorted(set(ws_by_company.values()) | {WS_VESTIPAGO})
    print(f'Buscando saldo de {len(workspaces)} workspaces...')

    saldos = {}
    fails = 0
    for i, wid in enumerate(workspaces, 1):
        bal = get_balance(wid)
        if isinstance(bal, int):
            saldos[wid] = bal / 100.0
            print(f'  [{i:2}/{len(workspaces)}] {name_by_ws.get(wid,"VestiPago"):<28} ws={wid}  R${bal/100:>14,.2f}')
        else:
            saldos[wid] = None
            fails += 1
            print(f'  [{i:2}/{len(workspaces)}] {name_by_ws.get(wid,"VestiPago"):<28} ws={wid}  {bal}')
        time.sleep(0.15)

    saldo_central = saldos.get(WS_VESTIPAGO) or 0
    saldo_by_company = {cid: saldos.get(wid) for cid, wid in ws_by_company.items()}
    total_marcas = sum(v for k, v in saldos.items() if v is not None and k != WS_VESTIPAGO)

    out = (
        '// Saldos Starkbank (gerado por fetch_saldos.py)\n'
        f'window.SALDO_GERADO_EM = "{time.strftime("%Y-%m-%dT%H:%M:%S")}";\n'
        f'window.SALDO_VESTIPAGO = {saldo_central:.2f};\n'
        f'window.SALDO_TOTAL_MARCAS = {total_marcas:.2f};\n'
        f'window.SALDOS = {json.dumps(saldos, indent=2)};\n'
        f'window.SALDO_BY_COMPANY = {json.dumps(saldo_by_company, indent=2)};\n'
        f'window.WS_BY_COMPANY = {json.dumps(ws_by_company, indent=2)};\n'
    )
    OUT.write_text(out, encoding='utf-8')

    ok = sum(1 for v in saldos.values() if v is not None)
    print(f'\nOK: {ok}/{len(workspaces)} | Falhas: {fails}')
    print(f'Central VestiPago: R${saldo_central:,.2f}')
    print(f'Total marcas:      R${total_marcas:,.2f}')
    print(f'Gerado: {OUT}')


if __name__ == '__main__':
    main()
