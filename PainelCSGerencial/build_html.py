import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import os
BASE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(BASE, 'dashboard_full_data.js'), 'r', encoding='utf-8') as f:
    data_js = f.read()

cs_team_path = os.path.join(BASE, 'cs_team_data.js')
cs_team_js = ''
if os.path.exists(cs_team_path):
    with open(cs_team_path, 'r', encoding='utf-8') as f:
        cs_team_js = f.read()

with open(os.path.join(BASE, 'template.html'), 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('/*INLINE_DATA*/', data_js + '\n' + cs_team_js)

with open(os.path.join(BASE, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html)

print(f"Written {len(html)//1024}KB")
