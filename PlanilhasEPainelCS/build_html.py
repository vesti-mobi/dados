"""Inline fictitious_data.js (ou dados reais) em index.html a partir de template.html.

Roda sempre a partir do template para que o build seja idempotente.
"""
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
template = BASE / 'template.html'
data = BASE / 'fictitious_data.js'
output = BASE / 'index.html'

html = template.read_text(encoding='utf-8')
js = data.read_text(encoding='utf-8') if data.exists() else ''
html = html.replace('/*FICT_DATA_INLINE*/', js)
output.write_text(html, encoding='utf-8')
print(f'index.html gerado com {len(js)} bytes de dados ({len(html)} total).')
