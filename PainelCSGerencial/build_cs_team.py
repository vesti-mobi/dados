"""Consolida deals do HubSpot (3 CSs) + dados de churn/metas da planilha, gera cs_team_data.js."""
import json, glob, os, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OWNERS = {
    '80223755': 'Luana',
    '183994756': 'Thamiris',
    '78290915': 'Gabriella',
}

PROD_RULES = [
    ('Oraculo', re.compile(r'orácul|oracul', re.I)),
    ('Filial', re.compile(r'filial|filia[il]', re.I)),
    ('Upgrade', re.compile(r'upgrade|up\s*grade', re.I)),
    ('Reativacao', re.compile(r'reativa', re.I)),
    ('Plataforma', re.compile(r'plataforma|plano\s*pro', re.I)),
    ('Agente', re.compile(r'agente', re.I)),
    ('Integracao', re.compile(r'integra', re.I)),
    ('Projeto Especial', re.compile(r'projeto\s*especial|projeto', re.I)),
    ('Nova Loja', re.compile(r'nova\s*loja', re.I)),
]

def classify(name: str) -> str:
    name = name or ''
    for label, rx in PROD_RULES:
        if rx.search(name):
            return label
    return 'Outro'

def load_all():
    files = sorted(glob.glob(r'C:\Users\adria\.claude\projects\C--WINDOWS-system32\2c8cfc0c-77f9-4227-ba5e-fe8fd78b6c05\tool-results\mcp-claude_ai_HubSpot-search_crm_objects-*.txt'))
    seen = set()
    deals = []
    for fp in files:
        with open(fp, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        data = json.loads(raw[0]['text'])
        for r in data['results']:
            did = r['id']
            if did in seen:
                continue
            seen.add(did)
            p = r['properties']
            owner = p.get('hubspot_owner_id')
            if owner not in OWNERS:
                continue
            deals.append({
                'id': did,
                'cs': OWNERS[owner],
                'name': p.get('dealname', ''),
                'amount': float(p['amount']) if p.get('amount') else 0.0,
                'won': p.get('hs_is_closed_won') == 'true',
                'lost': p.get('hs_is_closed_lost') == 'true',
                'create': (p.get('createdate') or '')[:10],
                'close': (p.get('closedate') or '')[:10],
                'produto': classify(p.get('dealname', '')),
                'pipeline': p.get('pipeline', ''),
            })
    return deals

# Churn da planilha (mes corrente: Jan-Abr/2026)
CHURN = [
    {'mes':'2026-01','marca':'Moda Pink','produto':'Plataforma','valor':759.00,'cs':'Thamiris','obs':'Problemas integracao, foi pra NuvemShop'},
    {'mes':'2026-01','marca':'BluBetty','produto':'Plataforma','valor':1680.00,'cs':'Thamiris','obs':'Encerrou atividades'},
    {'mes':'2026-01','marca':'Malvada','produto':'Plataforma','valor':831.00,'cs':'Thamiris','obs':'Unificou as duas lojas'},
    {'mes':'2026-01','marca':'Zafira','produto':'Plataforma','valor':1100.00,'cs':'Thamiris','obs':'Nao conseguiu implantar'},
    {'mes':'2026-01','marca':'Nega Jeans Varejo','produto':'Filial','valor':410.00,'cs':'Luana','obs':'Sem equipe pra tocar'},
    {'mes':'2026-02','marca':'Grupo NTK','produto':'Filial','valor':750.00,'cs':'Thamiris','obs':''},
    {'mes':'2026-02','marca':'Phama Jeans','produto':'Plataforma','valor':256.00,'cs':'Thamiris','obs':''},
    {'mes':'2026-02','marca':'Vitoria Fashion','produto':'Filial','valor':410.00,'cs':'Thamiris','obs':''},
    {'mes':'2026-02','marca':'Martina Franca','produto':'Plataforma','valor':1100.00,'cs':'Thamiris','obs':''},
    {'mes':'2026-02','marca':'Kaessi','produto':'Filial','valor':410.00,'cs':'Luana','obs':''},
    {'mes':'2026-04','marca':'BZ Concept','produto':'Ag. Atendimento','valor':480.00,'cs':'Luana','obs':''},
    {'mes':'2026-04','marca':'BZ Concept','produto':'Plataforma','valor':1100.00,'cs':'Luana','obs':''},
    {'mes':'2026-04','marca':'Groovy','produto':'Assistente Vendedor','valor':2420.00,'cs':'Thamiris','obs':''},
    {'mes':'2026-04','marca':'Groovy','produto':'Oraculo','valor':0.00,'cs':'Thamiris','obs':''},
    {'mes':'2026-04','marca':'Burg Company','produto':'Plataforma','valor':631.00,'cs':'Luana','obs':''},
    {'mes':'2026-04','marca':'Pietra Confeccoes','produto':'Plataforma','valor':1100.00,'cs':'','obs':''},
    {'mes':'2026-04','marca':'Aero Summer','produto':'Oraculo','valor':1600.00,'cs':'Thamiris','obs':''},
]

# Metas semanais alcancadas
METAS = [
    {'mes':'2026-01','meta':10000.00,'realizado':8540.99},
    {'mes':'2026-02','meta':15000.00,'realizado':19068.00},
    {'mes':'2026-03','meta':None,'realizado':13123.00},
    {'mes':'2026-04','meta':None,'realizado':3839.99},
]

def main():
    deals = load_all()
    out = {
        'OWNERS_MAP': OWNERS,
        'DEALS_CS': deals,
        'CHURN_CS': CHURN,
        'METAS_CS': METAS,
    }
    js = 'var CS_TEAM_DATA = ' + json.dumps(out, ensure_ascii=False) + ';'
    with open(r'C:\Users\adria\PainelCSGerencial\cs_team_data.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'OK - {len(deals)} deals, {len(CHURN)} churns, {len(METAS)} metas')
    # quick stats
    from collections import Counter, defaultdict
    by_cs = Counter(d['cs'] for d in deals)
    by_cs_won = Counter(d['cs'] for d in deals if d['won'])
    by_prod = Counter(d['produto'] for d in deals if d['won'])
    print('Deals por CS:', dict(by_cs))
    print('Won por CS:', dict(by_cs_won))
    print('Won por produto:', dict(by_prod))

if __name__ == '__main__':
    main()
