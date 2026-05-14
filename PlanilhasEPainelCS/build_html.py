"""Gera index.html a partir de template.html, inlineando real_data.js (HubSpot)."""
import pathlib
import sys

BASE = pathlib.Path(__file__).resolve().parent
template = BASE / 'template.html'
output = BASE / 'index.html'
real = BASE / 'real_data.js'

if not real.exists():
    print('ERRO: real_data.js nao existe. Rode `py fetch_hubspot.py` primeiro.', file=sys.stderr)
    sys.exit(1)

html = template.read_text(encoding='utf-8')
js = real.read_text(encoding='utf-8')
html = html.replace('/*DATA_INLINE*/', js)
output.write_text(html, encoding='utf-8')
print(f'index.html gerado ({len(js)} bytes de dados HubSpot).')
