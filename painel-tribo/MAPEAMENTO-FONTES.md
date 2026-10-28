# Painel da Tribo — de onde vem cada número

Relação dado → fonte. Para conferir qualquer indicador do painel contra a
origem dele.

**Painel:** https://vesti-mobi.github.io/dados/painel-tribo/
**Atualização:** todo dia às 05:00, automática. Os dados vão até D-1.

---

## Aba Plataforma

| Indicador | Fonte | Campo e régua |
|---|---|---|
| **GMV** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `summary_total`, pela data de criação do pedido |
| **GMV via integração** | idem, cruzado com `vestilake_BI.odbc_domains` | mesma soma, só de domínio com `integration_owner` preenchido |
| **GMV via Oráculo** | BigQuery `vestilake_BI.oraculo_Pedidos` | `Tipo_Venda_Oraculo` — venda direta e influenciada, classificação pronta da fonte |
| **CSAT e Resposta · Integrações** | Planilha **OKRs e KPIs - Tribo 1**, aba `Integração - KPIs` | linhas 97 a 99: CSAT, Total atendimentos e % de respostas |
| **CSAT e Resposta · Plataforma** | Planilha **OKRs e KPIs - Tribo 1**, abas `Plataforma - KPIs` e `Plataforma - KPIs (2026)` | confecção e multimarca somados |
| **CSAT e Resposta · VestiPago** | BigQuery `huggy.chats_raw` + `huggy.csat_raw` | tabulação "Vestipago", agentes Vânia, Kalinka e Tiago, departamentos Confecção, Multimarca e Parceiro |
| **SLA · as três equipes** | Planilha **SLA Vesti**, abas `SLA - Integração`, `SLA - Plataforma` e `SLA - Vestipago` | lista de tickets, pela data de fechamento; dias corridos entre abertura e resolução |

## Aba Pagamento

| Indicador | Fonte | Campo e régua |
|---|---|---|
| **TPV cartão e Pix** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `payment_transaction_value`, pela data de pagamento, só `payment_type` PRE/POST |
| **Receita · MDR** | BigQuery `vestilake_BI.vestipago_transaction_detail` | `mdrVestiValue`, só cartão — a fatia que fica com a Vesti, sem a da bandeira |
| **Receita · Antifraude** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `payment_transaction_antifraudValue` |
| **Receita · Antecipação** | BigQuery `vestilake_BI.vestipago_transaction_detail` | `antecipationVestiFee` — a taxa, não o valor antecipado |
| **Antifraude · Aprovação** | BigQuery `vestilake_BI.MongoDB_Pedidos_Geral` | `payment_analysisStatus`: aprovadas ÷ (aprovadas + recusadas) |
| **Antifraude · Tempo médio de análise** | Planilha **Metrica Antifraude 2026** (xlsx), aba `Resumo Semanal` | coluna "Analise Geral" — o tempo de todas as análises, não só as manuais |
| **Antifraude · Chargeback** | Planilha **Chargebacks**, abas `Chargeback 2025` e `Chargeback 2026` | só status "Perdido", com e sem seguro somados |

## Atacado e varejo

O seletor filtra o painel inteiro. A origem é
`vestilake_BI.odbc_companies.layout_webmobile` — 1 para atacado, 2 para varejo.
É a mesma régua do relatório "GMV - Métricas 2025" e classifica 100% do GMV.

CSAT, taxa de resposta e SLA aparecem com o mesmo valor em Atacado, Varejo e
Total: as fontes registram atendimento por equipe, não por tipo de loja.

---

## Como os números são montados

A base é **diária** e guarda os componentes de cada indicador, nunca o
indicador pronto. O painel soma o intervalo escolhido e só então divide: taxas
e médias saem dos totais do período, nunca de média de médias diárias.

A comparação é sempre contra o **mesmo intervalo 364 dias antes** — 52 semanas,
alinhado pelo dia da semana.

Onde a fonte não cobre o período, o painel mostra `—`, sem número e sem selo de
variação. Um valor desconhecido nunca vira zero.

## Duas réguas de data, de propósito

GMV e aprovação do antifraude usam a **data de criação** do pedido, porque são
venda. TPV e receita usam a **data de pagamento**, porque são eventos
financeiros. Por isso "TPV % do GMV" cruza dois recortes.

---

## Conferência contra as fontes oficiais

Feita em 27/10/2026.

| Comparação | Resultado |
|---|---|
| GMV × relatório "GMV - Métricas 2025" (Fabric), 22 meses | 0,009% no pior mês de 2025 |
| CSAT e taxa de resposta × planilha de KPIs | idênticos |
| SLA × planilha SLA Vesti | idêntico |
| Tempo de análise × planilha de antifraude | idêntico |
| Chargeback × planilha, 10 meses de 2026 | ao centavo |
| MDR e antecipação × BI do VestiPago | 0,00% |
| Receita de antifraude × BI do VestiPago | até 1% |
| TPV × BI do VestiPago | até 0,7% |

As duas últimas têm explicação conhecida: o painel lê o antifraude do pedido,
que tem histórico desde 2025, enquanto o BI lê da
`vestipago_transaction_detail`, que começa em maio de 2026. No TPV, a oscilação
é de pedido na fronteira da semana — o cartão, que tem registro nas duas
tabelas, fica dentro de 0,25%.

> Ao comparar com o BI do VestiPago, use o seletor em **Total**: o BI não separa
> atacado de varejo, e o painel abre em Atacado.

## Até onde cada fonte cobre hoje

| Indicador | Cobertura |
|---|---|
| GMV, GMV integração, GMV Oráculo, TPV, receita, aprovação | completa, até D-1 |
| CSAT · VestiPago | completa, até D-1 |
| CSAT · Integrações e Plataforma | semanal, conforme a planilha é preenchida |
| Tempo de análise | semanal, só 2026 — sem comparação anual |
| MDR e antecipação | só de maio/2026 em diante, logo a Receita total ainda não tem comparação anual |
| SLA | parado em 09/10 e sem 2025 — a planilha depende de reexportação |
| Chargeback | amadurece para trás: entra como "Disputa" e só vira "Perdido" quando julgado |

---

O mapa completo, com os filtros exatos de cada consulta e o porquê de cada
escolha de régua, está em `FONTES.md`, nesta mesma pasta.
