# PlanilhasEPainelCS

Painel que mostra **reuniões realizadas vs negócios fechados** ao longo do tempo,
alimentado por 3 planilhas Google Sheets (uma por CS: Luana, Thamiris, Gabriella).

## Estrutura

- `template.html` — template do painel (login + chart + KPIs).
- `index.html` — gerado pelo build, é o que vai pro GitHub Pages.
- `fictitious_data.js` — dados de placeholder enquanto as planilhas reais não estão em uso.
- `build_html.py` — gera `index.html` inlineando o data file no `template.html`.
- `create_sheets.py` — cria as 3 planilhas no Google Sheets via Service Account
  (`../PainelCSGerencial/google_sa.json`), com cabeçalho, formatação, e compartilha
  com `maria.laura@vesti.mobi`.

## Acesso

Login do painel: senha **Mudar123**.

URL após publish: `https://vesti-mobi.github.io/dados/PlanilhasEPainelCS/`

## Workflow

1. Habilitar Google Sheets API e Drive API no projeto GCP `csatenps`
   (uma vez só — links nas mensagens da Laura/Claude).
2. `py create_sheets.py` — cria as 3 planilhas, salva URLs em `sheets_urls.json`.
3. Compartilhar manualmente cada planilha com a CS correspondente.
4. (Próximo passo) substituir `fictitious_data.js` por um script `fetch_sheets.py`
   que lê as 3 planilhas via API e gera `real_data.js`.
5. `py build_html.py` → commit → push → GitHub Pages publica em ~1min.

## Colunas das planilhas

| Data | Cliente (Marca) | Assuntos Discutidos | Resultado | Próximos Passos |
|------|-----------------|---------------------|-----------|-----------------|

Resultado é dropdown: Fechou negocio · Upgrade · Reativacao · Em andamento · Nao fechou · No-show · Outro.
