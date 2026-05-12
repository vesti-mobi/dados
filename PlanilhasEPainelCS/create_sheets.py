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
PARENT_FOLDER_ID = '0AE52PmO4AIvjUk9PVA'  # Shared Drive "Planilhas CS Reunioes"

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
    # 1. Cria spreadsheet via Drive API dentro da pasta da Laura
    drive_file = drive_svc.files().create(
        body={
            'name': info['title'],
            'mimeType': 'application/vnd.google-apps.spreadsheet',
            'parents': [PARENT_FOLDER_ID],
        },
        fields='id,webViewLink',
        supportsAllDrives=True,
    ).execute()
    sid = drive_file['id']
    print(f"  criada: {sid}")

    # 2. Renomeia a aba pra 'Reunioes' e ajusta gridProperties
    ss_meta = sheets_svc.spreadsheets().get(spreadsheetId=sid).execute()
    sheet_id_num = ss_meta['sheets'][0]['properties']['sheetId']
    sheets_svc.spreadsheets().batchUpdate(spreadsheetId=sid, body={'requests': [
        {'updateSheetProperties': {
            'properties': {
                'sheetId': sheet_id_num,
                'title': 'Reunioes',
                'gridProperties': {'rowCount': 500, 'columnCount': len(HEADERS), 'frozenRowCount': 1},
            },
            'fields': 'title,gridProperties',
        }},
        {'updateSpreadsheetProperties': {
            'properties': {'locale': 'pt_BR', 'timeZone': 'America/Sao_Paulo'},
            'fields': 'locale,timeZone',
        }},
    ]}).execute()

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

    # 3. Compartilhar (precisa supportsAllDrives em arquivos de Shared Drive)
    for email in SHARE_WITH:
        try:
            drive_svc.permissions().create(
                fileId=sid,
                body={'type': 'user', 'role': 'writer', 'emailAddress': email},
                sendNotificationEmail=True,
                fields='id',
                supportsAllDrives=True,
            ).execute()
            print(f"  compartilhada com {email}")
        except Exception as e:
            print(f"  WARN: falha ao compartilhar com {email}: {e}")

    url = f'https://docs.google.com/spreadsheets/d/{sid}/edit'
    return {'cs': info['cs'], 'title': info['title'], 'spreadsheetId': sid, 'url': url}


def list_existing(drive_svc):
    """Mapa de titulo -> file id dos arquivos ja no shared drive."""
    r = drive_svc.files().list(
        driveId=PARENT_FOLDER_ID,
        corpora='drive',
        includeItemsFromAllDrives=True,
        supportsAllDrives=True,
        fields='files(id,name)',
    ).execute()
    return {f['name']: f['id'] for f in r.get('files', [])}


def main():
    sheets_svc, drive_svc = get_services()
    existing = list_existing(drive_svc)
    results = []
    for info in CS_LIST:
        print(f"=> {info['cs']}")
        if info['title'] in existing:
            sid = existing[info['title']]
            print(f"  ja existe: {sid} (pulando criacao)")
            results.append({
                'cs': info['cs'], 'title': info['title'], 'spreadsheetId': sid,
                'url': f'https://docs.google.com/spreadsheets/d/{sid}/edit',
            })
            continue
        results.append(create_one(sheets_svc, drive_svc, info))
    out = BASE / 'sheets_urls.json'
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\nGravado: {out}")
    print('\nURLs:')
    for r in results:
        print(f"  {r['cs']}: {r['url']}")


if __name__ == '__main__':
    main()
