# Movimentações de Estoque — busca ao vivo (Vercel)

Mesma busca do `stock-logs/` no repo `vesti-mobi/dados` (Loki + APIs Vesti),
só que **sem GitHub Actions**: formulário na própria página, uma function da
Vercel consulta e devolve o resultado na hora. Pedido da Laura (14/09/2026):
"consultar na hora sem depender das actions".

```
index.html      painel (login "Mudar123" + formulário + tabela)
api/buscar.js   function: Loki (windowed + retry) + APIs Vesti (enriquecimento)
vercel.json     maxDuration=150 na function; noindex
```

## Por que tem limite de 6 dias aqui e o outro não

O gargalo é o próprio Loki — só aceita consulta em janelas de 1 dia, com rate
limit por cima disso (medido em produção: `429 too many outstanding
requests` depois de ~10 janelas seguidas). Isso não muda com o servidor: uma
busca de semanas/meses leva minutos em QUALQUER lugar que rode o código.

O que muda é o **tempo de execução disponível**. Uma function da Vercel é
cortada em `maxDuration` (150s aqui — subido de 60s em 03/11/2026: marca com
log mais volumoso passava de 8s/janela, e 6 janelas seguidas já beirava os
60s). `MAX_DIAS = 6` em `api/buscar.js` é a maior janela que cabe nesse
orçamento com folga — passar disso, o endpoint recusa de propósito (400) em
vez de deixar a function ser matada no meio e devolver erro genérico.

Pra período maior, o caminho é o outro projeto: `stock-logs/` no repo
principal, workflow `stock-logs.yml` do GitHub Actions — mesma lógica, sem
limite de dias, só que assíncrono (dispara, espera ~1-2 min + o tempo real do
período, resultado aparece depois no painel do GitHub Pages).

## Configuração necessária

**`VESTI_ORDER_TOKEN`** como variável de ambiente do projeto na Vercel
(Settings → Environment Variables). É o **mesmo token** já configurado como
secret no GitHub Actions do repo principal — precisa ser colado nos dois
lugares separadamente, um não vê o outro. Sem essa env var, `/api/buscar`
responde 500 direto.

**`GCP_SA_KEY`** (08/10/2026, pedido da Laura: "data que o produto foi
realmente cadastrado"): JSON inteiro de uma service account própria, só
leitura, escopada ao dataset `vestilake_BI` do BigQuery (não é a mesma
credencial do GitHub Actions). Falha em silêncio se ausente — a busca
principal continua funcionando, só o campo "produto cadastrado em" fica
vazio. Ver `buscaDataCadastro` em `api/buscar.js`.

Fora isso, não usa banco nenhum nem persiste nada no servidor — cada busca
é uma chamada HTTP. O "buscas recentes" que aparece na página é **só
local** (`localStorage` do navegador de quem buscou), não é compartilhado
com ninguém.

## ⚠️ Mesma senha-tranca dos outros painéis

`Mudar123`, checada no navegador — não protege nada, só evita abrir a
página por acaso. Resultado de busca (nome de usuário, IP) fica visível pra
quem tiver a senha, mesmo risco já aceito pelo painel irmão no GitHub Pages.
