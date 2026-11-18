#!/usr/bin/env bash
# Preparo UNICO do GCP vesti-data-499015 para receber os projetos que estavam na
# Vercel. Idempotente: pode rodar de novo sem estragar nada.
#
#   servico Cloud Run   repositorio GitHub              SA de execucao
#   stock-logs          vesti-mobi/stock-logs           stock-logs-live-ro (ja existe)
#   vesti-pix           vesti-mobi/vesti-pix            vesti-pix
#   vesti-influencers   vesti-mobi/vesti-influencers    vesti-influencers
#   painel-tribo        vesti-mobi/dados                paineis-estaticos
#   gambiarra-uemtel    vesti-mobi/dados                paineis-estaticos
#   gambiarra-atta      vesti-mobi/dados                paineis-estaticos
#   vesti-cs-tier       vesti-mobi/dados                vesti-cs-tier
#
# O que faz:
#   1. repositorio de imagens apps-web (Artifact Registry, southamerica-east1)
#   2. SA de deploy gha-deploy, personificavel pelo GitHub Actions desses 4
#      repositorios via o pool de Workload Identity que ja existe
#      (customer-access-control/github-actions, o mesmo do tino)
#   3. SAs de execucao, com actAs para a gha-deploy
#   4. segredos no Secret Manager (pede o valor de cada um que ainda nao tiver
#      versao; Enter em branco pula) e acesso de leitura para a SA do servico
#   5. bucket do vesti-cs-tier e copia do estado atual que esta no Vercel Blob
#
# Rode com uma conta que seja owner do vesti-data-499015 e possa editar IAM do
# pool no customer-access-control:
#   ./deploy/gcp/bootstrap.sh
set -euo pipefail

PROJECT_ID=vesti-data-499015
REGION=southamerica-east1
AR_REPO=apps-web
DEPLOYER=gha-deploy@${PROJECT_ID}.iam.gserviceaccount.com
WIF_POOL="projects/500224547944/locations/global/workloadIdentityPools/github-actions"
REPOS=(stock-logs vesti-pix vesti-influencers dados)
CS_TIER_BUCKET=vesti-data-cs-tier

sa() { echo "$1@${PROJECT_ID}.iam.gserviceaccount.com"; }

criar_sa() {
  local nome=$1 desc=$2
  if ! gcloud iam service-accounts describe "$(sa "$nome")" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$nome" --project "$PROJECT_ID" --display-name "$desc" --quiet
  fi
}

echo "== 1. Artifact Registry ($AR_REPO)"
if ! gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker \
    --location "$REGION" --project "$PROJECT_ID" \
    --description "Imagens dos servicos migrados da Vercel" --quiet
fi

echo "== 2. SA de deploy ($DEPLOYER)"
criar_sa gha-deploy "GitHub Actions - deploy Cloud Run (migracao Vercel)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOYER" \
  --role roles/run.admin --condition=None --quiet >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" --project "$PROJECT_ID" \
  --member "serviceAccount:$DEPLOYER" --role roles/artifactregistry.writer --quiet >/dev/null
for repo in "${REPOS[@]}"; do
  gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --project "$PROJECT_ID" \
    --role roles/iam.workloadIdentityUser \
    --member "principalSet://iam.googleapis.com/${WIF_POOL}/attribute.repository/vesti-mobi/${repo}" \
    --quiet >/dev/null
  echo "  WIF: vesti-mobi/$repo"
done

echo "== 3. SAs de execucao"
criar_sa vesti-pix "Cloud Run vesti-pix"
criar_sa vesti-influencers "Cloud Run vesti-influencers"
criar_sa vesti-cs-tier "Cloud Run vesti-cs-tier"
criar_sa paineis-estaticos "Cloud Run paineis estaticos (sem papeis)"
for nome in stock-logs-live-ro vesti-pix vesti-influencers vesti-cs-tier paineis-estaticos; do
  gcloud iam service-accounts add-iam-policy-binding "$(sa "$nome")" --project "$PROJECT_ID" \
    --member "serviceAccount:$DEPLOYER" --role roles/iam.serviceAccountUser --quiet >/dev/null
  echo "  actAs: $nome"
done

echo "== 4. Segredos"
# segredo|SA que le|chave do projeto (arquivo <chave>.env em VALORES_DIR)|variavel
SEGREDOS='stock-logs-vesti-order-token|stock-logs-live-ro|stock-logs|VESTI_ORDER_TOKEN
vesti-pix-iugu-token-starter|vesti-pix|vesti-pix|IUGU_TOKEN_STARTER
vesti-pix-iugu-token-uemtel|vesti-pix|vesti-pix|IUGU_TOKEN_UEMTEL
vesti-pix-iugu-token-vesti|vesti-pix|vesti-pix|IUGU_TOKEN_VESTI
vesti-pix-reagenda-secret|vesti-pix|vesti-pix|REAGENDA_SECRET
vesti-pix-admin-senha|vesti-pix|vesti-pix|ADMIN_SENHA
vesti-cs-tier-senha-painel|vesti-cs-tier|vesti-cs-tier|SENHA_PAINEL
vesti-influencers-supabase-service-role-key|vesti-influencers|vesti-influencers|SUPABASE_SERVICE_ROLE_KEY
vesti-influencers-cron-secret|vesti-influencers|vesti-influencers|CRON_SECRET
vesti-influencers-vesti-api-base-url|vesti-influencers|vesti-influencers|VESTI_API_BASE_URL
vesti-influencers-vesti-webhook-secret|vesti-influencers|vesti-influencers|VESTI_WEBHOOK_SECRET
vesti-influencers-gemini-api-key|vesti-influencers|vesti-influencers|GEMINI_API_KEY
vesti-influencers-instagram-app-id|vesti-influencers|vesti-influencers|INSTAGRAM_APP_ID
vesti-influencers-instagram-app-secret|vesti-influencers|vesti-influencers|INSTAGRAM_APP_SECRET
vesti-influencers-instagram-webhook-verify-token|vesti-influencers|vesti-influencers|INSTAGRAM_WEBHOOK_VERIFY_TOKEN
vesti-influencers-vapid-private-key|vesti-influencers|vesti-influencers|VAPID_PRIVATE_KEY
vesti-influencers-vapid-subject|vesti-influencers|vesti-influencers|VAPID_SUBJECT
vesti-influencers-smtp-user|vesti-influencers|vesti-influencers|SMTP_USER
vesti-influencers-smtp-pass|vesti-influencers|vesti-influencers|SMTP_PASS
vesti-influencers-notify-from|vesti-influencers|vesti-influencers|NOTIFY_FROM
vesti-influencers-notify-to|vesti-influencers|vesti-influencers|NOTIFY_TO
vesti-influencers-ycloud-api-key|vesti-influencers|vesti-influencers|YCLOUD_API_KEY'
# De onde vem o valor, nesta ordem:
#   1. VALORES_DIR/<chave>.env (formato do `vercel env pull`), se a variavel
#      estiver la com valor. Variaveis "sensitive" da Vercel saem VAZIAS no
#      pull: essas caem no passo 2.
#   2. pergunta no terminal, se houver um (Enter pula).
#   3. sem terminal: pula e avisa.
VALORES_DIR=${VALORES_DIR:-}
valor_do_env() {
  local arquivo="$VALORES_DIR/$1.env" var=$2
  [ -n "$VALORES_DIR" ] && [ -f "$arquivo" ] || return 0
  python3 - "$arquivo" "$var" <<'PY'
import sys
arquivo, var = sys.argv[1], sys.argv[2]
for linha in open(arquivo, encoding="utf-8"):
    linha = linha.rstrip("\n")
    if not linha or linha.lstrip().startswith("#") or "=" not in linha:
        continue
    k, v = linha.split("=", 1)
    if k.strip() != var:
        continue
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1].encode().decode("unicode_escape") if v[0] == '"' else v[1:-1]
    sys.stdout.write(v)
    break
PY
}
TEM_TTY=0
{ exec 3</dev/tty; } 2>/dev/null && TEM_TTY=1
while IFS='|' read -r segredo leitor chave var <&4; do
  if ! gcloud secrets describe "$segredo" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$segredo" --project "$PROJECT_ID" --replication-policy=automatic \
      --labels=migrado-de=vercel --quiet >/dev/null
  fi
  gcloud secrets add-iam-policy-binding "$segredo" --project "$PROJECT_ID" \
    --member "serviceAccount:$(sa "$leitor")" --role roles/secretmanager.secretAccessor --quiet >/dev/null
  if [ -z "$(gcloud secrets versions list "$segredo" --project "$PROJECT_ID" --filter=state=ENABLED --limit=1 --format='value(name)')" ]; then
    valor=$(valor_do_env "$chave" "$var")
    if [ -n "$valor" ]; then
      echo "  $segredo: valor de $chave.env ($var)"
    elif [ "$TEM_TTY" = 1 ]; then
      printf '  %s (Vercel %s: %s) — valor (Enter pula): ' "$segredo" "$chave" "$var"
      IFS= read -rs valor <&3; echo
    else
      echo "  $segredo: SEM VALOR (Vercel $chave: $var vazio ou sensitive) — PULADO"
    fi
    if [ -n "$valor" ]; then
      printf '%s' "$valor" | gcloud secrets versions add "$segredo" --project "$PROJECT_ID" --data-file=- --quiet >/dev/null
      echo "    gravado"
    else
      echo "    PULADO — o deploy desse servico falha ate ter versao"
    fi
  else
    echo "  $segredo: ja tem valor"
  fi
done 4<<< "$SEGREDOS"

echo "== 5. Bucket do vesti-cs-tier (gs://$CS_TIER_BUCKET)"
if ! gcloud storage buckets describe "gs://$CS_TIER_BUCKET" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$CS_TIER_BUCKET" --project "$PROJECT_ID" \
    --location "$REGION" --uniform-bucket-level-access --public-access-prevention --quiet
fi
gcloud storage buckets add-iam-policy-binding "gs://$CS_TIER_BUCKET" \
  --member "serviceAccount:$(sa vesti-cs-tier)" --role roles/storage.objectAdmin --quiet >/dev/null

# Copia o estado de hoje (GET publico da Vercel) como primeira versao no bucket.
# So copia se o bucket ainda estiver vazio, para nao sobrescrever o que ja foi
# gravado pelo Cloud Run. Rode de novo NO CORTE, imediatamente antes de trocar o
# painel para a URL nova, apagando antes o que houver no bucket, se alguem
# tiver arrastado tier na Vercel depois da primeira copia.
if [ -z "$(gcloud storage ls "gs://$CS_TIER_BUCKET/tier-*" 2>/dev/null || true)" ]; then
  TMP=$(mktemp)
  curl -fsS https://vesti-cs-tier.vercel.app/api/tier \
    | python3 -c 'import json,sys; j=json.load(sys.stdin); assert j.get("ok"); json.dump({"atualizadoEm": j.get("atualizadoEm"), "marcas": j.get("marcas") or {}}, sys.stdout, ensure_ascii=False)' > "$TMP"
  NOME="tier-$(printf '%016d' "$(($(date +%s%N) / 1000000))").json"
  gcloud storage cp "$TMP" "gs://$CS_TIER_BUCKET/$NOME" --content-type=application/json --quiet
  rm -f "$TMP"
  echo "  estado copiado para gs://$CS_TIER_BUCKET/$NOME"
else
  echo "  bucket ja tem estado; nao copiado de novo"
fi

cat <<EOF

Pronto. Proximos passos (ver deploy/gcp/MIGRACAO-VERCEL.md):
  - rodar o workflow "Deploy GCP (Cloud Run)" em cada repositorio (aba Actions)
  - vesti-influencers: cadastrar as Variables NEXT_PUBLIC_* no GitHub antes
  - conferir cada servico na URL *.run.app
  - corte: redirect na Vercel + scheduler do influencers
EOF
