# Migração Vercel → GCP (vesti-data-499015)

Sete projetos que estavam na Vercel passam a rodar no Cloud Run do projeto
`vesti-data-499015`, região `southamerica-east1`. A Vercel continua no ar só
como **redirect 308** para a URL nova, para que links já enviados (Pix para
clientes, favoritos, e-mails) continuem valendo.

| Serviço Cloud Run | Repositório / pasta | Antes (Vercel) | URL nova |
|---|---|---|---|
| `stock-logs` | `vesti-mobi/stock-logs` | projeto stock-logs | https://stock-logs-829232163598.southamerica-east1.run.app |
| `vesti-pix` | `vesti-mobi/vesti-pix` | vesti-pix-vercel.vercel.app | https://vesti-pix-829232163598.southamerica-east1.run.app |
| `vesti-influencers` | `vesti-mobi/vesti-influencers` | vesti-influencers.vercel.app | https://vesti-influencers-829232163598.southamerica-east1.run.app |
| `painel-tribo` | `vesti-mobi/dados` `painel-tribo/` | projeto painel-tribo | https://painel-tribo-829232163598.southamerica-east1.run.app |
| `gambiarra-uemtel` | `vesti-mobi/dados` `GambiarraUemtel/` | projeto GambiarraUemtel | https://gambiarra-uemtel-829232163598.southamerica-east1.run.app |
| `gambiarra-atta` | `vesti-mobi/dados` `GambiarraAtta/` | projeto GambiarraAtta | https://gambiarra-atta-829232163598.southamerica-east1.run.app |
| `vesti-cs-tier` | `vesti-mobi/dados` `CS/api-tier/` | vesti-cs-tier.vercel.app | https://vesti-cs-tier-829232163598.southamerica-east1.run.app |

## Objetivo final: apagar a conta da Vercel

Decisão de 2026-11-18: tudo sai da Vercel e a conta é apagada. Com isso, o
redirect na Vercel é só temporário, e todo endereço `*.vercel.app` deixa de
existir. Os serviços devem ser publicados em subdomínio próprio (DNS no
Cloudflare), e quem usa as URLs antigas precisa ser atualizado antes do fim.

Inventário completo (confirmado pelo Diego: só existem estes 14 projetos):

| Projeto Vercel | Destino | Código | Situação |
|---|---|---|---|
| stock-logs | GCP `stock-logs` | `vesti-mobi/stock-logs` | pronto |
| vesti-pix-vercel | GCP `vesti-pix` | `vesti-mobi/vesti-pix` | pronto |
| vesti-influencers | GCP `vesti-influencers` | `vesti-mobi/vesti-influencers` | pronto |
| painel-tribo | GCP `painel-tribo` | `dados/painel-tribo` | pronto |
| GambiarraUemtel | GCP `gambiarra-uemtel` | `dados/GambiarraUemtel` | pronto |
| GambiarraAtta | GCP `gambiarra-atta` | `dados/GambiarraAtta` | pronto |
| vesti-cs-tier | GCP `vesti-cs-tier` | `dados/CS/api-tier` | pronto; Blob já copiado |
| vesti-catalogo-auto (prod) | OKE | `vesti-mobi/vesti-catalogo` | migração OKE em andamento no repo |
| vesti-catalogo-dev (validação) | OKE nonprod | `vesti-mobi/vesti-catalogo` | idem |
| vesti-catalogo-ia | a definir | não identificado | versão antiga do catálogo? |
| vesti-pix (antigo) | desligar | `dados/vesti-pix-vercel` (cópia antiga) | só `/api/plano` e `/api/gerar-pix`; citado em `dados/index.html` |
| vesti-contas | GCP | **só na Vercel** | baixar o código; provável storage (`/api/varejo`) |
| stark-admin-phi | GCP | **só na Vercel** | baixar o código |
| vesti-admin | GCP | **só na Vercel** | baixar o código; usado pelo influencers |

`dados/stock-logs-live` é cópia antiga do `stock-logs` e não tem projeto
próprio na Vercel.

## Arquivos por repositório

| Repositório | Arquivos |
|---|---|
| todos | `deploy/gcp/service.yaml` (Knative, aplicado com `gcloud run services replace`), `.github/workflows/deploy-gcp.yml`, `deploy/gcp/vercel-redirect.json` (só para o corte) |
| stock-logs | `Dockerfile`, `server.js` (adaptador da function da Vercel), `api/buscar.js` usa a SA do serviço quando não há `GCP_SA_KEY` |
| vesti-pix | `Dockerfile`, `server.py` (roteia `/api/<nome>` para o `handler` de cada `api/*.py`, sem alterá-los), `api/gerar-link.py` lê `SITE_URL` |
| vesti-influencers | `Dockerfile` (Next 16, `next start`), `deploy/gcp/scheduler.sh` (crons) |
| dados | `deploy/gcp/static.Dockerfile` + `deploy/gcp/<serviço>/nginx.conf` (painéis estáticos), `deploy/gcp/vesti-cs-tier/Dockerfile`, `CS/api-tier/server.mjs`, `CS/api-tier/api/tier.js` grava no GCS quando há `TIER_BUCKET`, `deploy/gcp/bootstrap.sh` |

## O que muda por baixo e como ficou igual

| Comportamento na Vercel | No GCP |
|---|---|
| Deploy a cada push na `main` | Workflow `Deploy GCP (Cloud Run)` no push na `main` |
| painel-tribo: commit diário da carga publica sozinho | o deploy roda depois de cada execução bem-sucedida do workflow `Painel da Tribo` (`workflow_run`); o commit com `GITHUB_TOKEN` não dispara `push` |
| `maxDuration` | `timeoutSeconds` (stock-logs 150, vesti-pix 60, influencers 300) |
| `after()` do Next roda depois da resposta (waitUntil) | `run.googleapis.com/cpu-throttling: "false"` no influencers |
| crons do `vercel.json` (GET + `Authorization: Bearer $CRON_SECRET`, UTC) | Cloud Scheduler com a mesma chamada (`scheduler.sh`) |
| headers e `cleanUrls` do `vercel.json` | `nginx.conf` de cada painel; X-Robots-Tag no `server.js` do stock-logs |
| env vars "sensitive" | Secret Manager (`<serviço>-<variável>`), lidas só pela SA do serviço |
| Vercel Blob (cs-tier) | bucket privado `gs://vesti-data-cs-tier`, mesmo formato `tier-<ms>.json` |
| chave JSON `GCP_SA_KEY` (stock-logs) | a própria SA `stock-logs-live-ro` como identidade do serviço, sem chave |
| `NEXT_PUBLIC_*` no projeto Vercel | Variables do repositório no GitHub, passadas como build args |

Diferença intencional: a Vercel servia como arquivo público o `.py` da raiz e o
`n8n/*.json` do vesti-pix (testado: `conferir_valores_permitidos.py` e
`n8n/iugu-pix-automatico.json` respondem 200). No Cloud Run só saem as páginas.

## Passo a passo

### 1. Preparo (uma vez)

```bash
cd dados && ./deploy/gcp/bootstrap.sh
```

Pede o valor de cada segredo. As variáveis da Vercel estão como *sensitive* e
não saem por `vercel env pull`. O valor vem da origem (Iugu, Supabase, Meta,
cofre) ou do secret equivalente no GitHub. **Antes**, abra Settings →
Environment Variables de cada projeto na Vercel e confira se a lista bate com
os `service.yaml`:

- vesti-pix: a lista de `IUGU_TOKEN_*` tem de ser **idêntica** (o `/api/admin`
  e o `/api/pix-evento` descobrem as subcontas pelas variáveis existentes).
  `VESTI_ACCESS_TOKEN` e `PIX_EVENTO_DIAS` estão comentadas: descomente se
  existirem lá.
- vesti-influencers: as opcionais (`GEMINI_MODEL`, `RESEND_API_KEY`,
  `YCLOUD_*`) estão comentadas no `service.yaml` e fora do bootstrap.
- Confira também se algum projeto tem **domínio próprio** (Settings →
  Domains). Se tiver, o corte desse domínio é por DNS (domain mapping do Cloud
  Run ou load balancer), não por redirect.

### 2. GitHub

- vesti-influencers: criar as Variables `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `NEXT_PUBLIC_HOST_INFLUENCERS`, `NEXT_PUBLIC_VESTI_WHATSAPP` com os valores
  da Vercel, e `NEXT_PUBLIC_APP_URL` com a URL nova do Cloud Run.
- Commitar os arquivos em cada repositório. Pelo Git Flow, é PR na `develop`
  e na `main`. O workflow só publica a partir da `main`.

### 3. Primeiro deploy e conferência (Vercel ainda servindo)

Rodar o workflow `Deploy GCP (Cloud Run)` em cada repositório (aba Actions →
Run workflow) e conferir na URL `*.run.app`:

- stock-logs: uma busca de 1 dia com resultado; a coluna "cadastrado em" tem
  de vir preenchida (prova o acesso ao BigQuery pela SA).
- vesti-pix: `/?parceiro=starter&plano=starter.27` mostra o plano; `/admin`
  lista faturas; `/gerador` gera link com o domínio novo. **Não** gerar Pix
  real na conferência.
- painel-tribo: `/` abre; `/index.html` redireciona para `/`; header de cache
  do `dados.js` e do `d3.v7.min.js`.
- gambiarra-*: iframe abre; headers `X-Robots-Tag` e `Referrer-Policy`.
- vesti-cs-tier: `GET /api/tier` devolve as mesmas marcas da Vercel.
- vesti-influencers: login, painel da marca, landing; `after()` (aprovar uma
  candidata de teste e ver o e-mail sair).

### 4. Corte (por projeto)

1. Trocar o `vercel.json` do projeto pelo `deploy/gcp/vercel-redirect.json` e
   publicar na Vercel (push; no cs-tier, `npx vercel --prod` de dentro de
   `CS/api-tier/`). No influencers isso também apaga os crons da Vercel.
2. vesti-influencers: rodar `./deploy/gcp/scheduler.sh` logo em seguida.
3. Atualizar quem chama a URL antiga com POST ou de outra origem (o redirect
   não cobre esses casos de forma confiável):
   - n8n `iugu-pix-automatico` (`/api/reagendar` e `/api/pix-evento`) e o
     espelho em `vesti-pix/n8n/`.
   - `dados/CS/index.html`: `API_TIER` → URL nova do `vesti-cs-tier`. O POST
     com `Authorization` dispara preflight CORS, e o navegador não segue
     redirect em preflight. Rodar de novo a cópia do estado do Blob
     imediatamente antes (ver passo 5 do `bootstrap.sh`).
   - Meta (app do Instagram): callback do webhook e redirect URI do OAuth.
   - Supabase Auth: Site URL e Redirect URLs com o domínio novo.
   - Marcas com webhook da Vesti apontando para
     `vesti-influencers.vercel.app/api/webhooks/vesti`: atualizar. Venda que
     se perder no redirect é recuperada pelo cron `reconcile-vesti` (janela de
     30 h).
   - `dados/index.html` e READMEs que citam as URLs `*.vercel.app`.
4. Quem estiver logado no influencers pelo domínio da Vercel precisa entrar
   de novo (cookie é por domínio).

### 5. Desligar

Manter os projetos da Vercel como redirect enquanto houver link antigo em uso.
Os links Pix do gerador já enviados a clientes apontam para
`vesti-pix-vercel.vercel.app`, então esse redirect não pode sair tão cedo.
