"""
fetch_saldos.py — busca saldo Starkbank da workspace central VestiPago.

Chama a API Vesti:
  GET /payment/v1/starkbank/workspace/{id}/transactions?limit=1
A resposta tem `message.balance` (em centavos) — saldo atual.

Saída: saldos.js  ->  window.SALDO_VESTIPAGO + atualizado_em
"""
import json
import os
import sys
import time
from pathlib import Path
from urllib import request, error

DIR = Path(__file__).parent
OUT = DIR / 'saldos.js'

# Workspace central VestiPago (única acessível pelo token atual)
WS_VESTIPAGO = '4891441503404032'

TOKEN = os.environ.get('VESTI_API_TOKEN', '').strip()
if not TOKEN:
    tf = DIR / '.token'
    if tf.exists():
        TOKEN = tf.read_text(encoding='utf-8').strip()
if not TOKEN:
    print('ERRO: defina VESTI_API_TOKEN no env ou crie .token com o bearer.')
    sys.exit(1)

API = f'https://apivesti.vesti.mobi/payment/v1/starkbank/workspace/{WS_VESTIPAGO}/transactions?limit=1'


def main():
    req = request.Request(API, headers={
        'Authorization': f'Bearer {TOKEN}',
        'Accept': 'application/json',
        'User-Agent': 'curl/8.0',
    })
    try:
        with request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except error.HTTPError as e:
        print(f'ERRO HTTP {e.code}: {e.read().decode("utf-8", errors="ignore")[:300]}')
        sys.exit(1)

    msg = data.get('message') or {}
    balance_cents = msg.get('balance')
    if balance_cents is None:
        print('ERRO: resposta sem campo balance')
        sys.exit(1)

    balance = balance_cents / 100.0
    last = (msg.get('transactions') or [{}])[0]
    last_at = last.get('created') or ''

    out = (
        '// Saldo Starkbank workspace central VestiPago (gerado por fetch_saldos.py)\n'
        f'window.SALDO_VESTIPAGO = {balance:.2f};\n'
        f'window.SALDO_GERADO_EM = "{time.strftime("%Y-%m-%dT%H:%M:%S")}";\n'
        f'window.SALDO_ULTIMA_TX = "{last_at}";\n'
    )
    OUT.write_text(out, encoding='utf-8')
    print(f'Saldo VestiPago: R${balance:,.2f}')
    print(f'Última tx em:    {last_at}')
    print(f'Gerado:          {OUT}')


if __name__ == '__main__':
    main()
