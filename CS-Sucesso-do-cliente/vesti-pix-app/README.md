# Vesti — Pix Automático (web app)

Mesmo app do Streamlit Cloud, empacotado para rodar como **web app real** com
domínio próprio no [Render](https://render.com). O token da Iugu fica **só no
servidor** (Secret File), nunca no GitHub.

## 1. Subir pro GitHub

```bash
cd C:\Users\Laura\Projetos\Ideia-vesti\vesti-pix-app
git init
git add .
git commit -m "Vesti Pix Automatico - deploy Render"
git branch -M main
# crie um repo NOVO e VAZIO em github.com (ex.: vesti-mobi/vesti-pix-app)
git remote add origin https://github.com/vesti-mobi/vesti-pix-app.git
git push -u origin main
```

> O `.gitignore` já bloqueia qualquer arquivo de segredo. Confira com
> `git status` que **nenhum** `secrets.toml` aparece antes do push.

## 2. Deploy no Render

1. render.com → **New** → **Blueprint** → conecte o repo. Ele lê o `render.yaml`.
2. Após criar o serviço, vá em **Settings → Secret Files → Add Secret File**:
   - **Filename:** `.streamlit/secrets.toml`
   - **Contents:** o conteúdo do `.streamlit/secrets.toml.example` preenchido
     com a senha e os tokens reais de cada parceiro iugu.
3. **Manual Deploy** (ou aguarde o auto-deploy). O app sobe em
   `https://vesti-pix-automatico.onrender.com`.

## 3. Domínio próprio (opcional)

Render → **Settings → Custom Domains** → adicione `pix.vesti.mobi` (ou similar)
e crie o CNAME indicado no DNS.

## Onde estão os tokens reais

No arquivo local (NÃO versionado):
`C:\Users\Laura\Projetos\Ideia-vesti\iugupixautomatico\SECRETS_PARA_COLAR_NO_STREAMLIT.toml`

É só copiar o conteúdo dele para o Secret File do Render no passo 2.

## Atualizar o app

Edite `streamlit_app.py`, faça `git push` → o Render redeploya sozinho.
