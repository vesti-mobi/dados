# Painel da Tribo — mapeamento de fontes

Tabela indicador → origem → responsável → atualização, como pede o MDATA-503.
Serve para cada dono validar o próprio número antes do warmup.

**Painel:** https://vesti-mobi.github.io/dados/painel-tribo/
**Atualização:** todo dia às 05:00, automática. Os dados vão até D-1.
**Última conferência:** 28/10/2026.

---

## Aba Plataforma

| Indicador | Origem | Campo e régua | Dono | Atualiza |
|---|---|---|---|---|
| **GMV** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `summary_total`, pela data de criação do pedido | Plataforma | diária, D-1 |
| **GMV via integração** | idem + `odbc_domains` | mesma soma, só de domínio com `integration_owner` preenchido | Integrações | diária, D-1 |
| **GMV via Oráculo** | BigQuery `vestilake_BI.oraculo_Pedidos` | `Tipo_Venda_Oraculo` (direta e influenciada), classificação pronta da fonte | Oráculo Vendas | diária, D-1 |
| **CSAT · Integrações** | Planilha **OKRs e KPIs - Tribo 1**, aba `Integração - KPIs` | linhas 97 a 99 (CSAT, Total atendimentos, % de respostas) | Integrações | manual, semanal |
| **CSAT · Plataforma** | mesma planilha, abas `Plataforma - KPIs` e `Plataforma - KPIs (2026)` | confecção e multimarca somados | Plataforma | manual, semanal |
| **CSAT · VestiPago** | BigQuery `huggy.chats_raw` + `huggy.csat_raw` | tabulação "Vestipago", agentes Vânia/Kalinka/Tiago, departamentos Confecção/Multimarca/Parceiro | VestiPago | diária, automática |
| **SLA · as três equipes** | Planilha **SLA Vesti**, abas `SLA - Integração`, `SLA - Plataforma`, `SLA - Vestipago` | lista de tickets, pela data de fechamento; dias corridos entre abertura e fechamento | cada equipe | manual |

## Aba Pagamento

| Indicador | Origem | Campo e régua | Dono | Atualiza |
|---|---|---|---|---|
| **TPV cartão e Pix** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `payment_transaction_value`, pela data de pagamento, `payment_type` PRE/POST | VestiPago | diária, D-1 |
| **Receita · MDR** | BigQuery `vestilake_BI.vestipago_transaction_detail` | `mdrVestiValue`, só cartão — a fatia que fica com a Vesti | VestiPago | diária, D-1 |
| **Receita · Antifraude** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `payment_transaction_antifraudValue` | VestiPago | diária, D-1 |
| **Receita · Antecipação** | BigQuery `vestilake_BI.vestipago_transaction_detail` | `antecipationVestiFee` — a taxa, não o valor antecipado | VestiPago | diária, D-1 |
| **Antifraude · Aprovação** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `payment_analysisStatus`: aprovadas ÷ (aprovadas + recusadas) | VestiPago | diária, D-1 |
| **Antifraude · Tempo médio** | Planilha **Metrica Antifraude 2026** (xlsx), aba `Resumo Semanal` | coluna "Analise Geral" — o tempo de todas as análises | VestiPago | manual, semanal |
| **Antifraude · Chargeback** | Planilha **Chargebacks**, abas `Chargeback 2025` e `Chargeback 2026` | só status "Perdido", com e sem seguro somados | VestiPago | manual |

## Segmento (atacado / varejo)

O seletor filtra o painel inteiro. A origem é `odbc_companies.layout_webmobile`
(1 atacado, 2 varejo), a mesma régua do relatório "GMV - Métricas 2025".
Classifica 100% do GMV.

Os indicadores de suporte — CSAT, resposta e SLA — não se dividem por segmento:
as fontes registram por equipe, não por tipo de loja. Por isso aparecem com o
mesmo valor em Atacado, Varejo e Total.

---

## Como os números são calculados

A base é **diária** e guarda os **componentes**, nunca o indicador pronto. O
painel soma o intervalo escolhido e só então divide: taxas e médias saem dos
totais do período, nunca de média de médias diárias.

A comparação é sempre contra o **mesmo intervalo 364 dias antes** — 52 semanas,
alinhado pelo dia da semana. Nunca contra o mês anterior.

**Um valor desconhecido nunca vira zero.** Onde a fonte não cobre o período, o
painel mostra `—`, sem número e sem selo de variação. Num warmup, um zero seria
lido como queda, e ausência de dado não é queda.

---

## Conferência contra as fontes oficiais

Feita em 27/10/2026, antes de publicar.

| Comparação | Resultado |
|---|---|
| GMV × relatório "GMV - Métricas 2025" (Fabric) | **0,009%** no pior mês de 2025; 22 meses conferidos |
| CSAT e resposta × planilha de KPIs | idênticos |
| SLA × planilha SLA Vesti | idêntico, mesma contagem de tickets |
| Tempo de análise × xlsx de antifraude | idêntico |
| Chargeback × planilha | **ao centavo** nos 10 meses de 2026 |
| MDR e antecipação × BI do VestiPago | **0,00%** |
| Receita de antifraude × BI | até 1% |
| TPV × BI | até 0,7% |

As duas últimas diferenças têm explicação conhecida: o painel lê o antifraude
do pedido, que tem histórico desde 2025, enquanto o BI lê da
`vestipago_transaction_detail`, que começa em maio/2026. No TPV, a oscilação é
de pedido na fronteira da semana — o cartão, que tem registro nas duas tabelas,
fica dentro de 0,25%.

> **Ao conferir com o BI do VestiPago, use o seletor em "Total".** O BI não
> separa atacado de varejo; o painel abre em Atacado.

---

## O que ainda limita a leitura

| Indicador | Situação |
|---|---|
| **SLA** | Fontes paradas em **09/10**. A planilha depende de alguém reexportar os tickets; a semana corrente aparece vazia. Também não há 2025, então não há comparação anual. |
| **Tempo de análise** | Só 2026 — sem comparação anual. |
| **MDR e antecipação** | Só de **maio/2026** em diante: é a janela da tabela que separa a fatia da Vesti. Por isso a **Receita total** também não tem comparação anual ainda. |
| **Chargeback** | Amadurece para trás: um chargeback entra como "Disputa" e só vira "Perdido" quando julgado, semanas depois. O valor da semana atual tende a subir. |
| **Oráculo** | A classificação começa em **outubro/2025**, com volume mínimo. A variação contra 2025 aparece na casa dos milhares por cento porque a base era quase zero — é o dado real. |
| **SLA da Integração** | Dois dos tickets de setembro se chamam "Teste Ticket" e zeram a média da equipe. Há uma chave para ignorá-los, hoje desligada, aguardando decisão do dono. |

## Pontos que dependem de cada dono

- **VestiPago** — o MDR caiu de ~R$ 28 mil/mês (jun–ago) para R$ 9,2 mil em
  setembro e R$ 4,8 mil em outubro. Confirmar se foi mudança de precificação ou
  campo que parou de ser preenchido.
- **Chargeback** — uma linha de 2026 está com a data digitada como `13/10/2-26`
  e ficou de fora: são R$ 1.422,21 que entram quando a célula for corrigida.
  Outras duas, na aba de 2025, estão datadas de 31/12/2026.
- **Todas as equipes** — as planilhas de SLA, chargeback e tempo de análise são
  preenchidas à mão. O painel lê todo dia às 05:00: o que estiver lá entra, o
  que faltar aparece como `—`.
