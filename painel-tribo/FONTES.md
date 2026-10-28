# De onde vem cada número do Painel da Tribo

Documento de proveniência. Para cada bloco da tela, qual tabela, qual coluna e
qual filtro produziram o número. Tudo vem do BigQuery, projeto
`vesti-data-499015`, dataset `vestilake_BI`, região `us-central1`.

Nada no painel é digitado à mão, vem de planilha ou de API em tempo real. O
único arquivo de dados é `dados.js`, gerado por `build_data.js`.

---

## As tabelas usadas

| Tabela | Linhas | Para que serve aqui |
|---|---|---|
| `MongoDB_Pedidos_Geral` | 1,35 mi | GMV, TPV, receita de antifraude, análises do antifraude |
| `odbc_companies` | — | Dizer se o domínio é atacado ou varejo |
| `odbc_domains` | 2,20 mi | Dizer se o domínio tem integração com ERP |
| `oraculo_Pedidos` | 683 mil | GMV via Oráculo, já classificado na origem |
| `vestipago_transaction_detail` | 49,8 mil | Receita de MDR e de antecipação |

Tabelas que **não** são usadas, e por quê:

- `confeccao_tipo_empresa` — classifica atacado/varejo, mas deixa ~4% do GMV de
  fora e discorda do `layout_webmobile` em R$ 11 mi/mês. O relatório usa o
  `layout_webmobile`, e o painel seguiu.
- `odbc_quotes` — é a fonte do "GMV v1" do relatório, mas os dados param em
  **maio/2024**. Para 2025 e 2026 ela contribui zero, então o painel não a usa.
- `transaction_detail_orders` — espelho menor da `vestipago_transaction_detail`.
- `bdr` — ledger de antecipação de **um** provedor só; em set/2026 tinha 335
  linhas contra 8.963 na `vestipago_transaction_detail`. Daria um número
  volátil e incompleto.
- `o-orders`, `oraculo_Atendimentos`, `MongoDB_Starkbank_*` — não cobrem nenhum
  indicador do ticket.

---

## O recorte que vale para o painel inteiro

### Atacado / Varejo / Total

O seletor do topo filtra **tudo**. São três posições: os dois segmentos
separados, como o ticket pede, e **Total** para a soma dos dois — útil para
conferir contra o BI do VestiPago, que não separa segmento.

> No Total, os valores financeiros somam. Os indicadores de suporte **não**,
> com uma exceção: CSAT, taxa de resposta e SLA das Integrações e do VestiPago
> valem para a equipe inteira e vêm repetidos nos dois segmentos, então somá-los
> contaria cada atendimento duas vezes — no Total eles aparecem com o mesmo
> valor. O CSAT da Plataforma em 2026 é a exceção: ali atacado e varejo são
> públicos diferentes (confecção e multimarca), e somar é o certo.
>
> O ticket deixou a visão consolidada fora da v1 ("são duas dinâmicas
> diferentes"), então o padrão continua sendo Atacado — o Total é uma terceira
> opção, não o novo padrão.

A origem é
`odbc_companies.layout_webmobile` — o layout da loja: `1` é atacado, `2` é
varejo. É a mesma régua do relatório.

Um domínio pode ter mais de uma empresa; vale a principal, a de menor `id`.
Classifica 100% do GMV.

> `MongoDB_Pedidos_Geral.settings_type` parece servir para isso, mas vem vazio
> em praticamente todo pedido (34 preenchidos em 66 mil num mês). Não é usado.

### Período e comparação

O filtro de datas abre na última semana fechada de segunda a domingo. A
comparação é o mesmo intervalo **364 dias antes** — 52 semanas exatas, o que
mantém o alinhamento por dia da semana. Nenhum número do painel compara com o
mês anterior.

---

## Aba Plataforma

### GMV (bloco macro)

**`MongoDB_Pedidos_Geral`** · soma de `summary_total`

Data de referência: `settings_createdAt` — a criação do pedido, porque GMV é
venda. Filtros, todos iguais aos do relatório:

| Filtro | Por quê |
|---|---|
| `isClosed = 'True'` | pedido fechado |
| `status_canceled_isCanceled = 'False'` | não cancelado |
| `payment_isPaid` preenchido (`'true'` **ou** `'false'`) | separa pedido de rascunho |
| `settings_source != 'Link de cobrança'` | o relatório não tem paylinks |
| `summary_total > 0` | descarta pedido zerado |
| dedup por `_id` | o relatório faz `Table.Distinct` |

> **O GMV conta pedido não pago.** Não é engano: é a régua do relatório, que
> soma todo pedido com `payment_isPaid` preenchido, independente do valor. Em
> 2025 isso é R$ 1,02 bi contra R$ 0,70 bi só de pagos. Para contar só pago,
> `SO_PAGOS = true` no `build_data.js`.

> **Os paylinks ficam de fora.** `Link de cobrança` entrou no lake depois do
> último refresh do relatório, então ele não os tem: R$ 68 mi em 2025 e R$ 75
> mi em 2026 de venda real que o painel deixa de contar para os números
> baterem. Quando o relatório for atualizado no Fabric, virar `EXCLUI_PAYLINK`
> para `false` dos dois lados.

Sem teto por pedido. (O painel CS corta pedido acima de R$ 50 mil para tirar
outlier; aqui não se corta. A chave `TETO_PEDIDO` liga isso.)

### Integração (micro do GMV)

**`MongoDB_Pedidos_Geral`** + **`odbc_domains`**

Mesma soma do GMV, restrita aos pedidos cujo domínio tem
`odbc_domains.integration_owner` preenchido — 768 domínios. É a régua do
relatório, que monta a tabela "Domains e integração" com
`WHERE integration_owner IS NOT NULL`.

> `integration_type` daria quase o mesmo (771 domínios, 3 de diferença), mas
> quem manda no relatório é o `integration_owner`.

O percentual exibido é esse valor dividido pelo GMV do bloco de cima.

### Oráculo (micro do GMV)

**`oraculo_Pedidos`** · soma de `summary_total` por `Tipo_Venda_Oraculo`

`Venda Direta` é o direto, `Venda Influenciada` é o influenciado, e o painel
soma os dois. A classificação **vem pronta da fonte**: o painel não aplica
janela de atribuição nem recalcula nada, conforme a decisão do ticket.

> Esta classificação só passa a existir em **outubro/2025**, e com volume
> mínimo até o fim do ano. Por isso a variação contra 2025 aparece na casa dos
> milhares por cento — a base era quase zero. É o dado real.

### Suporte

Não existe tabela de atendimento no lake. A fonte é a planilha
**"OKRs e KPIs - Tribo 1"** (Google Sheets, dono guilherme@vesti.mobi), lida
direto pela API a cada execução — não há cópia intermediária nem passo manual.

O acesso usa a service account **painel-cs-sheets-reader@csatenps**, a mesma do
PainelCSGerencial, que já estava compartilhada na planilha. A chave é procurada
em `GOOGLE_SHEETS_SA_JSON_FILE`, depois em `painel-tribo/google_sa.json` e em
`../PainelCSGerencial/google_sa.json`.

Cada equipe tem uma aba com régua própria:

| Equipe | Aba | Linhas (0-based) | Cobertura |
|---|---|---|---|
| Integrações | `Integração - KPIs` | 96 CSAT · 97 atendimentos · 98 % de respostas | 94 semanas, 2025/S1 → 2026/S43 |
| Plataforma | `Plataforma - KPIs` (2025) | 14 CSAT · 16 atendimentos · 15 Taxa de Resposta | 26 semanas, **2025/S27** → S52 |
| Plataforma | `Plataforma - KPIs (2026)` | dois blocos: 13/15/14 confecção e 21/23/22 multimarca | 2026/S2 → S43 |

**VestiPago não vem mais da planilha** — vem do Huggy, no BigQuery. Ver abaixo.

Três detalhes que as abas não compartilham:

- **Plataforma está partida em duas abas** — uma por ano — e, em 2026, em dois
  públicos: confecção e multimarca. Os dois somam no mesmo número, porque é uma
  equipe só atendendo dois tipos de cliente. Na semana 19–25/10/2026: confecção
  28,72% de resposta com 94 atendimentos e multimarca 24,62% com 130 dão
  **26,3% consolidado**, com CSAT 4,5 ponderado pelo volume.

  > **Confecção e multimarca não são o atacado e o varejo do painel.** Cheguei
  > a mapear assim, e os números desmentem: o layout varejo tem 48 lojas contra
  > 654 do atacado, mas o suporte a multimarca registra 443 atendimentos contra
  > 843 da confecção — nove por loja contra um e pouco. As multimarcas
  > atendidas são as lojistas **compradoras**, clientes das confecções; elas não
  > aparecem no GMV como vendedoras. São recortes diferentes, e por isso o
  > número do suporte da Plataforma é o mesmo nos dois segmentos.
- **VestiPago grava a taxa como 42,2** e não como 0,422. O leitor divide por 100
  quando o valor passa de 1,5.
- **O cabeçalho da aba de VestiPago diz "Dom - Sab"**, mas o time confirmou que
  todas as abas seguem semana ISO, de segunda a domingo. O rótulo está
  desatualizado.

#### CSAT do VestiPago — direto do Huggy

Esta equipe não passa pela planilha. A fonte é o **mesmo BigQuery** do resto do
painel, dataset `huggy`, que guarda os atendimentos e as notas vindos da
ferramenta de atendimento:

```sql
FROM `vesti-data-499015.huggy.chats_raw` c
LEFT JOIN `vesti-data-499015.huggy.csat_raw` f ON f.chat_id = c.id
WHERE tabulationId = '43825'                      -- "Vestipago"
  AND agentId IN ('94200','111156','172808')      -- Vânia, Kalinka, Tiago
  AND departmentId IN ('49778','49777','52888')   -- Confecção, Multimarca, Parceiro
  AND closedAt IS NOT NULL
```

Recorte confirmado com a equipe. "Marca", como chamam o departamento, é o
`Confecção` do Huggy — não existe um departamento com esse nome.

Aqui **não há reconstrução**: a consulta devolve os componentes de verdade —
atendimentos fechados, quantos avaliaram e a soma das notas — por dia. É melhor
que a planilha em três frentes: granularidade diária, sem aproximação a partir
de taxas arredondadas, e sem depender de alguém copiar à mão.

> O BI (repo `vesti-pago-kpis`) usa um quarto agente, **Marilecia** (192502),
> que não está na régua informada pela equipe. São 3 atendimentos em 2026,
> 0,07% do total. Para bater com o BI ao centavo, acrescente o id em
> `CSAT_VP.agentes` no `build_data.js`.

##### Até onde a série vai

O limite é a **data da última carga da `csat_raw`** (coluna `_loaded_at`),
limitada ao fim da série. Até ali, dia sem nota vale zero avaliação de verdade;
depois dali é desconhecido, e as colunas vão null — senão a taxa de resposta
apareceria como 0%, que seria falso.

> Cortar pelo último dia **com** nota não funciona: sábado e domingo não têm
> atendimento, então a série terminaria sempre na sexta e derrubaria a semana
> inteira para `—`.

**Histórico:** a ingestão ficou parada de 29/09 a 26/10/2026, porque a variável
`CSAT_TABULATION_ID` tinha saído do `.env` da máquina que roda o pipeline
(`vesti-mobi/huggy-to-bigquery`) — sem ela, o script pula a coleta de CSAT em
silêncio, enquanto a carga de chats segue normal. Religada em 26/10 com
`CHATS_LOOKBACK_DAYS=30`, recuperando os 27 dias.

O pipeline agora roda de `~/Documents/huggy-to-bigquery` nesta máquina, usando
a credencial do gcloud (ADC) em vez de service account. **Não está agendado** —
precisa ser rodado à mão, ou movido para Cloud Scheduler.

##### Comparação com a planilha

Onde as duas se sobrepõem, a taxa de resposta bate e a nota às vezes diverge:

| Semana | Huggy | Planilha |
|---|---|---|
| S36 | 4,67 · 41,01% | 4,81 · 41,01% |
| S37 | 4,80 · 40,91% | 4,98 · 39,82% |
| S38 | 4,93 · 42,20% | 4,93 · 42,20% |
| S39 | **4,88 · 33,06%** | *(vazia)* |

O Huggy recalcula quando chega avaliação atrasada; a planilha guardou o valor
do dia em que foi copiada. E a S39, que a planilha nunca recebeu, existe na
origem — o painel ganhou uma semana só com a troca de fonte.

#### Como a planilha vira componente diário (Integrações e Plataforma)

A planilha guarda o indicador **pronto** (CSAT médio, % de resposta) e tudo é
**digitado à mão** — nenhuma daquelas células tem fórmula. O painel precisa dos
componentes para somar um intervalo qualquer sem cair em média de médias:

```
pesquisas enviadas = atendimentos
respostas          = atendimentos x taxa_resposta
soma das notas     = csat x respostas
```

Com isso o CSAT de um período sai ponderado pelo volume de cada semana. Não é
idêntico ao que sairia dos componentes reais — a planilha já arredonda as duas
taxas — mas é o mais perto da regra do ticket que esta fonte permite. Conferido
na semana 12–18/10/2026 para Integrações: CSAT 5,00 e resposta 45,0%, iguais à
planilha.

O valor da semana é diluído nos 7 dias, porque o painel soma dias: semana
fechada bate exato, recorte parcial fica proporcional. Semana sem atendimento
fica null, não zero — o painel mostra `—` em vez de fingir que o CSAT despencou.

**O número não separa atacado de varejo** — é o suporte inteiro da equipe —
então aparece igual nos dois segmentos.

#### O macro de Suporte

Sai da soma dos componentes das três equipes, não da média dos três CSATs. Se
**qualquer** equipe estiver sem dado no período, o macro fica `—`: um CSAT da
tribo com duas equipes de três seria um número errado.

> Hoje isso acontece: a aba de **VestiPago está parada na semana 38**
> (14–20/set/2026), quatro semanas atrás. Enquanto não for atualizada, o macro
> de Suporte não aparece para as semanas recentes — embora 2025 inteiro
> funcione, inclusive a comparação anual.

#### SLA

Fonte diferente do CSAT: a planilha **"SLA Vesti"**, abas `SLA - Integração`,
`SLA - Plataforma` e `SLA - Vestipago`. Cada uma traz, a partir da linha 22, a
**lista de tickets um a um** — e não um indicador pronto.

| Coluna | Uso |
|---|---|
| 5 · Data de Fechamento | o dia em que o ticket entra na conta |
| 7 · SLA (Horas) | o tempo que vira `sla_dias` (÷ 24) |
| 3 · Nome do Ticket | só para identificar ticket de teste |

Aqui **não há reconstrução nem diluição**: existem os componentes de verdade.
`sla_dias_<equipe>` é a soma dos dias e `sla_qtd_<equipe>` a contagem de
tickets, ambos no dia do fechamento — "atendimentos resolvidos no período",
como o ticket define.

A coluna "SLA (Horas)" é o tempo **corrido** entre abertura e fechamento,
conferido ticket a ticket nos 320 da Plataforma: bate com a diferença das duas
datas em todos. É exatamente a régua do MDATA-503 — dias corridos, fim de
semana e feriado incluídos.

Dentro da janela que a planilha cobre, dia sem ticket vale **zero** resolvidos.
Fora dela fica null: ali não dá para saber se ninguém fechou ticket ou se a
planilha ainda não foi atualizada.

##### O que esperar desses números

- **A janela é 05/01/2026 a 09/10/2026.** Não há ticket de 2025, então **o SLA
  não tem comparação anual** — a referência aparece como `—`. E como o último
  fechamento é 09/10, a semana 12–18/10 (a que o painel abre por padrão) ainda
  fica sem SLA.
- **Volume baixo:** 26 tickets na Integração, 45 no VestiPago, 320 na
  Plataforma, no ano inteiro. Para comparação, o CSAT da Integração sozinho
  mede ~24 atendimentos por semana. **Não são a mesma população:** o CSAT mede
  atendimento de suporte, o SLA mede ticket de erro escalado para o time
  técnico. Os dois blocos vivem lado a lado no painel, mas não falam das
  mesmas ocorrências.
- **Os valores estouram a régua com folga.** Em setembro/2026: Plataforma 50,4
  dias e VestiPago 67,6. A régua do ticket é 3 dias, então o SLA vai aparecer
  vermelho em praticamente todo período. É o dado real de ticket de bug, não
  erro de conta.

> **Tickets de teste.** A planilha ainda está em construção e tem tickets
> chamados "Teste Ticket" dentro. Em setembro/2026 os **únicos dois** tickets da
> Integração eram exatamente esses, fechados em minutos: o SLA da equipe dava
> **0,0 dia** — um número ótimo e falso, e ainda por cima verde na régua.
>
> O painel **não** filtra isso hoje, para não inventar regra sobre o dado de
> outra equipe. Para ligar o filtro, `IGNORAR_TICKETS_TESTE = true` no
> `suporte.js`: aí a Integração passa a mostrar `—` em setembro, que é o
> honesto. Plataforma e VestiPago não mudam.

---

## Aba Pagamento

### Receita (bloco macro)

Soma de MDR + Antifraude + Antecipação. Não existe coluna de "receita total" em
lugar nenhum: o painel soma os três componentes.

Como MDR e antecipação só existem de maio/2026 em diante, a Receita total
também só existe a partir daí. Antes disso aparece `—`, e não um número menor:
somar dois dos três componentes e chamar de receita inflaria o crescimento
contra 2025.

### MDR (micro da Receita)

**`vestipago_transaction_detail`** · soma de `mdrVestiValue` **só de cartão** ·
por `paidAt`

Só a fatia que fica com a Vesti. A fatia da bandeira (`mdrCardBrandValue`) não
é receita e fica de fora.

O recorte de cartão é o que o BI do VestiPago usa: incluir o Pix dava R$
1.674,87 na semana 12–18/10 contra os R$ 1.534,89 do BI, e a diferença é
exatamente os R$ 139,98 de MDR em Pix. Com o recorte, bate aos centavos.

> As duas somadas dão exatamente `vestiPagoValue` (conferido no acumulado de
> 2026: R$ 1.419.653,57 dos dois lados). O `vestiPagoValue` existe também no
> pedido e cobriria 2025, mas não separa uma fatia da outra — por isso o
> histórico de MDR começa onde esta fonte começa, em maio/2026.

> **Atenção:** o MDR cai de ~R$ 28 mil/mês entre junho e agosto para R$ 9,2 mil
> em setembro e R$ 4,8 mil em outubro. Pode ser mudança de precificação ou campo
> que parou de ser preenchido. Confirmar com o VestiPago.

### Antifraude (micro da Receita)

**`MongoDB_Pedidos_Geral`** · soma de `payment_transaction_antifraudValue` ·
por `payment_paidAt`

Vem do pedido, e não da `vestipago_transaction_detail`, porque assim há
histórico desde janeiro/2025 — e com ele a comparação anual.

O custo é ficar de **0,2% a 1% abaixo do BI** do VestiPago, que lê a
transaction detail. Não é régua diferente: é ruído entre as duas tabelas do
lake. Trocar a fonte faria bater aos centavos e custaria o histórico de 2025;
é uma linha no `build_data.js` se o dono do número preferir assim.

### Antecipação (micro da Receita)

**`vestipago_transaction_detail`** · soma de `antecipationVestiFee` · por
`paidAt`

A taxa que fica com a Vesti, não o valor antecipado.
`payment_transaction_antecipationValue`, no pedido, é o **valor antecipado**
(R$ 326 mil em set/2026 contra R$ 55 mil de taxa) — seis vezes maior e não é
receita. Existe só nesta fonte, logo começa em maio/2026.

### TPV (bloco macro)

**`MongoDB_Pedidos_Geral`** · soma de `payment_transaction_value` · por
`payment_paidAt`

> **Não é `summary_total`.** TPV é o que passou pelo meio de pagamento, e
> cartão parcelado cobra acréscimo acima do total do pedido. Na semana
> 28/09–04/10 o `summary_total` ficava 2,23% abaixo do BI; o
> `payment_transaction_value` fica a 0,09%.

Filtros: `payment_isPaid = 'True'`,
`payment_type IN ('PRE_PAYMENT','POST_PAYMENT')`,
`payment_method IN ('CREDIT_CARD','PIX')`.

O `payment_type` é o que marca o pagamento processado pelo VestiPago. `MANUAL`
é pagamento combinado fora da plataforma e fica de fora.

**O TPV conta os paylinks**, ao contrário do GMV. Os dois têm referências
diferentes: o GMV responde ao relatório "GMV - Métricas 2025", que não tem
paylink; o TPV e a receita respondem ao BI do VestiPago
(bi.vesti.com.br/kpis), que tem. Aplicar o filtro aos dois cortava 25% do TPV e
42% da receita de antifraude contra aquela fonte.

> **Consequência:** "TPV % do GMV" cruza duas populações — o numerador inclui
> paylink, o denominador não. A razão sai mais alta do que seria se os dois
> usassem a mesma base. É o preço de cada indicador bater com a sua própria
> fonte oficial.

> **Por que não sai da `vestipago_transaction_detail`:** aquela tabela é de
> cartão e quase não tem Pix — R$ 24 mil em set/2026, contra R$ 12,6 mi nos
> pedidos no mesmo mês. Usá-la zeraria o Pix do painel.
>
> A régua foi conferida no cartão, onde as duas fontes se encontram: R$ 12,70 mi
> pelo pedido contra R$ 12,64 mi pela transaction detail, em set/2026.

**"% do GMV":** TPV dividido pelo GMV do mesmo período. Note que são dois
recortes de data diferentes de propósito — GMV pela criação do pedido, TPV pelo
pagamento — então a razão cruza duas réguas.

### Cartão e Pix (micros do TPV)

Mesma consulta do TPV, separada por `payment_method`. O percentual é sobre o
TPV, não sobre o GMV. `Pix` com inicial maiúscula também é capturado
(`UPPER(payment_method)`).

### Antifraude — Aprovação

**`MongoDB_Pedidos_Geral`** · `payment_analysisStatus` · por `settings_createdAt`

Aprovação = `APPROVED` ÷ (`APPROVED` + `REFUSED`). `NOT_USED` fica de fora.

> Esta conta **não** filtra por pedido pago, de propósito. Pedido recusado no
> antifraude nunca chega a ser pago, então filtrar por pago devolveria quase só
> aprovados: a taxa dava 99,5% em vez dos 95,7% reais de set/2026.

### Antifraude — Tempo médio de análise

**`Metrica Antifraude 2026 - Atualizada.xlsx`** (Drive) · aba `Resumo Semanal`

É um arquivo Excel no Drive, não uma planilha nativa, então é baixado pela API
do Drive e lido com a lib `xlsx` — por isso a service account precisa também do
escopo `drive.readonly`.

| Coluna | Uso |
|---|---|
| 1 · Primeiro dia da semana | o dia em que a semana começa (ISO, segunda) |
| 10 · Qtd de analise | denominador |
| 15 · **Analise Geral** | o tempo médio |

A coluna 15 é a que vale: as colunas 3 e 6 são recortes por horário (comercial
e fora dele) e a 11 cobre só a análise manual. A "Analise Geral" é o tempo de
todas as análises, que é o que o ticket pede.

Como a planilha guarda a **média** semanal, os minutos totais são
reconstruídos (média × quantidade) para o painel somar qualquer intervalo sem
cair em média de médias, e o valor é diluído nos 7 dias. Conferido na semana
19–25/10: 47 min no painel contra 0:47:23 na planilha.

> **O denominador do tempo é separado do da aprovação.** O tempo usa a
> quantidade de análises da planilha (`af_tempo_analises`); a aprovação segue
> usando a do lake. São populações diferentes — na semana de 19–25/out a
> planilha conta 1.169 análises e o lake 1.713 — e dividir uma pela outra daria
> um número sem significado.

**Cobertura:** só 2026 (a planilha começa na semana de 29/12/2025), então o
tempo de análise não tem comparação anual.

### Antifraude — Chargeback perdido

**Planilha "Chargebacks"** · abas `Chargeback 2025` e `Chargeback 2026`

Uma linha por chargeback, com `Data`, `Status`, `Seguro` (Sim/Não) e
`Valor da venda`. O painel conta **somente os perdidos** — o que a Vesti de
fato já perdeu — num número só, com e sem seguro somados.

Os componentes continuam separados no `dados.js`
(`chargeback_com_seguro` e `chargeback_sem_seguro`), então voltar a exibi-los
é só acrescentar os blocos no `index.html`. Em 2026, até 13/10, são R$ 174,6
mil com seguro (91,9%) e R$ 15,4 mil sem (8,1%).

Os demais status ficam de fora de propósito, porque ainda não são perda:
`Ganho`, `Disputa`, `Acatado`, `Resolvido` e `Aguardando a marca`. Em 2026 são
159 perdidos de 211 linhas.

Dia sem chargeback dentro da janela vale **zero** perda, não desconhecido.

> As abas `Com Seguro` e `Sem Seguro` da mesma planilha **não** são usadas:
> têm só 2023, e 99% das linhas estão sem status. O recorte por seguro que
> vale é a coluna `Seguro` das abas por ano.

**Janela:** 17/01/2025 a 13/10/2026. Duas linhas da aba de 2025 estão datadas
de 31/12/2026 e ficariam esticando a série por dois meses de zeros — a janela
para em hoje para evitar isso. Uma linha de 2026 tem a data digitada como
`13/10/2-26` e ficou de fora: são R$ 1.422,21 que entram assim que alguém
corrigir a célula.

---

## O gráfico semanal

Abre ao clicar em qualquer indicador, macro ou micro, e some com × ou com novo
clique no mesmo bloco.

**Não há consulta nova.** O gráfico é montado no navegador a partir do mesmo
`dados.js` da tela: a série diária é agrupada em semanas e o indicador é
recalculado para cada uma.

- **Semanas:** ISO, de segunda a domingo. A S1 de 2026 começa 364 dias depois
  da S1 de 2025, que é o mesmo alinhamento usado na comparação dos blocos.
- **Semana incompleta não vira ponto.** Se faltar qualquer um dos 7 dias, a
  linha fica interrompida ali — melhor um buraco do que uma semana que parece
  ter caído pela metade.
- **Faixa cinza:** as semanas que o filtro de período cobre.
- **Linha tracejada:** a régua, só no CSAT (4,9) e no SLA (3 dias).
- **Valores semanais puros,** sem média móvel.
- **Tooltip:** semana e datas, valor de 2026, referência de 2025 e o selo de
  variação — o mesmo padrão dos blocos.
- Nos blocos de participação, o gráfico mostra o valor em R$, não o percentual.

---

## Como os indicadores são calculados

A base guarda **componentes**, nunca o indicador pronto. O painel soma as
colunas diárias do intervalo escolhido e só então divide. Nenhuma taxa é média
de médias diárias.

| Indicador | Conta |
|---|---|
| GMV | Σ `gmv` |
| Integração / Oráculo | Σ do componente ÷ Σ `gmv` |
| TPV | Σ `tpv_cartao` + Σ `tpv_pix` |
| Cartão / Pix | Σ do componente ÷ TPV |
| Receita | Σ `receita_mdr` + Σ `receita_antifraude` + Σ `receita_antecipacao` |
| MDR / Antifraude / Antecipação | Σ do componente ÷ Receita |
| Aprovação | Σ `af_aprovadas` ÷ Σ `af_analises` |
| CSAT | Σ notas ÷ Σ respostas |
| Resposta | Σ respostas ÷ Σ pesquisas enviadas |
| SLA | Σ dias ÷ Σ atendimentos resolvidos |

**A variação** é sempre em %, sobre os valores absolutos, nunca em pontos
percentuais. Nos blocos de participação, varia o valor em R$, não o percentual.
Verde quando melhora segundo a direção boa do indicador — para tempo de
análise, chargeback e SLA, cair é melhorar.

**Um valor desconhecido nunca vira zero.** Se a fonte não cobre um dia do
intervalo, a coluna inteira fica desconhecida no período e o painel mostra `—`:
sem número, sem percentual e sem selo de variação. No warmup, um zero seria lido
como queda, e ausência de fonte não é queda.

---

## Conferência com o BI do VestiPago

Receita e TPV têm uma segunda fonte oficial: **bi.vesti.com.br/kpis**, que lê a
`vestipago_transaction_detail` e o Huggy. Comparação nas cinco últimas semanas
com dado (S38 a S42 de 2026):

Sete semanas conferidas (S36 a S42 de 2026):

| Indicador | Diferença |
|---|---|
| Antecipação | **0,00%** |
| MDR | **0,00%** |
| TPV total | −0,9% a +0,6% |
| TPV cartão | −0,25% a +0,21% |
| TPV Pix | −1,5% a +1,2% |
| Antifraude | −0,1% a −1,0% |

A diferença do antifraude é a troca de fonte explicada acima — o painel lê o
pedido, o BI lê a transaction detail. O Pix oscila para os dois lados conforme
a semana, o que aponta para pedido na fronteira do período e não para erro de
régua; o cartão, que tem transação registrada nas duas tabelas, fica dentro de
0,25%.

> **Ao comparar com o BI, lembre do segmento.** O BI mostra o Vesti Pago
> inteiro; o painel mostra um segmento por vez. Na semana 28/09–04/10, atacado
> dá R$ 5,56 mi e varejo R$ 0,24 mi — juntos, os R$ 5,93 mi do BI. Olhar só o
> atacado e comparar com o total do BI faz parecer que falta dinheiro.

O BI também é a fonte de CSAT e taxa de resposta do VestiPago (Huggy, dados
desde 2025), e confirma a numeração ISO do painel: a S38 dele é 14–20/set, com
nota 4,93 e taxa 42,20% — os mesmos valores da planilha de KPIs.

---

## Conferência com o relatório "GMV - Métricas 2025"

A régua acima foi tirada do PBIX (`GMV - Métricas 2025 (6).pbix`), lendo as
medidas DAX e as consultas Power Query do modelo. O relatório também lê do
mesmo BigQuery, então dá para comparar linha a linha.

**GMV Total**, mês a mês, painel contra o relatório:

| Período | Diferença |
|---|---|
| jan/2025 a dez/2025 | 0,00% — bate aos centavos em todos os meses |
| jan/2026 a jul/2026 | até 0,01% |
| ago/2026 | 0,04% |
| set/2026 | 0,10% |

A diferença de ago e set/2026 são pedidos que entraram no lake depois do último
refresh do relatório, que é de **19/10/2026**. Não é régua diferente.

**GMV Integrado** fica entre 0,2% e 0,7% acima, pelo mesmo motivo: domínios que
ganharam `integration_owner` depois do snapshot. O relatório carrega a lista de
domínios integrados congelada; o painel lê a `odbc_domains` de agora.

### Por que uma semana recente não bate exatamente

O relatório é um **retrato** — o PBIX foi atualizado em 19/10/2026 e congelou os
dados daquele momento. O painel lê a `MongoDB_Pedidos_Geral` de hoje. Pedido não
é imutável: ele é cancelado e editado depois de criado, e o GMV de uma semana
**encolhe** nos dias seguintes.

A semana de 12–18/10/2026, conferida pedido a pedido:

| | Valor |
|---|---|
| Relatório (retrato de 19/10) | R$ 23,68 mi |
| − 518 pedidos cancelados entre 19 e 23/10 | − R$ 1,16 mi |
| − 697 pedidos com valor editado depois | − R$ 0,08 mi |
| **= esperado** | **R$ 22,44 mi** |
| **Painel (lake de 23/10)** | **R$ 22,43 mi** |

Fecha com R$ 0,01 mi de resíduo. Nenhum pedido sumiu do lake, nenhum apareceu:
são os mesmos 12.995 pedidos dos dois lados, com valores diferentes porque o
tempo passou. **A régua está igual; o que muda é a data da foto.**

Consequência prática para o warmup: o GMV da semana que acabou de fechar ainda
vai cair um pouco nos dias seguintes, conforme os cancelamentos entram. Em
12–18/10 foram 5% em quatro dias. Para comparar com o relatório número por
número, os dois precisam ter sido atualizados no mesmo dia.

> **Atenção ao comparar:** o painel mostra **um segmento por vez**. Na semana
> de 12–18/10, atacado dá R$ 21,22 mi e varejo R$ 1,21 mi — juntos, os R$ 22,43
> mi acima. O relatório, sem filtro de segmento, mostra os dois somados.

### O que o relatório faz e o painel não

- **GMV v1 (`odbc_quotes`)** — o relatório soma `Valor Total v1` (quotes com
  `Status = 1`) ao `Valor Total v2` (Mongo). Para 2025 e 2026 isso é zero: a
  `odbc_quotes` para em maio/2024. O painel ignora.
- **Canal de Vendas, Anjo, Tags, Nome Fantasia** — o relatório traz esses
  recortes na `Query1`. Estão fora do escopo do MDATA-503 (recortes extras são
  v2).

---

## Atualização

`build_data.js` lê de 2025-01-01 até ontem (D-1) e reescreve `dados.js` inteiro
— não é incremental. Leva cerca de 1 minuto.

O rodapé do painel mostra a data da última atualização de cada fonte, e o
cabeçalho mostra quando o arquivo foi gerado.

Ainda **não está automatizado**: hoje alguém precisa rodar o comando antes do
warmup de segunda.
