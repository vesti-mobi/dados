"""Gera index.html a partir de template.html.

Prefere real_data.js (dados reais das planilhas) se existir; caso contrario,
usa fictitious_data.js (placeholder).
"""
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
template = BASE / 'template.html'
output = BASE / 'index.html'
real = BASE / 'real_data.js'
fict = BASE / 'fictitious_data.js'

src = real if real.exists() else fict
src_kind = 'real_data.js' if real.exists() else 'fictitious_data.js'

html = template.read_text(encoding='utf-8')
js = src.read_text(encoding='utf-8') if src.exists() else ''
html = html.replace('/*DATA_INLINE*/', js)
output.write_text(html, encoding='utf-8')
print(f'index.html gerado usando {src_kind} ({len(js)} bytes de dados).')
