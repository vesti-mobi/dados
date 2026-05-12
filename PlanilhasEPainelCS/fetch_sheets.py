"""Le as 3 planilhas Google Sheets de Reunioes CS e gera real_data.js.

Saida tem o mesmo schema que fictitious_data.js (variavel DATA).

Agregacao semanal: agrupa por semana ISO (segunda-feira como inicio).
"Negocio fechado" = Resultado em {Fechou negocio, Upgrade, Reativacao}.
"""
import json, sys, io, pathlib, datetime
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

BASE = pathlib.Path(__file__).resolve().parent
SA_PATH = BASE.parent / 'PainelCSGerencial' / 'google_sa.json'
URLS_PATH = BASE / 'sheets_urls.json'
OUT_PATH = BASE / 'real_data.js'

FECHOU = {'Fechou negocio', 'Fechou negócio', 'Upgrade', 'Reativacao', 'Reativação'}

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']


def get_service():
    creds = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    return build('sheets', 'v4', credentials=creds)


def parse_date(raw):
    """Aceita 'dd/mm/yyyy', 'yyyy-mm-dd' ou serial number do Sheets."""
    if raw is None or raw == '':
        return None
    raw = str(raw).strip()
    if not raw:
        return None
    # Serial number do Google Sheets (dias desde 1899-12-30)
    try:
        n = float(raw)
        epoch = datetime.date(1899, 12, 30)
        return epoch + datetime.timedelta(days=int(n))
    except ValueError:
        pass
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d/%m/%y'):
        try:
            return datetime.datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def week_start(d: datetime.date) -> str:
    """Segunda-feira da semana, formato ISO yyyy-mm-dd."""
    monday = d - datetime.timedelta(days=d.weekday())
    return monday.isoformat()


def read_sheet(svc, sid):
    r = svc.spreadsheets().values().get(spreadsheetId=sid, range='Reunioes!A2:E').execute()
    return r.get('values', [])


def aggregate(rows):
    """Retorna {week: {'reu': n, 'neg': n}} a partir das linhas brutas."""
    by_week = defaultdict(lambda: {'reu': 0, 'neg': 0})
    for row in rows:
        # row pode ter menos colunas se as ultimas estiverem vazias
        if not row:
            continue
        data = parse_date(row[0] if len(row) > 0 else '')
        if not data:
            continue
        resultado = (row[3] if len(row) > 3 else '').strip()
        w = week_start(data)
        by_week[w]['reu'] += 1
        if resultado in FECHOU:
            by_week[w]['neg'] += 1
    return dict(by_week)


def main():
    if not URLS_PATH.exists():
        print(f'ERRO: {URLS_PATH} nao existe. Rode create_sheets.py primeiro.')
        sys.exit(1)
    urls = json.loads(URLS_PATH.read_text(encoding='utf-8'))
    svc = get_service()
    per_cs = {}
    all_weeks = set()
    for entry in urls:
        cs = entry['cs']
        sid = entry['spreadsheetId']
        print(f'lendo {cs} ({sid})...')
        try:
            rows = read_sheet(svc, sid)
        except Exception as e:
            print(f'  WARN: {e}')
            rows = []
        agg = aggregate(rows)
        per_cs[cs] = agg
        all_weeks.update(agg.keys())
        print(f'  {len(rows)} linhas, {len(agg)} semanas, {sum(v["reu"] for v in agg.values())} reunioes, {sum(v["neg"] for v in agg.values())} negocios')

    # Se nao tem nenhum dado, nao escreve real_data (deixa fictitious agir)
    total_rows = sum(sum(v['reu'] for v in agg.values()) for agg in per_cs.values())
    if total_rows == 0:
        print('\nNenhum dado encontrado nas planilhas - nao escreve real_data.js')
        if OUT_PATH.exists():
            OUT_PATH.unlink()
            print(f'(removido {OUT_PATH.name} antigo)')
        return

    weeks_sorted = sorted(all_weeks)
    out = {'weeks': weeks_sorted, 'reunioes': {}, 'negocios': {}}
    for cs in ('Luana', 'Thamiris', 'Gabriella'):
        out['reunioes'][cs] = [per_cs.get(cs, {}).get(w, {'reu': 0})['reu'] for w in weeks_sorted]
        out['negocios'][cs] = [per_cs.get(cs, {}).get(w, {'neg': 0})['neg'] for w in weeks_sorted]

    js = '// Gerado por fetch_sheets.py - dados reais das 3 planilhas Google Sheets\nvar DATA = ' + json.dumps(out, ensure_ascii=False) + ';\n'
    OUT_PATH.write_text(js, encoding='utf-8')
    print(f'\nOK: {OUT_PATH.name} gravado com {len(weeks_sorted)} semanas')


if __name__ == '__main__':
    main()
