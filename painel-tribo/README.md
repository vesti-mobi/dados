# Painel da Tribo

Big numbers do negócio e a contribuição de cada equipe, para o warmup de segunda
e as reuniões gerenciais. Implementa o [MDATA-503](https://vesti.atlassian.net/browse/MDATA-503).

Painel estático: abre no navegador, sem instalação e sem servidor.

No ar em **https://vesti-mobi.github.io/dados/painel-tribo/**, atualizado todo
dia às 05:00 pelo workflow `.github/workflows/painel-tribo.yml`.

## Acesso

A tela pede uma senha (`Mudar123`), no mesmo padrão dos outros painéis da casa.

> **Isto esconde a tela, não o dado.** Este repositório é público, então o
> `dados.js` continua acessível por URL direta — com GMV, receita, chargeback e
> CSAT da série inteira. A senha evita que alguém que abra o link veja o painel
> montado; não impede quem souber o caminho do arquivo.
>
> Para proteger de verdade, o painel precisa sair de um host público: um
> repositório privado com Pages (plano pago) ou a Vercel com Deployment
> Protection ligada.

| Arquivo | O que é |
|---|---|
| `index.html` | O painel. Duas abas, funil invertido, gráfico semanal. |
| `dados.js` | Série diária por segmento, gerada do BigQuery. |
| `build_data.js` | Pipeline BigQuery → `dados.js`. |
| `FONTES.md` | De onde vem cada número e cada gráfico, e a conferência com o relatório. |
| `suporte.js` | Lê CSAT, resposta e SLA das planilhas do time. |
| `antifraude.js` | Lê tempo de análise e chargeback perdido. |
| `d3.v7.min.js` | D3 local, para o painel abrir sem internet. |

## Atualizar os números

```bash
gcloud auth application-default login   # só na primeira vez, para o BigQuery
node build_data.js                       # histórico completo, 2025-01-01 → ontem
DESDE=2026-01-01 node build_data.js      # recorte menor, para testar
```

O suporte vem da planilha de KPIs pela API, na mesma execução — não há passo
manual. Se a chave da service account não for encontrada, o build avisa e o
suporte fica `—`, sem derrubar o resto.

Roda em ~1 min e reescreve `dados.js`. A comparação do painel é contra 364 dias
antes, então **2025 inteiro é obrigatório** — não encurte o `DESDE` para valer.

## Como o painel calcula

A base é **diária, por segmento**, e guarda os **componentes** de cada indicador,
nunca o indicador pronto. O painel soma o intervalo escolhido e só então divide:
taxas e médias saem dos totais do período, nunca de média de médias.

Comparação: o mesmo intervalo **364 dias antes** (52 semanas, alinhado pelo dia
da semana). Variação sempre em %, sobre valores absolutos, verde na direção boa
do indicador. Réguas: CSAT < 4,9 e SLA > 3 dias ficam em vermelho.

Um indicador sem fonte aparece como **—**. Nunca como zero: no warmup, um zero
é lido como "caiu", e a ausência de fonte não é uma queda.

## Mapeamento indicador → fonte

Tudo em `vesti-data-499015.vestilake_BI` (us-central1).

| Indicador | Tabela | Coluna / régua |
|---|---|---|
| Segmento (atacado/varejo) | `odbc_companies` | `layout_webmobile` (1 atacado, 2 varejo) |
| GMV | `MongoDB_Pedidos_Geral` | `summary_total`, por `settings_createdAt` |
| GMV via integração | `MongoDB_Pedidos_Geral` + `odbc_domains` | domínio com `integration_owner` preenchido |
| GMV Oráculo direto / influenciado | `oraculo_Pedidos` | `Tipo_Venda_Oraculo`, pronto da fonte |
| TPV cartão / Pix | `MongoDB_Pedidos_Geral` | `payment_transaction_value`, por `payment_paidAt` |
| Receita de MDR | `vestipago_transaction_detail` | `mdrVestiValue` de cartão — só a fatia da Vesti |
| Receita de antifraude | `MongoDB_Pedidos_Geral` | `payment_transaction_antifraudValue` |
| Receita de antecipação | `vestipago_transaction_detail` | `antecipationVestiFee` |
| Aprovação do antifraude | `MongoDB_Pedidos_Geral` | `payment_analysisStatus` |
| CSAT e Resposta · Integrações e Plataforma | planilha "OKRs e KPIs - Tribo 1" | abas Integração / Plataforma - KPIs |
| CSAT e Resposta · VestiPago | `huggy.chats_raw` + `huggy.csat_raw` | tabulação Vestipago, 3 agentes, 3 departamentos |
| SLA · 3 equipes | planilha "SLA Vesti" | abas SLA - Integração / Plataforma / Vestipago, ticket a ticket |
| Tempo médio de análise | xlsx "Metrica Antifraude 2026" | aba Resumo Semanal, coluna "Analise Geral" |
| Chargeback perdido | planilha "Chargebacks" | abas por ano, status Perdido (com e sem seguro somados) |

### Réguas que valem a pena saber

**A régua do GMV é a do relatório "GMV - Métricas 2025"**, e os números batem
aos centavos (ver `FONTES.md`). Duas consequências que surpreendem:

- **conta pedido não pago** — vale todo pedido fechado, não cancelado, com
  `payment_isPaid` preenchido, pago ou não;
- **não conta paylink** — `Link de cobrança` entrou no lake depois do último
  refresh do relatório.

As chaves ficam no topo do `build_data.js`: `SO_PAGOS`, `EXCLUI_PAYLINK`,
`SO_FECHADOS`, `EXCLUI_CANCELADOS`, `TETO_PEDIDO`.

**TPV** é o pedido pago com `payment_type` em `PRE_PAYMENT`/`POST_PAYMENT`, que
marca o pagamento processado pelo VestiPago; `MANUAL` é combinado fora da
plataforma e fica de fora. Conferido em set/2026: cartão por esta régua dá
R$ 12,70 mi contra R$ 12,64 mi na `vestipago_transaction_detail`.

O TPV **não** sai da `vestipago_transaction_detail` porque ela cobre cartão e
praticamente não tem Pix (R$ 24 mil em set/2026, contra R$ 12,6 mi nos pedidos).

**Duas réguas de data, de propósito:** GMV pela criação do pedido, porque é
venda; TPV e receita pelo pagamento, porque são eventos financeiros. Por isso
"TPV % do GMV" cruza dois recortes ligeiramente diferentes.

**MDR** é só a fatia que fica com a Vesti (`mdrVestiValue`). A fatia da bandeira
(`mdrCardBrandValue`) não é receita e fica de fora — juntas elas formam o
`vestiPagoValue`, que é ~30x maior e existe também no pedido, mas sem separar
uma da outra.

## O que ainda não tem fonte

Todos os indicadores do ticket têm fonte. O que ainda limita:

- **SLA na semana corrente** — a planilha de SLA vai até 09/10/2026, então a
  semana que o painel abre por padrão ainda não tem SLA. E como não há ticket
  de 2025, o SLA não tem comparação anual.
- **Chargeback** — o ticket diz que vem pronto da fonte. No lake só existe
  `refundType = TOTAL` na `vestipago_transaction_detail`, que é estorno, não
  chargeback.
- **Tempo médio de análise do antifraude** — não há carimbo de início e fim da
  análise em lugar nenhum.

Para ligar qualquer um deles: a coluna já existe no schema diário (veja
`SEM_FONTE` no `build_data.js`), basta preencher e tirar da lista.

## Buracos de histórico que afetam a comparação

Nem toda fonte cobre 2025, e a comparação anual sente:

- **MDR e receita de antecipação** começam em **maio/2026** — é a janela da
  `vestipago_transaction_detail`, única fonte que separa o que fica com a Vesti.
  Antes disso vão null, e a **Receita total** também: somar o que falta daria um
  número menor que o real e inflaria o crescimento contra 2025. A comparação da
  Receita volta a existir a partir de maio/2027.
- **Oráculo** só passa a ser classificado em **outubro/2025**, e com volume
  ínfimo até o fim do ano. A variação contra 2025 aparece na casa dos milhares
  por cento porque a base era quase zero — é o dado real, não um erro de conta.
- **Receita de antifraude** tem histórico completo desde janeiro/2025, por vir
  do pedido.
- **MDR despencou** de ~R$ 28 mil/mês (jun–ago) para R$ 9,2 mil em setembro e
  R$ 4,8 mil em outubro. Vale checar com o VestiPago se mudou precificação ou se
  o campo parou de ser preenchido.

## Pendências do ticket

- [x] ~~Religar a ingestão da `huggy.csat_raw`~~ — feito em 26/10/2026
- [ ] Agendar o pipeline `huggy-to-bigquery` (hoje é manual, nesta máquina)
- [ ] Decidir se os tickets de teste entram no SLA (`IGNORAR_TICKETS_TESTE`)
- [ ] Corrigir a data `13/10/2-26` na planilha de chargeback (R$ 1.422,21 fora)
- [ ] Carregar 2025 na planilha de SLA, para o indicador ganhar comparação anual
- [ ] Fonte de chargeback e de tempo de análise
- [ ] Validar com cada dono: régua do GMV e régua do TPV
- [ ] VestiPago: explicar a queda do MDR a partir de setembro/2026
- [ ] Conferência exigida pelo ticket: bater uma semana, um mês e o acumulado do
      ano contra a fonte
- [ ] Automatizar o `build_data.js` para rodar em D-1, antes do warmup de segunda
- [ ] Atualizar o relatório no Fabric para ele enxergar os paylinks — aí
      `EXCLUI_PAYLINK` vira `false` e os dois ficam completos
