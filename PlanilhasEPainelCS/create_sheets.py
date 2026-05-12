"""Cria 3 planilhas Google Sheets (uma por CS) com cabecalho padrao e compartilha com Laura.

Uso:
    py create_sheets.py
Dependencias: google-api-python-client, google-auth
Credenciais: usa google_sa.json em ../PainelCSGerencial/

Saida: imprime URLs das 3 planilhas e grava sheets_urls.json.
"""
import json, os, sys, io, pathlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

BASE = pathlib.Path(__file__).resolve().parent
SA_PATH = BASE.parent / 'PainelCSGerencial' / 'google_sa.json'
SHARE_WITH = [
    'maria.laura@vesti.mobi',  # Laura (dona dos dashboards)
]

CS_LIST = [
    {'cs': 'Luana',     'title': 'Reunioes CS - Luana Coutinho'},
    {'cs': 'Thamiris',  'title': 'Reunioes CS - Thamiris Ribeiro'},
    {'cs': 'Gabriella', 'title': 'Reunioes CS - Gabriella Busto'},
]

HEADERS = ['Data', 'Cliente (Marca)', 'Assuntos Discutidos', 'Resultado', 'Proximos Passos']

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
]


def get_services():
    creds = Credentials.from_service_account_file(str(SA_PATH), scopes=SCOPES)
    return build('sheets', 'v4', credentials=creds), build('drive', 'v3', credentials=creds)


def create_one(sheets_svc, drive_svc, info):
    # 1. Cria spreadsheet
    body = {
        'properties': {'title': info['title'], 'locale': 'pt_BR', 'timeZone': 'America/Sao_Paulo'},
        'sheets': [{
            'properties': {
                'title': 'Reunioes',
                'gridProperties': {'rowCount': 500, 'columnCount': len(HEADERS), 'frozenRowCount': 1},
            },
        }],
    }
    ss = sheets_svc.spreadsheets().create(body=body, fields='spreadsheetId,spreadsheetUrl,sheets.properties').execute()
    sid = ss['spreadsheetId']
    sheet_id_num = ss['sheets'][0]['properties']['sheetId']
    print(f"  criada: {sid}")

    # 2. Header + formatacao
    sheets_svc.spreadsheets().values().update(
        spreadsheetId=sid,
        range='Reunioes!A1:E1',
        valueInputOption='RAW',
        body={'values': [HEADERS]},
    ).execute()

    requests = [
        # Header bold + fundo roxo + branco
        {'repeatCell': {
            'range': {'sheetId': sheet_id_num, 'startRowIndex': 0, 'endRowIndex': 1},
            'cell': {'userEnteredFormat': {
                'backgroundColor': {'red': 0.424, 'green': 0.361, 'blue': 0.906},
                'textFormat': {'foregroundColor': {'red': 1, 'green': 1, 'blue': 1}, 'bold': True, 'fontSize': 11},
                'horizontalAlignment': 'CENTER',
                'verticalAlignment': 'MIDDLE',
            }},
            'fields': 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        }},
        # Largura das colunas
        {'updateDimensionProperties': {
            'range': {'sheetId': sheet_id_num, 'dimension': 'COLUMNS', 'startIndex': 0, 'endIndex': 1},
            'properties': {'pixelSize': 110}, 'fields': 'pixelSize'}},
        {'updateDimensionProperties': {
            'range': {'sheetId': sheet_id_num, 'dimension': 'COLUMNS', 'startIndex': 1, 'endIndex': 2},
            'properties': {'pixelSize': 200}, 'fields': 'pixelSize'}},
        {'updateDimensionProperties': {
            'range': {'sheetId': sheet_id_num, 'dimension': 'COLUMNS', 'startIndex': 2, 'endIndex': 3},
            'properties': {'pixelSize': 420}, 'fields': 'pixelSize'}},
        {'updateDimensionProperties': {
            'range': {'sheetId': sheet_id_num, 'dimension': 'COLUMNS', 'startIndex': 3, 'endIndex': 5},
            'properties': {'pixelSize': 220}, 'fields': 'pixelSize'}},
        # Coluna Data como Date
        {'repeatCell': {
            'range': {'sheetId': sheet_id_num, 'startRowIndex': 1, 'startColumnIndex': 0, 'endColumnIndex': 1},
            'cell': {'userEnteredFormat': {'numberFormat': {'type': 'DATE', 'pattern': 'dd/mm/yyyy'}, 'horizontalAlignment': 'CENTER'}},
            'fields': 'userEnteredFormat(numberFormat,horizontalAlignment)'}},
        # Wrap nas colunas de texto
        {'repeatCell': {
            'range': {'sheetId': sheet_id_num, 'startRowIndex': 1, 'startColumnIndex': 2, 'endColumnIndex': 5},
            'cell': {'userEnteredFormat': {'wrapStrategy': 'WRAP', 'verticalAlignment': 'TOP'}},
            'fields': 'userEnteredFormat(wrapStrategy,verticalAlignment)'}},
        # Validacao de Resultado (coluna D)
        {'setDataValidation': {
            'range': {'sheetId': sheet_id_num, 'startRowIndex': 1, 'startColumnIndex': 3, 'endColumnIndex': 4},
            'rule': {
                'condition': {'type': 'ONE_OF_LIST', 'values': [
                    {'userEnteredValue': 'Fechou negocio'},
                    {'userEnteredValue': 'Upgrade'},
                    {'userEnteredValue': 'Reativacao'},
                    {'userEnteredValue': 'Em andamento'},
                    {'userEnteredValue': 'Nao fechou'},
                    {'userEnteredValue': 'No-show'},
                    {'userEnteredValue': 'Outro'},
                ]},
                'strict': False,
                'showCustomUi': True,
            }}},
    ]
    sheets_svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={'requests': requests}).execute()

    # 3. Compartilhar
    for email in SHARE_WITH:
        try:
            drive_svc.permissions().create(
                fileId=sid,
                body={'type': 'user', 'role': 'writer', 'emailAddress': email},
                sendNotificationEmail=True,
                fields='id',
            ).execute()
            print(f"  compartilhada com {email}")
        except Exception as e:
            print(f"  WARN: falha ao compartilhar com {email}: {e}")

    return {'cs': info['cs'], 'title': info['title'], 'spreadsheetId': sid, 'url': ss['spreadsheetUrl']}


def main():
    sheets_svc, drive_svc = get_services()
    results = []
    for info in CS_LIST:
        print(f"=> {info['cs']}")
        results.append(create_one(sheets_svc, drive_svc, info))
    out = BASE / 'sheets_urls.json'
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\nGravado: {out}")
    print('\nURLs:')
    for r in results:
        print(f"  {r['cs']}: {r['url']}")


if __name__ == '__main__':
    main()
