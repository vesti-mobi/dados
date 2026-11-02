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
| **CSAT e Resposta · as três equipes** | BigQuery `huggy.chats_raw` + `huggy.csat_raw` | departamentos **Confecção, Multimarca e Parceiro**; dentro deles cada equipe é uma **tabulação**: VestiPago (43825), Integração (43826) e Plataforma (todas as demais). Sem recorte de pessoa. Fora da conta: *Não interagiu*, *Testes* e *Atendimento duplicado*, que não são atendimento. Nota = média das notas 1 a 5; resposta = avaliados ÷ atendimentos |
| **CSAT · macro** | idem | a soma das três equipes |
| **SLA · as três equipes** | **HubSpot**, pipeline Suporte | tickets encerrados com identificador Jira, categoria "Erro - <equipe>"; dias corridos entre abertura e fechamento, pelo dia do fechamento |

### Por que três departamentos, e não só Confecção

A equipe de Plataforma atende também as **multimarcas** — as lojistas
compradoras, que usam a plataforma sem vender nela. A planilha de KPIs dela
mede isso em dois blocos, um por departamento, e os soma. VestiPago e
Integração são praticamente só Confecção (96% e 98%).

Não confundir com o atacado/varejo do painel: multimarca não é o segmento
varejo. A régua de segmento é `odbc_companies.layout_webmobile`.

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
| CSAT × exportação do Huggy (Analítico → Exportar), set/2026 | nota 4,805 contra 4,807 |
| Atendimentos × planilha de KPIs da Plataforma, 17 semanas | desvio somado de 0,2% no bloco de confecção; ~6% semana a semana |
| Taxa de resposta × planilha de KPIs da Plataforma, 30 semanas | 28,2% contra 28,6% |
| CSAT × planilha de KPIs da Plataforma, 30 semanas | 4,91 contra 4,78 — ver abaixo |
| SLA × planilha SLA Vesti | idêntico |
| Tempo de análise × planilha de antifraude | idêntico |
| Chargeback × planilha, 10 meses de 2026 | ao centavo |
| MDR e antecipação × BI do VestiPago | 0,00% |
| Receita de antifraude × BI do VestiPago | até 1% |
| TPV × BI do VestiPago | até 0,7% |

### O CSAT fica acima do da planilha, e isso é esperado

O painel marca cerca de **0,1 acima** da planilha, de forma sistemática. A
causa foi medida, não suposta: as duas fontes contam avaliações diferentes.

Nas semanas 27 a 43, bloco de confecção, a planilha registra 528 avaliações
somando 2.561 pontos (CSAT 4,85); o Huggy tem 552 somando 2.712 (CSAT 4,91).
As 24 avaliações a mais do Huggy teriam de ter média **6,29** para explicar a
diferença — acima do máximo da escala. Logo não é questão de cobertura: as
notas em si divergem.

Onde divergem: a planilha tem **18 avaliações negativas** no período e o Huggy
tem **11**; em contrapartida o Huggy tem 31 positivas a mais. Ou seja, a
planilha guarda notas ruins que já não existem no Huggy.

A leitura mais provável é que a API devolva a avaliação **vigente** do
atendimento: nota ruim é a que o time reabre e resolve, e o cliente reavalia. A
planilha congelou a nota do dia da apuração. Não é demonstrável, porque o
endpoint de feedback expõe só `score` e `text`, sem data nem histórico.

As duas respondem perguntas diferentes — a planilha, "como estava quando
apuramos"; o painel, "como está hoje". O painel segue o Huggy porque é
reproduzível: quem reconsultar chega no mesmo número.

### Os atendimentos também oscilam por semana

O CSAT da Plataforma não reproduz a planilha célula a célula, e isso é
esperado: a planilha é fechada à mão, em dias que variam, então um atendimento
cai de um lado ou do outro da fronteira da semana. Os desvios oscilam para os
dois lados e se cancelam (soma de −4 em ~1.700 atendimentos), que é a
assinatura de ruído e não de régua faltando — foram testadas as réguas por data
de criação e de fechamento, com e sem filtro de encerrado, e nenhuma reduz a
diferença. No acumulado do mês em diante, bate.

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
| CSAT · as três equipes | completa, até D-1 |
| Tempo de análise | semanal, só 2026 — sem comparação anual |
| MDR e antecipação | só de maio/2026 em diante, logo a Receita total ainda não tem comparação anual |
| SLA | completo até ontem, lido do HubSpot; sem 2025, logo sem comparação anual |
| Chargeback | amadurece para trás: entra como "Disputa" e só vira "Perdido" quando julgado |

---

O mapa completo, com os filtros exatos de cada consulta e o porquê de cada
escolha de régua, está em `FONTES.md`, nesta mesma pasta.
