# Painel de Clientes — CS

Painel estático de **14 abas**, grão de **dia**, filtrado por **data de início e fim** —
menos a de Bonificação e a Gerencial, que trabalham em **mês civil fechado**.

```
index.html          o painel (layout + lógica, sem dependência externa)
publicar.js         sobe para vesti-mobi/dados/CS via Git Data API
dados.js            dados reais gerados pelo fetcher — window.PAINEL_DATA
fetch_dados.js      carga: BigQuery + HubSpot + Tino -> dados.js
fetch_churn_planilha.py  opcional, roda ANTES do fetch: churn declarado na planilha do time -> churn_planilha.json
conferir_hubspot.js  confere reunioes/tickets/negocios do painel contra a API do HubSpot (workflow "Conferir HubSpot")
sincronizar_cs.js    roda ANTES do fetch: corrige angel_id no BigQuery comparando com a produção (Metabase)
ingerir_stock_logs.js  roda ANTES do fetch: espelha public.stock_logs (Postgres) pra vestilake_BI.postgres_stock_logs
carregar_tipo_empresa.js   leva a classificação Atacado × Varejo para o BigQuery
integracoes_snapshot.json  retrato de quem tem integração, da última carga
integracoes_novas.json     histórico das integrações detectadas como novas
varejo_manual.json         marcação FEITA NA MÃO de quais filiais são de varejo
painel-clientes.html  layout de referência original (não é usado em produção)
```

## A repaginada de 02/10/2026

Pedido da Laura: *"uma fonte mais profissional, menos cara de IA"*, a explicação
de cada página num botão de interrogação em vez de solta embaixo do título,
"certinho, porque está tudo grudado", fundo branco puro e algumas cores para
diferenciar. **Nenhuma lógica, nenhum dado e nenhuma página mudaram** — só a
casca.

**Tipografia.** Saiu a Bricolage Grotesque. A serifada que entrou no lugar
durou uma rodada — a Laura viu e também não quis ("não gostei da fonte do nome
das abas"). Ficou assim: títulos em **IBM Plex Sans**, a tipografia corporativa
da IBM, feita para produto técnico e painel de dados; corpo em **Public Sans**,
do serviço público americano, desenhada para formulário e tabela. As duas são
grotescas, mas os terminais angulares da Plex separam título de texto sem
precisar de contraste de família — e a família Plex já estava aqui, no mono dos
rótulos. KPI, valor de card e health score usam `--f-num` (Public Sans com
`tabular-nums`, para as colunas baterem na vertical).

**Corpo de texto legível.** Na mesma rodada a Laura apontou que a fonte dos
cards estava "muito pequena e fina": rótulo de 10px, número de 26 e legenda de
11,5px em cinza claro. Tudo subiu um degrau — rótulo 11px em 600, número 31px
em 650, legenda 13px no cinza médio (`--ink-2`, não mais o `--ink-3`) — e o
mesmo valeu para os KPIs do topo e a legenda dos gráficos. Texto pequeno em
grotesca leve, num monitor de sala, simplesmente não é lido.

**O "?" no lugar do parágrafo.** O `desc` de cada aba continua sendo a régua
dela — só não mora mais embaixo do título, onde virava paredão e empurrava a
tabela para baixo. O botão ao lado do título abre um modal com quatro blocos,
separados por linha e respiro:

| Bloco | O que traz |
|---|---|
| O que esta página mostra | o `desc` da aba, quebrado em parágrafos |
| Os cards desta página | só em Gerencial, Visão geral e Visão do cliente: o `fonte` de cada card |
| As colunas da tabela | o rótulo e, quando o nome não se explica sozinho, uma linha do dicionário `AJUDA_COL` |
| De onde vêm os dados | as fontes da carga e a data da última |

A quebra em parágrafos é automática: `emParagrafos()` corta antes de cada frase
que **abre em negrito**. O negrito já era usado para começar tópico nesses
textos, então a quebra cai no lugar certo sem reescrever um texto sequer.
Coluna que não está no dicionário aparece só com o nome — inventar descrição
para "CEP" e "Bairro" só encheria a tela.

## O filtro é por data (mudou em 26/08/2026)

Era uma seleção de semanas ISO. A Laura levantou o problema: **semana ISO
atravessa a virada do mês** — a semana 31 de 2026 vai de 27/julho a 2/agosto —
então nenhum recorte semanal fechava um mês, e todo número mensal vinha com
sobra do mês vizinho. Agora o filtro é **De … Até**, com atalhos (este mês, mês
passado, últimos 30/90 dias, ano todo) e uma grade de meses fechados.

O que mudou por baixo:

- **Todas as séries passaram de `semana` para `data`** (`AAAA-MM-DD`), no fetcher
  e no painel. A carga vai de 1º de janeiro do **ano anterior** até hoje — o ano a
  mais existe só para a aba de Bonificação comparar mês contra o mesmo mês do ano
  passado; as séries que vão para o navegador continuam só com o ano corrente.
- **Os gráficos agrupam sozinhos**: até 45 dias de período, dia a dia; até 400,
  por semana; acima disso, por mês. O filtro continua exato — quem agrupa é só o
  desenho.
- **As séries vão empacotadas** em formato colunar (`{c:[colunas], dic:{}, r:[[…]]}`).
  Sem isso o `dados.js` iria de 6,5 MB para 37 MB, e ele é commitado todo dia.
  O painel desempacota no boot, em `desempacotar()`.
- **Correção de brinde:** a tabela geral e as abas de produto passaram a agregar
  **por domínio** e não por nome. 28 marcas da carteira são homônimas de outra
  (mesmo apelido, domínios diferentes) e as duas linhas recebiam a soma das duas —
  R$ 684 mil a mais de GMV só em julho de 2026. O domínio só passou a viajar na
  série quando o grão virou dia; antes não dava para corrigir.
- **Compatibilidade:** se o painel novo abrir com um `dados.js` ainda no formato
  de semana (a janela entre publicar o layout e a carga da madrugada), cada linha
  antiga vira a segunda-feira da semana dela e um aviso vai para o console. Os
  números ficam aproximados até a carga seguinte, em vez de zerados.

No ar: **https://vesti-mobi.github.io/dados/CS/** — senha `Mudar123`.
Local: `start index.html`. Sem `dados.js` o painel cai num mock com semente fixa
e o selo no topo mostra "Dados de exemplo".

⚠️ **A senha é uma tranca, não um cofre.** `vesti-mobi/dados` é um repositório
público: a checagem roda no navegador e `.../CS/dados.js` é baixável direto, sem
senha. Serve para não abrir o painel por acaso — não protege o conteúdo.

## Atualizar os dados

```bash
node fetch_dados.js      # ~2 min
```

Precisa de:
- **BigQuery** — service account em `GOOGLE_APPLICATION_CREDENTIALS`. O fallback é
  `C:\Users\Laura\Downloads\vesti-data-499015-7ea468dae45e.json`, a mesma chave que o
  PainelElisa usa. O `fetch_dados.js` em si só roda `SELECT` — quem escreve é o
  `sincronizar_cs.js` (ver abaixo), e só na coluna `angel_id`.
- **HubSpot** — `HUBSPOT_TOKEN`; por padrão lê de `../CS-Sucesso-do-cliente/.env`.
- **Tino** — `TINO_USER` / `TINO_PASS`, a mesma credencial do painel
  `admin.tino.vesti.com.br`. **Sem valor padrão no código de propósito**: o
  `vesti-mobi/dados` é público.
- **Metabase** (opcional) — `METABASE_URL` / `METABASE_API_KEY`, para o
  `sincronizar_cs.js` e o `ingerir_stock_logs.js`. Sem eles os dois passos são
  pulados — o resto da carga roda igual.

Sem HubSpot o painel carrega mesmo assim: Cross-sell, Upsell, Reuniões e Tickets
ficam vazias (e, na Bonificação, a coluna de reuniões). Sem a credencial do Tino, a aba do Tino e a coluna "Tino" da
tabela geral ficam vazias — o resto carrega igual.

### CS responsável desatualizado no BigQuery (04/09/2026)

Descoberto com a Laura: trocar o CS responsável no admin da Vesti (campo
`angel_id` de `domains`) às vezes não atualiza o `updated_at` da linha, e a
réplica Vesti → BigQuery usa esse campo para saber o que sincronizar — a troca
fica **invisível pro espelho para sempre**, até algo mais tocar aquela linha.
Confirmado comparando o Postgres de produção (via Metabase) contra o
`vestilake_BI.odbc_domains`: 36 marcas da carteira ativa divergentes no dia da
descoberta, entre elas a MissManu (BigQuery dizia Tatiane Ayres, produção já
tinha Thamiris Ribeiro havia semanas).

`sincronizar_cs.js` roda **antes** do `fetch_dados.js` na carga automática:
compara `angel_id` de cada domínio da carteira ativa entre o Postgres de
produção (Metabase, banco "Vesti") e o BigQuery, e corrige no BigQuery só as
linhas que divergem — nunca a tabela inteira. Isso conserta o dado na fonte
que o painel lê, então beneficia qualquer outro painel da Vesti que também use
`odbc_domains`, não só este. Se o Metabase cair ou faltar credencial, o passo
avisa e segue sem corrigir nada — não trava a carga.

### Log de movimentação de estoque (stock_logs), espelhado (14/09/2026)

A Laura pediu pra trazer `public.stock_logs` (Postgres de produção) pro
BigQuery — a pergunta salva do Metabase (#439, "USAR COM SABEDORIA") exige
`domainId` + `companyId` + `productId` pra rodar, então não serve como fonte
de espelho completo; o `ingerir_stock_logs.js` lê a mesma tabela sem esses
filtros, direto por SQL nativo.

**A origem parou de escrever** — descoberto rodando em produção pela 1ª vez
(14/09/2026): os dados vão de 15/08 a 21/08/2026 (6 dias, 250.547 linhas, pico
de 52.592 num dia só, 17/08) e nenhuma linha nova chegou depois disso.
Confirmado contra `now()` do próprio banco (bate com a data real, não é sessão
velha) — a tabela mesmo ficou parada. Não dá para saber se é uma limpeza que
também varreu tudo antes de 15/08 ou só a janela em que o que grava esse log
esteve ativo. Enquanto isso não mudar, `vestilake_BI.postgres_stock_logs` é a
**única** cópia completa que existe desses 6 dias.

**Achado na 1ª carga real (mesmo dia)**: a API `/api/dataset` do Metabase tem
teto de **2000 linhas por resposta e não avisa que truncou** — a 1ª versão do
script pedia o dia inteiro numa query só e recebeu sempre exatos 2000, mesmo
em dias com 50 mil+ linhas reais. Só 14.000 das 250.547 linhas (5,6%) entraram
naquela carga, sem erro nenhum no log. Corrigido paginando de verdade
(`LIMIT`/`OFFSET` em blocos de 2000, `ORDER BY created_at, id` para paginação
determinística) até vir uma página incompleta — confirmado ao vivo que o teto
é só na resposta, a query aceita `OFFSET` normalmente.

Carga incremental, sem duplicar: pergunta ao Metabase o `MAX(created_at)` da
**origem** (não do nosso espelho — depois do teto de linhas ter mascarado uma
carga incompleta sem erro nenhum, confiar no histórico do próprio espelho
ficou arriscado), revarre os 10 dias antes disso, e insere só os `id` que
ainda não existem no BigQuery dentro dessa janela. A âncora no `MAX` da
origem (em vez de "hoje") é o que permite o script continuar fazendo sentido
com a tabela parada — usar `Date.now()` faria a janela derivar para longe de
onde os dados realmente estão. Tabela particionada por `DATE(created_at)`.

**Não filtra por carteira ativa** — ao contrário do `sincronizar_cs.js`, que só
olha domínio com "vendas" nos módulos. Ingere tudo que aparecer em
`stock_logs`, loja de teste incluída. Quem for consumir e precisar só da
carteira ativa, filtra no JOIN com `odbc_domains` na hora da leitura.

### Automático, todo dia às 04:00 BRT

O workflow `.github/workflows/painel-clientes-cs.yml` no `vesti-mobi/dados` roda,
nessa ordem, `node CS/sincronizar_cs.js`, `node CS/ingerir_stock_logs.js` e
`node CS/fetch_dados.js` às 07:00 UTC, e commita o `CS/dados.js`. Como o painel
inteiro — todas as abas, tabelas e gráficos — lê desse único arquivo, uma carga
atualiza tudo. Usa os secrets `GCP_SA_KEY`, `HUBSPOT_TOKEN`, `METABASE_URL` e
`METABASE_API_KEY`, que já existem no repositório, e aborta sem commitar se o
`dados.js` sair com menos de 1 MB (sinal de que alguma fonte falhou). Dá para
rodar na mão pela aba Actions ("Painel de Clientes CS" → Run workflow).

⚠️ O `index.html` e o `README.md` **não** são publicados pelo workflow — mudança
de layout continua indo por `node publicar.js`.

## Exportar: .xlsx com moeda de verdade (05/10/2026)

A Laura: *"quando exporto a tabela, os valores não estão vindo em formatação de
reais"*. O botão gerava CSV com o número cru (`1234.56`) e o Excel em português
não reconhece ponto como decimal — a coluna chegava como texto.

Agora o botão é **Exportar Excel** e sai `.xlsx`: o número continua número (dá
para somar, filtrar, fazer tabela dinâmica) e a célula leva o formato
`R$ #,##0.00`. As datas saem em dd/mm/aaaa e os centavos são arredondados, para
não aparecer `57,92999999999999` na barra de fórmulas.

Como o painel sabe qual coluna é dinheiro: as tabelas das abas declaram `tipo`
(`money`, `moneyC`, `money0traco`) e as tabelas dos cards passam a função em
`f` (`fmt.money`, `fmt.moneyCompact`) — o export olha os dois. Datas idem
(`date`, `cadastro`, `implantado`, `dataRel`, `dataTicket`, `rel`).

A biblioteca (SheetJS) é carregada do CDN **no clique**, não no load da página.
Sem internet ou com o CDN bloqueado, cai no CSV de antes — agora com vírgula
decimal, que é o que o Excel brasileiro entende sem perguntar nada.

## O GMV da Tabela geral e da Gerencial virou a régua do Power BI (06/10/2026)

A Laura somou a coluna de GMV da Tabela geral para agosto/2026 e deu R$ 79,6 mi
onde o relatório **GMV - Métricas** (Power BI) mostra 98. Abrindo o `.pbix`
(o modelo mora num dataset remoto, mas o layout do relatório é legível):

- o cartão é a medida **"GMV Total"**, nome original *Total Valor Pedidos*, com
  um único filtro visível — fora o canal **Treino**;
- a página corta o tempo por **"Semana Ajustada"**: "agosto" lá são as 4 semanas
  de **03 a 30/08**, não 01 a 31;
- existe um **slicer de "Status Payment"** na tela, ou seja, pago × não pago é
  escolha de quem olha, não regra do relatório.

Decompondo agosto/2026 no BigQuery, um filtro por vez:

| Régua | Valor |
|---|---|
| painel: pago, mês civil, teto R$ 50 mil, só carteira | R$ 79,6 mi |
| contando **pedido criado e não pago** (+26,1) | R$ 105,6 mi |
| no **mês de 4 semanas** do Power BI (−9,1) | R$ 96,5 mi |
| **sem o teto** de R$ 50 mil (+0,9) | R$ 97,4 mi |
| **sem recortar a carteira** (+1,2) | **R$ 98,6 mi** |

**O que mudou no painel** (decisão da Laura: "use a mesma regra e fonte do
arquivo powerbi para esse card"):

- a série ganhou `valorCriado` e `pedidosCriados` — todo pedido, sem teto;
- **Tabela geral**: a coluna virou **GMV (pedidos feitos)**, com **Do qual
  pago** ao lado, e entrou um KPI **GMV no período** no topo (era somando a
  coluna à mão que a comparação acontecia);
- **Gerencial**: o KPI *GMV da carteira* mostra o criado, com o pago na linha
  de baixo;
- o gráfico "GMV da carteira" da Carteira por CS acompanha.

**O que NÃO mudou, de propósito:** a aba **Bonificação** continua no GMV pago —
é dinheiro que entrou e é o que vale meta de CS. Os demais cards de GMV também
seguem no pago; o rótulo de cada um diz qual régua usa.

Duas diferenças que sobram contra o Power BI, e são de conceito, não de conta:
o painel **não exclui o canal Treino** (7 marcas, volume irrelevante) e **só
enxerga a carteira** — domínio sem módulo de vendas não tem linha de cliente
aqui. Em agosto isso responde por R$ 0,5 mi: no recorte de 03 a 30/08 o painel
dá R$ 98,09 mi contra os R$ 98,57 mi do relatório.

## Filtros avançados da Tabela geral (06/10/2026)

Pedido da Laura: recortar a carteira por plano, filial, varejo, Oráculo, Tino,
Tino ativo, integração, VestiPago e faixa de GMV e de health — **tudo em
caixinha, podendo marcar mais de uma**.

Dez perguntas não cabem como dez campos na barra. Viraram um botão **Mais
filtros** que abre um painel em colunas:

| Grupo | Opções |
|---|---|
| **Plano** | a família do plano — Starter, Pro, Avançado, Básico, Light, Essencial, Enterprise, Conecta, Catálogo, Portal têxtil, Assistente, Sem plano |
| **Estrutura** | Tem filial · Loja única · Tem varejo · Só atacado |
| **Produtos** | Tem/Sem Tino · Tino ativo · Tino parado · Tem/Sem Oráculo · Tem/Sem VestiPago · Tem/Sem integração |
| **Faixa de GMV** | sem GMV · até 10 mil · 10 a 50 · 50 a 200 · 200 mil a 1 mi · acima de 1 mi |
| **Health score** | Saudável (80+) · Atenção (50-79) · Em risco (1-49) · Zerado |

Como combina: dentro do mesmo grupo é **ou** (Pro ou Starter), entre grupos é
**e** (Pro **e** com filial). Cada opção mostra **quantas marcas** caem nela,
contadas sobre as linhas já filtradas pelo resto da barra — CS, canal, período.
O que está marcado volta como **chip** na barra, com X para tirar só aquele, e
o botão mostra quantos filtros estão ativos. "Limpar tudo" zera só os
avançados; "Limpar filtros" zera a barra inteira.

Três coisas que precisaram de dado novo ou de tratamento:

- **Plano por família.** O nome vem do item mais caro da fatura e está escrito
  de dez jeitos ("Plano PRO", "Assinatura: Vesti Pro", "plano_profissional").
  O filtro agrupa por família, senão seriam dez caixinhas para a mesma coisa.
- **Varejo.** A classificação Atacado/Varejo é por EMPRESA
  (`confeccao_tipo_empresa`); a carga agora sobe isso para a marca —
  `temVarejo`/`temAtacado`, verdadeiro se qualquer empresa dela for daquele
  tipo, porque as duas coisas convivem em quem abriu loja de varejo vindo do
  atacado. Empresa que a classificação (de 30/03/2026) ainda não alcançou não
  conta para nenhum dos dois. Hoje: 999 marcas da carteira com empresa de
  varejo.
- **Tino ativo ≠ ter Tino.** Ativo é o status na base do próprio produto, que
  só existe na tabela da aba Uso do Tino: 117 ativas de 120 marcas com Tino.

## De onde vem cada coluna

| Aba | Campo | Fonte |
|---|---|---|
| Todas | Domínio | `odbc_domains.ID` — o id da marca na Vesti, chave de busca no admin |
| Todas | CS responsável | `odbc_domains.angel_id` → `odbc_angels.name` |
| Tabela geral | Integração | `odbc_domains.integration_id` → `odbc_integrations.name` |
| Tabela geral | Data de cadastro | `odbc_domains.created_at` — entrada da marca na Vesti |
| Todas | Canal | `odbc_domains.partner_id` → `odbc_partners.name` |
| Tabela geral | Plano | item mais caro da última fatura Iugu paga (tirando desconto/Oráculo) |
| Tabela geral | Último pedido | `MAX(MongoDB_Pedidos_Geral.settings_createdAt)` |
| Tabela geral | Pedidos / Valor / Ticket | `MongoDB_Pedidos_Geral`, por dia. Atenção: **Pedidos conta todos** (`COUNT(*)`) e **Valor soma só os pagos** (`payment_isPaid = 'True'`), com teto de R$ 50 mil por pedido |
| Tabela geral | Interchange | `vestipago_transaction_detail`: `mdrVestiValue + antifraudValue` — fee **já sem a taxa do banco** |
| Tabela geral | Mensalidade | linhas de **plano** das faturas Iugu pagas, casadas por CNPJ |
| Tabela geral | Outros (Iugu) | demais linhas da fatura: Oráculo, Filial, Assistente, Ativação |
| Tabela geral | Antecipação | `payment_transaction_antecipationValue` × fator Vesti |
| Tabela geral | Vencimento | próxima fatura Iugu `pending` com vencimento futuro |
| Cross-sell / Upsell | tudo | HubSpot, pipeline **Expand (Upgrades)** |
| Oráculo | atendimentos / % IA | `oraculo_Atendimentos` (`source` IA/HUMAN) |
| Oráculo | GMV | `oraculo_Pedidos.Tipo_Venda_Oraculo` |
| Bonificação | Integrações ativas | Marcas do CS que venderam no mês E têm `odbc_domains.integration_owner = 'VESTI'`. Definição da medida `Integracao Ativa` do Power BI "GMV - Métricas 2025": integração que a Vesti mantém, por oposição à do parceiro/ERP (a passiva). É estoque, não fluxo: conta quem TEM integração e vendeu, não quem integrou no mês |
| Tabela geral | Tino / Oráculo / VestiPago | Tino: marca presente na base do produto (API do Tino). Oráculo: tem atendimento em `oraculo_Atendimentos`. VestiPago: tem conta de pagamento em `MongoDB_Payment_Companies` — é TER o produto, não usar; quem contratou e não transacionou aparece como Sim |
| Tino | marcas, eventos, sessões, dias de acesso | **API do Tino** — `companies_chart`, `login_days`, `customer_kpis` |
| VestiPago | valor / fee / antecipação | `MongoDB_Pedidos_Geral` com provider VestiPago |
| VestiPago | links | pedidos com `settings_source = 'Link de cobrança'` |
| Tino / VestiPago / Oráculo | Implantado em | Tino: `created_at` da marca na base do produto. VestiPago: `MongoDB_Payment_Companies.createdAt`. Oráculo: a menor entre `o-configurations.created_at` e o primeiro atendimento |
| Bonificação | tudo | agregado por CS e por mês, calculado no fetcher (ver abaixo) |
| Churn | situação / bloqueado em / etc. | Painel Elisa/Gambiarra — módulo `vendas` bloqueado de verdade, não mais inferência por fatura vencida (ver abaixo) |
| Reuniões | reunião / data / responsável | HubSpot `meetings` (`hs_meeting_start_time` + owner) |
| Reuniões | Cliente | empresa associada à reunião no HubSpot |
| Reuniões | Resultado | negócio ganho (qualquer pipeline) creditado à última reunião daquela empresa antes do fechamento |
| Reuniões | Resumo | `hs_meeting_body` (descrição/notas da reunião no HubSpot), sem o HTML do editor |
| Tickets | ticket / pipeline / estágio | HubSpot `tickets`, todos os pipelines |
| Tickets | Situação | estágio marcado como fechado (`metadata.ticketState`) ou `closed_date` preenchida |
| Tickets | Cliente e Canal | empresa associada ao ticket → marca do cadastro (nome, nome sem ruído ou CNPJ) |
| Gerencial | tudo | não é fonte nova: recorta por mês civil o que já existe em séries da carteira, VestiPago, Churn, cadastro e negócios do HubSpot |
| Carteira por CS | tudo | não é fonte nova: reagrupa por pessoa (Thamiris, Luana, Cristiane) o que já existe em Tabela geral, Cross-sell/Upsell, Reuniões, Marcos de volume, Churn e Bonificação — pedido da Laura em 15/09/2026 pra ver "como está indo o trabalho" de cada CS num lugar só |

### Domínio nas abas

A coluna **Domínio** (`odbc_domains.ID`) aparece nas nove abas, ao lado do cliente.
Onde a linha nasce de um domínio — tabela geral, Oráculo, Tino, VestiPago, Churn —
o id vem direto e a cobertura é de 97% a 100%. Nas abas que vêm do HubSpot
(Cross-sell, Upsell, Reuniões, Tickets) a linha nasce com o **nome da empresa no
HubSpot**, então o id é resolvido pelo mesmo casamento em três tentativas usado
para o canal do ticket; sem casar fica `—`. Tickets fica em ~34% porque boa parte
deles é de empresa que não é marca da carteira — é a mesma limitação já
documentada na linha "Cliente e Canal" da tabela acima, não um defeito da coluna.

Inventar um id quando o nome não casa seria pior do que deixar em branco: a coluna
existe justamente para ser colada na busca do admin.

## A grade de cards (Visão geral e Gerencial)

As duas abas do grupo **Visão geral** usam o mesmo componente: uma grade de
cards clicáveis, e o card aberto mostra embaixo os KPIs daquele número, um
gráfico de comparação e a tabela com as linhas que o formam. A Gerencial nasceu
assim em 17/09/2026; a Visão geral passou a usar o mesmo desenho em 18/09/2026,
a pedido da Laura.

A diferença entre as duas está só no **recorte**, e é ele que decide o formato do
gráfico de comparação:

| | Recorte | Gráfico do card | Comparação |
|---|---|---|---|
| Visão geral | janela de datas (o filtro Período) | uma barra por **semana** (janela longa agrupa por mês) | contra o **período anterior** de mesmo tamanho em dias corridos |
| Gerencial | mês civil | uma barra por mês, até 12, com o mês escolhido em cor cheia | contra o **mês anterior** e a média da janela |

No código, quem carrega essa diferença é o `ctx` (`ctxPeriodo()` ou
`ctxGerencial()`); o card em si não sabe de que aba ele é — recebe o ctx e
devolve linhas, KPIs e métricas. Um card novo é um objeto em `CARDS_VISAO` ou
`CARDS_GERENCIAL`, sem mexer no render.

### O que mudou na Visão geral (18/09/2026)

Os cinco gráficos que ficavam soltos na aba (novas vendas por plano, negócios por
categoria, funil de onboarding, produtos implantados e marcos de volume) **não
sumiram**: cada um virou o gráfico de composição do card a que pertence, e agora
vem com a lista de marcas por trás do número — que antes só existia no hover. A
fileira de KPIs do topo saiu porque repetia os quatro primeiros cards, que já
mostram o mesmo número com a comparação junto.

Os sete cards: **Novas vendas**, **Churn**, **Reuniões realizadas**,
**Negócios**, **Funil de onboarding**, **Produtos implantados** e **Marcos de
volume**. O funil é o único que não obedece ao período — é foto do momento, a
contagem de quem está parado em cada fase agora.

**A Visão geral é de todo o time**, não só das três CS da carteira: em reuniões,
negócios e novas vendas entram Elisa, Cristiane, Tatiane, Jennyfer e quem mais
for dono do registro no HubSpot — nos últimos 90 dias de 17/09/2026, por exemplo,
as reuniões eram de cinco pessoas diferentes. Quem tem o recorte das três é a aba
Gerencial. Confirmado com a Laura em 18/09/2026.

O gráfico dos cards vai de **semana em semana** (pedido da Laura, 18/09/2026):
uma reunião por dia vira uma floresta de barras de 1, e por semana dá para ver a
tendência. Duas exceções: **período de até 14 dias volta a ser dia a dia** (em
semana ele viraria uma barra só, que não mostra evolução nenhuma) e janela longa
agrupa por mês. Quando a janela anterior cai antes do começo do arquivo, o card
diz "sem período anterior no arquivo" em vez de comparar contra zero.

### A semana do gráfico começa no primeiro dia do período (28/09/2026)

A Laura escolheu **20/09 a 26/09** e o gráfico mostrou uma barra rotulada
"14/09 – 20/09" com o valor **1**, quando aquela semana inteira tinha 19
reuniões. O motivo: 20/09/2026 é um **domingo**, e na semana ISO (segunda a
domingo) ele pertence à semana que começou em 14/set — então a barra carregava o
rótulo da semana cheia e só o pedaço que cabia dentro do período.

Nos gráficos dos cards a semana passou a correr **a partir do primeiro dia do
período** (20 a 26, 27 a 03…), e cada barra guarda o intervalo que de fato cobre
— é esse intervalo que o balãozinho mostra, inclusive quando a ponta é um dia
só. O resto do painel (régua e gráficos das abas de produto) continua na semana
ISO, onde ela faz sentido: lá a barra "semana de 10/ago" precisa ser sempre a
mesma.

Na mesma conversa, a linha de comparação passou a dizer **as datas** do período
anterior ("39% abaixo de 13/09/2026 a 19/09/2026") em vez de só "período
anterior": foi comparando o número com a semana que ela tinha acabado de olhar
(14 a 20) que a diferença pareceu erro. O período anterior é a mesma janela
deslocada para trás em dias corridos — 20 a 26 compara com 13 a 19.

### Ajustes de 21/09/2026 (pedidos da Laura)

- **Novas vendas agora mostram valor.** A carga passou a trazer o `amount` do
  negócio de onboarding (antes só vinha a contagem). O card soma o valor no
  período e quebra por Starter e Pro. Negócio sem valor preenchido no HubSpot
  conta na quantidade e não no dinheiro — o KPI diz quantos têm valor. Com um
  `dados.js` anterior a essa carga o campo aparece como `—`, sem somar zeros.
- **O card de negócios deixou de ser só "ganhos".** Virou **Negócios**: mostra o
  que foi ganho e o que ainda está **em negociação**, com **temperatura**
  (🔥 Quente / 🟡 Morno / ❄️ Frio, a propriedade `temperatura_do_negocio` do
  HubSpot). O gráfico tem duas barras — ganho e em negociação — e o gráfico de
  composição virou "Em negociação por temperatura".
- **No upgrade, o valor é a diferença.** O ganho do card de Negócios da Visão
  geral segue a mesma conta da aba Gerencial: valor do negócio menos a última
  mensalidade da marca no Iugu antes dele. Cross-sell continua entrando pelo
  valor cheio (é produto novo, não troca de plano). Upgrade sem mensalidade
  anterior não entra na soma e é contado no subtítulo do KPI.
- **Temperatura também nos cards de Cross-sell e Upsell da Gerencial**, na
  tabela, no KPI "Em negociação" e num gráfico de composição próprio.

## Aba Gerencial (17/09/2026)

Traz para dentro deste painel os cards do
[Painel CS Gerencial](https://vesti-mobi.github.io/dados/PainelCSGerencial/),
**com a fonte trocada para o BigQuery** — o painel antigo lia Fabric, planilhas e
JSONs próprios. Pedido da Laura em 17/09/2026.

O que mudou em relação ao painel antigo:

- **saíram** os cards de Frete Onlog e de Satisfação (CSAT + NPS);
- **entraram** cinco que lá não existiam: **Reuniões**, **Novo Tino**, **Novo
  Oráculo**, **Cross-sell** e **Upsell**;
- a aba inteira é a **carteira das três CS** — Thamiris, Luana e Gabriella
  (segundo pedido da Laura, 17/09/2026: "vi gente que não é Gabi/Thamiris/Luana,
  quero só as marcas delas"). Marca de outra CS não entra em card nenhum. O
  seletor de CS no topo estreita para uma delas; sem nada marcado valem as três;
- o recorte é um **mês civil**, escolhido no filtro `Mês` da própria aba — o
  painel antigo misturava "desde jan/2026" com "mês atual", card a card;
- cada card é **clicável**: abre embaixo os KPIs daquele número, o **gráfico dos
  últimos 12 meses** daquela métrica e a tabela com as linhas que o formam,
  ordenável coluna a coluna como as outras tabelas.

### O gráfico de comparação

Pedido da Laura em 17/09/2026: "ao clicar no card, ver um gráfico comparando pra
saber se o mês está melhor ou pior". Ao abrir qualquer card vem uma barra por mês
(até 12, ou o que existir no arquivo — as séries que vão para o navegador só têm
o ano corrente), com **o mês escolhido em cor cheia** e os outros em tom claro,
mais uma linha de texto do tipo *"Reuniões realizadas: 14 · 56% acima do mês
anterior (9) · 40% acima da média dos 6 meses anteriores (10)"*. Cards com duas
métricas — Cross-sell e Upsell — desenham as duas barras lado a lado.

### Churn: evento × foto (28/09/2026)

Crítica do Walid: *"esse número está saltando mas não são de fato cancelados…
e parece estranho ser só 1 no mês passado"*. Estava certo nas duas coisas, pelo
mesmo motivo: o card lia `DATA.churn.linhas`, que é a leitura da aba Churn — uma
**foto de hoje** de quem está em alerta, bloqueada ou cancelada agora.

- **Foto não vira histórico.** Marca que cancelou em maio e já saiu da lista não
  aparece em maio nenhum, e por isso os meses passados vinham quase vazios. Soma
  a isso que `bloqueadoEm` vem de uma planilha que **só tem registro desde
  07/07/2026**: antes disso a única data possível é o vencimento em aberto, que
  também é de agora.
- **"Em alerta" é fatura vencida há 1 a 10 dias** — não é cancelamento, e estava
  sendo contado junto.

Viraram dois cards:

| Card | O que é | Obedece ao mês? |
|---|---|---|
| **Churn do mês** | marcas que **pararam de pagar** no mês: sem fatura paga há mais de `meta.diasChurn` (45) dias e sem fatura futura em aberto. Evento datado, existe desde 2025, comparável mês a mês | sim |
| **Inadimplência hoje** | a foto: quem está em alerta, bloqueada ou cancelada **agora** | não — é foto |

Na carteira das três CS, o churn por mês em 2026 ficou: jan 3, fev 0, mar 0, abr
0, mai 2, jun 2, jul 1, ago 6, set 4.

#### Duas correções a partir de um caso real (01/10/2026)

Pergunta da Laura: *"na aba churn dentro da gerencial aparece Kelly Rodrigues
Fortaleza, por que ela aparece? o pagamento parece que foi há 3 dias"*. Puxar o
fio dessa marca achou um acerto e um erro.

**Acerto — a régua é de pagamento, não de venda.** A Kelly Rodrigues Fortaleza
(domínio 2052347) tem a última fatura paga vencendo em **14/08**, a de **14/09
cancelada no Iugu** e nenhuma futura em aberto: aos 45 dias, 28/09, ela entrou
no card. Só que a loja **vende todo dia** — 17, 36 e 9 pedidos em 28, 29 e 30/09.
É exatamente o caso que interessa ver (vende e não paga), mas a linha não se
explicava sozinha. O card ganhou três colunas — **última fatura paga**, **última
fatura emitida** (com o status, inclusive `canceled`) e **ainda vende?** — e um
KPI "Ainda vendendo". Nos dados da carga não existe pagamento dela depois de
30/07 em nenhum dos dois CNPJs do grupo (o da Fortaleza, 66.285.192/0001-38, e o
da Kelly Rodrigues Store, 50.545.774/0001-76, que pagou pela última vez em
28/08); o espelho do Iugu está em dia (há pagamentos registrados até 29/09).

**Erro — marca com mais de um CNPJ virava churn sozinha.** O agregado de faturas
é por CNPJ e `faturaDaMarca()` olhava **um** grupo: o do CNPJ do cadastro. Quando
a assinatura é reemitida em outro CNPJ, a "última fatura paga" congelava na do
CNPJ antigo. A **Mon Clos** aparecia com churn em 05/09 — 22/07 + 45 dias — tendo
pago R$ 1.100 de Plano Pro em **23/08 e 23/09**. Agora os grupos da mesma marca
são unidos por domínio (mesmo casamento CNPJ → nome do pagador do resto da
carga) antes de calcular churn, plano, vencimento e inadimplência; a carga
registra quantas faturas de CNPJ extra foram unidas.

### "Novos VestiPago" marcava 0 — conta criada × começou a usar (01/10/2026)

A Luana implantou 3 VestiPago em setembro e o card mostrava **0**. O card lia
só `MongoDB_Payment_Companies.createdAt`, a **criação da conta de pagamento** —
e em setembro/2026 nasceram 9 contas, todas de marcas em onboarding (7 da
Jennyfer Rabelo, 2 da Tatiane Ayres), nenhuma na carteira das três CS.

A conta de pagamento nasce quando a marca **entra**. Numa carteira madura ela já
existe há meses, e o que a CS chama de implantar é a marca **passar a usar**.
São duas datas diferentes e o card agora mostra as duas:

| Entrou como | O que é |
|---|---|
| **conta criada no mês** | `MongoDB_Payment_Companies.createdAt` — marca nova, contrata e abre a conta |
| **começou a movimentar** | primeiro link de cobrança ou primeira transação da marca em **toda** a história dela (`primeiraVP`, sem recorte de ano — quem operou em 2025 não pode reaparecer como novo em 2026) |

Pela segunda leitura, setembro na carteira da Luana tem **Upper Concept (11/09)**
e **TEAM BASIC (09/09)**.

### Mensalidade caindo com a CS vendendo (01/10/2026)

A Luana fechou R$ 10.681 em setembro e viu a **mensalidade cair** R$ 6,2 mil
(ago R$ 78.490 → set R$ 72.244). Decompondo marca a marca, oito caíram:

| Marca | Agosto | Setembro | O que houve |
|---|---|---|---|
| Santo Vício | 1.579 | 0 | fatura venc. 30/09 **pendente** |
| Galpão 43 | 1.921 | 821 | fatura venc. 27/09 **pendente** |
| MISSMEL | 1.100 | 0 | fatura venc. 20/09 **pendente** (e reajustada p/ 1.149) |
| Estação Fit | 1.081 | 0 | fatura venc. 20/09 **pendente** |
| Bela Gaia | 759 | 0 | fatura venc. 28/09 **pendente** (reajustada p/ 793) |
| Meiatrês | 249 | 0 | fatura venc. 28/09 **pendente** |
| Kelly Rodrigues Fortaleza | 1.100 | 0 | fatura de setembro **cancelada** |
| Kelly Rodrigues Store | 1.091 | 0 | fatura de setembro **cancelada** |

Só as duas últimas são perda. **R$ 5,95 mil são faturas emitidas e ainda não
pagas** — a régua da bonificação é *plano pago, pelo vencimento*, e em agosto
essas mesmas marcas pagaram em 26, 28, 29, 31/08, 01/09 e até 09/09. O mês
recém-fechado nasce menor do que vai ficar.

Diante disso a Laura reescreveu a régua no mesmo dia: *"considere os outros
também (ex: oráculo, tino e etc) e as vendas do mês atual já devem entrar na
mensalidade do mês atual"*.

#### A régua nova de "Receita de mensalidade" (01/10/2026)

| Entra | Não entra |
|---|---|
| **todo item recorrente** da fatura: plano, Oráculo, Assistente, Filial, Varejo | **ativação, setup e integração** — cobrança única, não se repete no mês seguinte |
| a fatura **emitida** no mês, pelo vencimento, paga ou não | fatura **cancelada** — deixou de ser cobrança |
| a **venda ganha no mês** que ainda não virou fatura, pelo que falta faturar dela | o que já foi faturado no próprio mês (senão conta duas vezes) |
| | a fatura não paga **com mais de 10 dias de atraso** — prazo em que a plataforma é bloqueada |

O desconto por bloqueio é pedido da Laura no mesmo dia: *"se a plataforma for
bloqueada precisamos descontar esse valor da mensalidade, no caso das que não
pagarem a fatura no mês"*. A régua é a mesma da inadimplência do painel
(`INAD_LIMITE_ALERTA`, 10 dias, decidida em 24/08/2026) e é **datada**, então
vale para todo mês do histórico — ao contrário da lista de bloqueadas do Painel
Elisa, que é foto de hoje. Fatura recém-vencida continua contando até completar
o prazo; se a marca pagar depois, a carga seguinte devolve o valor sozinha.

A consulta `mensalidadeBonif` sai **por categoria de item** (plano, oraculo,
assistente, filial, setup) e é isso que deixa o desconto funcionar: o negócio
ganho no HubSpot entra por `valor − já faturado naquela categoria no mês`.
Em setembro/2026, na carteira da Luana:

| Marca | Venda | Entrou | Por quê |
|---|---|---|---|
| Lesto | Oráculo 1.300 + upgrade 1.100 | **2.102** | a fatura de 15/09 ainda veio com o plano velho (298) |
| Charisma | upgrade 1.299 | **431** | o Plano Básico de 868 já tinha sido faturado no mês |
| Diva Donna / Pijamas Lua Cheia | filial 499 cada | **998** | nenhuma linha de filial na fatura do mês |

Com a régua nova, setembro da Luana é **R$ 96.515** contra R$ 99.109 de agosto,
e a queda inteira são as duas Kelly, com as faturas de setembro canceladas no
Iugu (R$ 7.648). O resto subiu.

Duas leituras continuam visíveis ao lado do número, sem mudar a conta:
`mensalidadeVendaNova` (quanto veio de venda ainda não faturada) e
`mensalidadeEmAberto` (quanto do emitido ainda não foi pago).

### As medidas da Bonificação na Gerencial (28/09/2026)

Pedido do Walid: ver na Gerencial os mesmos pontos que a bonificação mede.
Entraram cinco cards no bloco **Carteira e receita** / **Produtos**, lendo
`DATA.bonificacao` (as mesmas `linhas` por CS e mês que a aba Bonificação usa,
somadas para as CS em foco — então batem com ela por construção):

| Card | Régua | Comparação |
|---|---|---|
| GMV da carteira | pedidos pagos das marcas do CS | mesmo mês do **ano anterior** |
| TPV do VestiPago | transacionado com provider VestiPago | mesmo mês do **ano anterior** |
| Mensalidade | só as linhas de plano da fatura Iugu | mês anterior e ano anterior |
| Tino: marcas com 40+ eventos | marcas que passaram de 40 eventos no mês | mês anterior e marca d'água |
| Integrações ativas | venderam no mês **e** têm `integration_owner = VESTI` | mês anterior, com quem entrou e quem saiu |

Mais o **Health score da carteira**, que é a única coisa da aba que não olha para
o mês: é a foto dos últimos 30 dias, com a distribuição entre saudável, atenção e
risco.

Com 18 cards, a grade passou a sair em **quatro blocos** — Crescimento e
operação, Produtos, Risco, Carteira e receita. O componente agrupa sozinho quando
os cards trazem `grupo`; sem isso (Visão geral e ficha do cliente) continua uma
grade só.

### O que cada card mede

| Card | Definição | Tabela / objeto de origem |
|---|---|---|
| Reuniões | reuniões realizadas no mês (agendamento futuro não entra) e quantas fecharam negócio | HubSpot `meetings` — `hs_meeting_start_time` e o dono; o negócio ganho é creditado à última reunião daquela empresa antes do fechamento, igual à aba Reuniões |
| Novo Tino | marcas que entraram na base do Tino no mês, se já logaram e quantos eventos geraram | API do Tino — `created_at` da marca lá dentro + série diária de eventos |
| Novo Oráculo | marcas que passaram a ter o Oráculo no mês, com atendimentos e GMV iniciado | a MENOR entre `o-configurations.created_at` e o primeiro atendimento; a coluna Origem diz qual valeu. **Janeiro/2026 é atípico**: 699 dos 1.055 domínios têm configuração criada no mês em que a tabela nasceu no espelho — ali a data é do espelho, não da venda |
| **KPIs do topo** | GMV, mensalidade faturada, marcas novas e quem entrou em churn no mês | `MongoDB_Pedidos_Geral` (GMV e pedidos), linhas de plano das faturas Iugu, `odbc_domains.created_at` e a mesma lista da aba Churn |
| Novos VestiPago | marcas com conta de pagamento criada no mês, e quanto elas já transacionaram | `MongoDB_Payment_Companies.createdAt` (a coluna "Implantado em" da aba VestiPago) + série diária do VestiPago (`MongoDB_Pedidos_Geral` com provider VestiPago) |
| Churn VestiPago | marcas cuja **última** transação no VestiPago caiu no mês e que seguem paradas: entra na lista com 30+ dias sem transacionar, vira churn confirmado aos 45 (`meta.diasChurn`) | série diária do VestiPago — última data com valor transacionado por marca |
| Churn Geral | marcas que entraram em alerta, bloqueio ou cancelamento no mês (data do bloqueio, ou o vencimento mais antigo em aberto de quem ainda não foi cortado) | a mesma leitura da aba Churn: módulo `vendas` bloqueado (planilha da automação, via Painel Elisa) + status das faturas na Iugu |
| GMV do 1º mês completo | marcas que viveram no mês o primeiro mês civil **inteiro** de Vesti (cadastro no mês anterior, ou no dia 1º deste), e o GMV que fizeram nele | `odbc_domains.created_at` + `MongoDB_Pedidos_Geral` |
| Clientes 80+ pedidos/mês | marcas com 80 ou mais pedidos no mês — **todos** os pedidos, pagos ou não, que é a régua do painel antigo; o GMV ao lado é só dos pagos | `MongoDB_Pedidos_Geral`, por data de criação do pedido |
| Receita T3+ | a **fatura inteira** do mês dos clientes **não-Starter** (plano do cadastro que não casa com `/starter/i`) | faturas Iugu pagas, pelo mês do vencimento, casadas por CNPJ — plano + integração + Oráculo + filial + assistente + ativação, com o desconto concedido já abatido |
| Cross-sell | oportunidades de produto novo **criadas** e **ganhas** no mês, contadas separadas | HubSpot, pipeline **Expand (Upgrades)**, categoria cross |
| Upsell | upgrades **criados** e **ganhos** no mês, e **a diferença** que a Vesti passou a ganhar com os ganhos | HubSpot (valor do negócio de upgrade) − faturas Iugu no BigQuery (mensalidade anterior da marca) |

### Criadas × ganhas (Cross-sell e Upsell)

Terceiro pedido da Laura em 17/09/2026: "senti falta das oportunidades criadas
além das ganhas". Um negócio tem duas datas, e elas caem em meses diferentes:

- **criada** conta pela data de criação do negócio (`createdate`);
- **ganha** conta pela data de fechamento (`closedate`).

Assim um negócio criado em julho e ganho em agosto aparece em cada mês no seu
lugar, em vez de sumir de um deles. A tabela do card lista tudo que **tocou** o
mês — criado nele, fechado nele, ou os dois — e a coluna *Momento* diz qual foi o
caso. As abas Cross-sell e Upsell continuam filtrando só por `createdate`, como a
Laura pediu em 15/09/2026; quem passou a trazer o `closedate` para o `dados.js`
foi esta aba. Com um `dados.js` anterior a 17/09/2026 o fechamento cai na data de
criação, que era o comportamento antigo.

### Receita T3+ não é um tier, é "todo mundo menos Starter"

Pergunta da Laura em 18/09/2026: "o T3+ é de tudo ou só de algum tier
específico?". É de tudo — a régua é uma exclusão só: entra toda marca cujo campo
`plano` do cadastro **não** contenha "starter". Pro, Avançado, Profissional,
Essencial, Básico, Portal Têxtil, Vesti Light, Conecta, Enterprise, todos contam.
Em agosto/2026 os maiores pedaços eram Vesti Pro (R$ 58 mil), plano_profissional
(R$ 52 mil), plano_avançado (R$ 40 mil) e Básico (R$ 31 mil).

Na mesma conversa a Laura decidiu: **somar a fatura toda**, não só a linha de
plano. Desde 18/09/2026 o card mostra plano + integração + Oráculo + filial +
assistente + ativação (o desconto concedido é linha negativa da própria fatura e
já sai abatido) — que era o que o `fetch_t3plus.py` do painel antigo fazia. As
colunas separam *Mensalidade do plano* de *Outros itens*, porque a conversa de
upgrade é sobre o primeiro e a de cross-sell é sobre o segundo. Em agosto/2026,
carteira das três CS: R$ 347 mil de fatura inteira, dos quais R$ 245 mil de plano
e R$ 102 mil de Oráculo, filial, assistente e ativação.

Uma diferença que sobra em relação ao painel antigo: ele também excluía os planos
**Vesti Light e Vesti Start** por descrição da fatura, e os canais Trial e Treino.
Aqui esses entram — eram R$ 16 mil em agosto/2026, dentro do não-Starter.

### GMV aqui é pedido PAGO (por que 79 mi e não 106 mi)

Pergunta da Laura em 17/09/2026: agosto/2026 dá **R$ 79 mi** nesta aba e mais de
**R$ 100 mi** no Painel Elisa e no painel de Sucesso do Cliente. Os dois estão
certos — medem coisas diferentes:

| | Regra | Agosto/2026 |
|---|---|---|
| Painel de Clientes CS (esta aba e a tabela geral) | `SUM(summary_total)` **só onde `payment_isPaid = 'True'`**, pedido abaixo de R$ 50 mil, marcas da carteira (módulo `vendas`), pela data de **criação** do pedido | **R$ 79,3 mi** — 60.851 pedidos |
| Painel Elisa (`gmv_elisa.json`) | `valTotal` — todo pedido criado no mês, pago, pendente ou cancelado | R$ 106,0 mi |
| Sucesso do Cliente (`mensal[].valTotal`) | idem | R$ 106,3 mi |
| Sucesso do Cliente (`mensal[].valPagos`) | só pagos — **a mesma régua daqui** | R$ 79,4 mi |

Os R$ 79,4 mi de pagos do painel de Sucesso do Cliente batem com os R$ 79,3 mi
daqui (a sobra é o teto de R$ 50 mil por pedido e as marcas fora da carteira), o que
confirma que a diferença é **pago × criado**, e não erro de carga.

A contagem de pedidos, porém, sempre foi a CHEIA (`COUNT(*)`) — na primeira versão
desta aba eu a rotulei de "pedidos pagos", o que estava errado. Corrigido em
17/09/2026: a carga passou a mandar também `pedidosPagos` na série, a aba mostra as
duas contagens e o ticket médio divide GMV pago por pedido pago. Enquanto o
`dados.js` publicado for anterior a essa carga, a coluna *Pagos* aparece como `—` e
o rótulo diz de onde o número está saindo.

### O número do card de Upsell

O negócio de upgrade no HubSpot carrega o **valor do plano novo**. O card mostra o
que interessa para a conversa de gestão: **quanto a mais por mês** a marca passou a
pagar. Marca que pagava 499 e foi para 1.299 entra como **800**, não como 1.299.

A base da subtração é a **última mensalidade que a marca pagou no Iugu em mês
anterior ao upgrade** (BigQuery), e a coluna *Base da comparação* mostra de que mês
ela saiu. Marca **sem mensalidade no Iugu antes do upgrade** — paga por fora, canal
parceiro, cadastro sem plano — fica com o ganho em branco e é contada no KPI
*Sem base anterior*: somar o valor cheio nesses casos inflaria o total.

A alternativa considerada (comparar a fatura do mês seguinte ao upgrade contra a do
mês anterior, tudo no BigQuery) foi descartada com a Laura em 17/09/2026: é mais
fiel ao caixa, mas o ganho só apareceria um ou dois meses depois — os upgrades de
agosto e setembro de 2026 ainda não estavam na fatura no dia em que a aba foi
escrita.

### A aba é 100% BigQuery

O painel antigo tinha um card de **Satisfação (CSAT + NPS)**, e ele **não veio** —
decisão da Laura em 17/09/2026. Era o único número da tela que não existe no lake:
NPS e CSAT do Oráculo moram em planilhas (a do Oráculo, em comentários de célula) e
o CSAT da Plataforma, num formulário do HubSpot. Sem ele, a aba inteira sai da mesma
carga diária do resto do painel, sem fonte nova para manter de pé. Se um dia esses
números forem para o BigQuery, o card volta como os outros.

## Novas vendas: proprietário do negócio e pipelines (29/09/2026)

Pedido do Walid: *"no visão geral em novas vendas dá pra olhar, ao invés do CS,
o proprietário do negócio? Tem vendas da Cris, da Elisa no mesmo pipe;
precisamos somar os 2 mas separar eles"*.

- O card passou a mostrar **duas colunas lado a lado**: *Proprietário do
  negócio* (o dono no HubSpot) e *CS da marca* (o do cadastro). Elas divergem
  com frequência.
- Ganhou um gráfico de composição **somando por proprietário**.
- O KPI "quem mais vendeu" **ignora os negócios sem dono** — são muitos (26 dos
  62 nos últimos 90 dias) e seriam sempre o maior grupo.

E *"pegar todos que são novo cliente independente do pipeline"*: a carga
escolhia os pipelines pelo estágio **Implantado**; agora aceita também os que
têm **Novo cliente**. Isso trouxe o **Varejo - Jornada**, que ficava de fora
porque o estágio final dele se chama "Implementado", com E — são 916 negócios
que o painel não via. Os cinco pipelines com esse estágio: Sucesso do Cliente,
Sucesso do cliente - Integração, Sucesso do Cliente - Plataforma, CS - Starter e
Varejo - Jornada. (O catálogo de pipelines e estágios sai no log do workflow
**Conferir HubSpot**.)

## Novas vendas: o que é venda nova, afinal (05/10/2026)

Crítica da Laura: *"não dá pra ver de cara quanto vendeu de novos clientes
(Cris), quanto vendeu de clientes de parceiros… entrou tipo Biotipo que foi uma
integração"*. O card contava **todo negócio criado** nos pipelines de CS, e ali
dentro moram quatro coisas diferentes:

| O que é | Exemplo de setembro/2026 |
|---|---|
| **Cliente novo** — marca que não estava no cadastro ou entrou há menos de 90 dias | Ladycor, Confecções AFP, Bressia Modas |
| **Cliente existente** — expansão em quem já era da casa | **Biotipo** (cliente desde 20/02/2025, negócio de integração aberto em "Novo Cliente"), Callisaya, Provenza, Versally |
| **Interesse** — estágio de pré-venda do Varejo - Jornada, R$ 0 | Vallen Store, Grupo Sorella, Vixi Maria kids |
| **A mesma marca duas vezes** — negócio aberto em dois pipelines | Calu Acessórios, três vezes no mês |

O card conta **marca que entrou ou que voltou** — tabela, gráfico e números —, e
o que ficou de fora aparece no KPI "Fora da conta", com a quebra entre expansão
e interesse. Some sem dizer seria esconder, que foi o que gerou a dúvida da
Biotipo.

**Reativação** (05/10/2026). A Laura: *"Callisaya Modas . Starter, essa por
exemplo, por que não aparece?"*. A marca entrou na Vesti em junho de 2024, deu
**churn em janeiro de 2025** e **voltou em 09/09/2026 pagando R$ 499 de Ativação
de Assinatura**. Pela régua de cadastro ela era "cliente existente" — mas pagar
ativação de novo é venda. Marca de cadastro antigo com **Ativação de Assinatura
paga até 45 dias do negócio** passa a contar, com a Origem dizendo *Reativação*.
O item importa: "Ativação de Assinatura" é contrato novo, "Setup de Integração"
não — é o que separa a Callisaya da Biotipo. Em setembro entraram duas
(Callisaya e Provenza) e o card foi de R$ 4,7 mil / 8 marcas para R$ 5,7 mil /
10 marcas.

**Uma linha por marca.** A Calu Acessórios abriu três negócios de R$ 499 em
setembro; somar daria R$ 1.497 de uma venda que foi uma. Fica valendo o de
maior valor (empate, o mais antigo) e a coluna *Negócios no período* mostra
quantos foram.

**O número grande é o valor ganho** (`amount` do negócio no HubSpot), não a
contagem — pedido da Laura em 05/10/2026. A contagem desceu para a linha de
baixo e é o que o gráfico desenha ao longo do período escolhido no filtro.
Setembro: **R$ 4,7 mil de 8 clientes novos**, contra R$ 18 mil de 19 em agosto.

**De parceiro × direto.** A coluna **Canal** é o parceiro dono da conta no
cadastro. Attasoft, Uemtel, Ve Vantagens, ProRoi, Glads, Up Agency, Onix e
Tizeefy contam como venda de parceiro; Vesti, Varejo Vesti, Starter, Trial e
Treino contam como direto. A lista de fora é a curta e estável, então parceiro
novo que apareça no cadastro cai em "parceiro" sozinho. Em setembro: 3 de
parceiro (todos Uemtel, R$ 1,5 mil) e 5 diretos (R$ 3,7 mil).

**Como a marca é achada.** O onboarding passou a trazer o **CNPJ da empresa
associada** no HubSpot. Sem ele não dava: o nome do negócio vem com sufixo de
pipeline ("Confecções AFP - Starter") e não casa com o cadastro. Na falta do
CNPJ, o nome é comparado sem acento e sem caixa, com o sufixo removido — casar
com `===` fazia cliente antigo passar por novo (caso da Callisaya Modas).

## Churn declarado na planilha (29/09/2026)

Terceira leitura de churn do painel, e a única **escrita por uma pessoa**:
`fetch_churn_planilha.py` lê a **aba 2026** da planilha que o time preenche e
aceita só as linhas cuja coluna *observação* é **"solicitou cancelamento"** ou
**"inadimplente"** — as outras são ignoradas, como o Walid pediu. Vira o card
*Churn declarado (planilha)* na Gerencial, ao lado de:

| Card | O que é |
|---|---|
| Churn do mês | a marca **parou de pagar** (fato, calculado na carga) |
| Inadimplência hoje | quem está **em atraso agora** (foto) |
| Churn declarado (planilha) | o que o time **registrou**, com o motivo escrito |

Funcionando desde 29/09/2026, quando a planilha foi liberada: **539 linhas na
aba, 425 aceitas** — 245 "solicitou cancelamento" e 180 "inadimplente". Ficam de
fora upsell para pro, upsell para avançado, troca de canal, downsell e retorno
na recuperação.

Três coisas que a planilha real ensinou:

- a coluna **domínio vem de fórmula** e chega como `#REF!` ou `None` na maioria
  das linhas — só vale quando é número mesmo. Célula com erro de fórmula passou
  a valer o mesmo que vazia em qualquer coluna;
- **`mensalidade` antes de `valor`**: existe uma coluna "valor reajuste" que o
  prefixo pegaria primeiro, e ela não é o que a marca pagava;
- a planilha **não tem CS, tem vendedora** — são coisas diferentes. A vendedora
  virou coluna própria e o CS sai do cadastro, casando por **CNPJ** (262 das 425
  linhas têm) e, na falta dele, por domínio ou nome.

O script tenta primeiro o link público e depois a service account, nessa ordem;
se nenhuma der, ele avisa no log, sai sem escrever e o card aparece vazio
dizendo isso. Se a planilha mudar de endereço, dá para apontar outra pelo
`CHURN_SHEET_ID` nas variáveis do repositório, sem mexer no código.

## Conferência com o HubSpot (24/09/2026)

`conferir_hubspot.js` + workflow **Conferir HubSpot** (`workflow_dispatch`, na
aba Actions): conta reuniões, tickets e negócios direto na API e compara, mês a
mês, com o `CS/dados.js` publicado. Não escreve nada — o resultado sai no log.
A contagem usa o campo `total` da Search API, então conferir 12 meses custa 12
chamadas, não 12 páginas inteiras.

Resultado da primeira rodada, em 24/09/2026:

| | HubSpot | painel | |
|---|---|---|---|
| Reuniões (2026) | 452 | **337** | faltavam 115 |
| Tickets (2026) | 2.263 | 2.258 | faltavam 5, criados depois da carga |

As 115 reuniões que faltavam eram o **filtro de dono**: a carga só aceitava as
de sete nomes de CS e jogava fora reunião marcada por vendas, por parceiro ou
por quem entrou no time depois. A Laura decidiu tirar o filtro ("se tiver
reunião com o nome da marca mas o dono for outro, pode colocar em reuniões"), e
depois disso a conferência fecha **452/452 e 2.265/2.265, mês a mês**.

O que mudou junto:

- a busca de reuniões passou a **paginar mês a mês**, como a de tickets: a
  Search API corta em 10.000 por consulta e uma consulta única do ano perderia
  as mais antigas em silêncio se o volume crescesse;
- na aba **Gerencial**, quem decide se a reunião entra na carteira das três CS
  passou a ser **de quem é a marca**, não quem marcou — as duas informações
  ficam em colunas separadas ("CS da marca" e "Quem marcou"), ali e na aba
  Reuniões;
- os donos que apareceram depois disso: além das CS, `(sem responsável)` (68),
  Gabrielly Ferreira, Alfredo Silva, Karoline Nobre, Victor da Silva e mais
  seis nomes.

Limites que **continuam** valendo, e que a conferência não desfaz:

- **só o ano corrente**, nos dois objetos — reunião e ticket de 2025 não entram;
- **casamento com a marca é parcial**: 204 das 452 reuniões e 710 dos 2.265
  tickets têm domínio da carteira. O resto é empresa que não é marca com módulo
  de vendas, ou registro sem empresa associada (73 reuniões);
- o painel reflete o HubSpot **até a última carga** (04:00, ou quando rodada na
  mão).

## Aba Visão do cliente (24/09/2026)

A ficha de uma marca só. A aba abre com as marcas da carteira das **três CS** e
uma **busca** que casa por nome (com ou sem acento, já nas primeiras letras),
CNPJ (com ou sem pontuação), domínio ou id da empresa — sugerindo enquanto se
digita. Marca de outra CS aparece no fim da lista, marcada como fora da carteira
das três, em vez de sumir.

Escolhida a marca, ela vira uma grade de **doze cards**, a mesma mecânica da
Visão geral e da Gerencial, com histórico **mês a mês dos últimos 12 meses**:

| Card | O que mostra |
|---|---|
| RG do cliente | CNPJ, razão social, CS, canal, plano, integração (e o dono dela), data de cadastro, lojas do domínio com endereço e telefone |
| Histórico de GMV | pedidos, pagos, GMV e ticket por mês |
| Uso do Tino | eventos por mês, status na base do produto, último acesso |
| Uso do Oráculo | atendimentos, % da IA, GMV iniciado e finalizado |
| Uso do VestiPago | transacionado por mês, separado em PIX, cartão e links de cobrança |
| Links × cliques | listas de produto que os vendedores compartilharam e os cliques que receberam |
| Mensalidade | uma linha por fatura do Iugu, paga ou não, com dias de atraso |
| Health score | a régua das cinco regras, aberta |
| Tickets | chamados do HubSpot, abertos e encerrados, com tempo de fechamento |
| Reuniões | reuniões realizadas e agendadas, e o que fechou negócio |
| Negócios | cross-sell e upgrade, com temperatura e o ganho por mês do upgrade |
| Implantação e marcos | tempo até 5 e 25 pedidos pagos e 100k de GMV, e há quanto tempo o negócio de onboarding está no estágio atual |

O que a carga ganhou para isso:

- **`odbc_companies` por domínio** (matriz + filiais) com CNPJ, endereço,
  telefone e status. Duas armadilhas resolvidas no caminho: a tabela tem **2,16
  milhões de linhas** (guarda a empresa de cada conta da plataforma, não só as
  marcas), então a consulta dá `JOIN` com o mesmo filtro de domínios do cadastro
  e guarda no máximo 60 empresas por marca no arquivo, com a contagem cheia em
  `lojas`; e o espelho veio de um `SELECT *`, então **quais colunas de endereço
  existem é perguntado ao `INFORMATION_SCHEMA`** em vez de chutado — coluna que
  não existe vira `NULL` e o painel mostra "—".
- **`iugu_invoices` uma linha por fatura**, paga ou não, casada com a marca pelo
  mesmo mecanismo CNPJ → nome do pagador do resto da carga.
- **`sucessodocliente_rankings`**: os cliques nos links compartilhados, ao lado
  dos links que entraram em 22/09.
- CNPJ, razão social, nome fantasia e dono da integração no cadastro da marca.

Nenhuma dessas consultas é obrigatória: se uma falhar, o card diz que não tem o
dado e o resto do painel carrega igual.

**Cuidado ao ler o card de implantação:** a coluna *Origem* separa o que é marco
medido no BigQuery do que é estágio arrastado no board do HubSpot. Os dois têm
nomes iguais ("25 Pedidos Pagos") e querem dizer coisas diferentes — e o HubSpot
não guarda quando o negócio entrou em cada estágio, então o que dá para medir é
o tempo desde a criação do negócio.

O catálogo de tabelas do dataset agora vai inteiro para o log da carga: a
próxima pergunta do tipo "existe tabela de cidade?" custa zero rodada.

## Health score (22/09/2026)

Régua da Laura, uma nota de 0 a 100 por marca, na coluna **Health score** da
tabela geral (ela escolheu ali, em vez de uma aba própria):

| Regra | Pontos |
|---|---|
| Pedido há menos de 5 dias | +20 |
| Atividade na plataforma há menos de 3 dias | +30 |
| Mais de 1 link compartilhado por dia, em média | +20 |
| GMV estável ou crescendo (queda de até 15%) | +20 |
| Média de 2 ou mais pedidos por dia | +10 |

Acima de 80 é **saudável**, de 50 a 79 **atenção**, abaixo **em risco**. O
balãozinho do número abre a régua inteira, regra a regra, com o motivo de cada
uma ter entrado ou não.

Três decisões que mudam a leitura:

- **"Acessou a plataforma" não existe no BigQuery.** Login de lojista não é
  espelhado — é a mesma pendência da coluna *Último acesso*. O que existe é
  **atividade**: a marca compartilhou um link de produto (`sucessodocliente_products`,
  que a carga passou a puxar em 22/09/2026) ou entrou um pedido. A regra usa o
  mais recente dos dois, decidido com a Laura. **É uso, não login.**
- **A janela é de 30 dias corridos, não o mês civil**, e não depende do filtro de
  período da aba. Comparar um mês pela metade com um mês cheio derrubaria o score
  de todo mundo no dia 1º; e "a marca está saudável" não pode mudar de resposta
  conforme a janela que alguém escolheu para olhar receita. "GMV crescendo" é,
  portanto, os últimos 30 dias contra os 30 anteriores.
- **Regra sem fonte sai da conta, não zera.** Se a carga não trouxer os links
  compartilhados, aquela regra é marcada como indisponível e o score é
  normalizado sobre os 80 pontos que sobraram — penalizar a marca por uma falha
  de ingestão nossa seria pior do que medir com uma régua menor. O balãozinho
  avisa quando isso acontece.

Os dias contam até o último dia com dado no arquivo, não até hoje: a carga roda
de madrugada e medir contra "hoje" faria toda marca parecer parada de manhã.

## Projeção do mês em andamento (Bonificação, 22/09/2026)

Pedido da Laura: *"só conseguimos ver de fato quando o mês termina, mas precisava
ver uma projeção — se a marca usou 20 eventos em 15 dias, é provável que chegue
nos 40, então na projeção deveria contar como 1"*.

No mês que ainda está correndo, cada número da aba ganha embaixo uma linha **≈**
com a projeção do fim do mês — na tabela de números e também na **pontuação**,
onde a projeção roda a mesma régua de pontos sobre a linha projetada (não existe
uma segunda régua para manter em dia). Mês fechado não tem projeção: o número
dele já é o número. Mês que ainda não começou aparece como tal.

Três métodos, porque as regras não são todas do mesmo tipo:

| Regra | Método | Por quê |
|---|---|---|
| Tino (marcas com +40 eventos) | **marca a marca**: eventos da marca ÷ dias corridos × dias do mês; conta quem cruza os 40 | esticar a contagem não faz sentido — uma marca que já bateu não vira duas |
| Integrações ativas | **quem costuma repetir**: quem já contou no mês + quem contou no mês passado e ainda não apareceu | é contagem de marcas distintas e não existe série diária de "vendeu com integração" |
| GMV, mensalidade, VestiPago, reuniões, varejos | **regra de três** pelos dias corridos | é o que a Laura descreveu, e vale para medida que acumula |

O método do Tino foi conferido contra os meses fechados: rodando a mesma conta
sem projeção em julho e agosto de 2026, a contagem por marca bate **exatamente**
com o número que a carga apura para cada CS.

Duas ressalvas que estão escritas na própria aba:

- **A mensalidade é a mais frágil**: as faturas vencem em dias concentrados, então
  a regra de três erra mais no começo do mês.
- **"Dias corridos" conta até o último dia com dado no arquivo**, não até hoje — a
  carga roda de madrugada, e incluir o dia de hoje (ainda sem pedido nenhum)
  derrubaria toda projeção na primeira hora da manhã.

## Não existe carteira histórica (02/10/2026)

A Laura pediu GMV e TPV de out/nov/dez de 2025 **com a carteira da época**, não
com a de hoje aplicada para trás. Procurei e o dado não existe:

1. **No lake.** Varri o dataset inteiro (`conferir-bigquery.yml`, modo
   `explorar`): a única coluna de CS é `odbc_domains.angel_id`, que guarda o
   estado **atual**. Não há tabela de histórico, log de troca nem retrato
   mensal — trocar a CS de uma marca sobrescreve o campo e o passado some.
   `Metas_CS_Faturamento` tem CS, marca e data, mas só de meta batida: é
   esparsa, não é carteira.
2. **No HubSpot.** O histórico de `hubspot_owner_id` das empresas é datado e
   cobriria 2025 (57% das marcas têm registro anterior a 2026). Só que o dono
   da empresa **não é a CS**: das 1.337 marcas da carteira que casam com uma
   empresa lá, o dono de hoje é a CS de hoje em **7,8%**. É o vendedor, não
   quem cuida da conta. Por isso `carteira_2025.js` mede essa concordância
   antes de usar o número e recusa quando fica abaixo de 70% — número errado
   com cara de certo é pior que número nenhum.

Fica o aviso para a próxima vez que a pergunta aparecer: **todo recorte por CS
anterior a hoje usa a carteira de hoje**, inclusive a comparação ano a ano da
Bonificação. Para ter a carteira real da época seria preciso guardar um retrato
mensal de `angel_id` daqui para a frente, ou achar uma planilha do time com a
carteira de então.

> `CS/carteira_2025.js` + workflow "Carteira da época" ficam no repositório: é o
> diagnóstico pronto para rodar de novo se alguém tiver a mesma dúvida.

## Ressalvas que mudam a leitura do número

Estão também dentro do painel: clique no selo do topo direito.

**Já validados contra fonte independente (13/08):** interchange e antecipação foram
cruzados pedido a pedido com `vestipago_transaction_detail` — 28.559 pedidos, R$ 910.311
contra R$ 909.346 de fee, 0,97% de divergência (estornos). A base está correta.

**Conferência da Alcance Loja Fábrica, julho/2026 (14/08).** Suspeita de que a
receita estivesse "puxando PIX". Não está — **PIX não entra em nenhuma linha de
receita**, porque `payment_transaction_vestiPagoValue` vem nulo em PIX (ressalva
2). Os R$ 44,6k de julho (semanas 27–31) se decompõem assim:

| Origem | Valor | De onde |
|---|---|---|
| Interchange | R$ 31.562 | cartão STARKBANK: R$ 22.211 de fee + R$ 9.352 de antifraude |
| Antecipação | R$ 11.405 | R$ 60.571 cobrados do lojista × 18,85% |
| Mensalidade + Outros | R$ 1.619 | fatura Iugu da semana 29 |
| **PIX** | **R$ 0** | R$ 41.849 transacionados, fee nulo na fonte |

O GMV da marca no mesmo mês é R$ 5,1M, mas R$ 3,95M disso são pedidos **pagos
por fora** (provider nulo, ressalva 6): aparecem em "Valor dos pedidos" e não
geram receita nenhuma. Se o número parecer alto, o candidato é a **antecipação**
(26% dos 44k) — é a única parcela estimada, por um fator médio da carteira e não
por medição pedido a pedido (ressalva 4).

0. **Data de cadastro = criação do domínio** (`odbc_domains.created_at`), ao lado
   de "Último acesso" na tabela geral, com o tempo de casa embaixo ("7a 4m").
   Está preenchida em 100% das 2.372 marcas, de 23/08/2016 até hoje, e nenhuma
   empresa em `odbc_companies` foi criada antes do domínio dela — então o
   domínio é mesmo a porta de entrada. Das 964 marcas com atividade em 2026, a
   safra maior é 2025 (170) e 2020 (139).

1. **Último acesso na plataforma não tem fonte.** Não existe coluna de login/sessão
   de lojista em nenhuma tabela do `vestilake_BI` — procurei por `login`, `acess`,
   `last_*`, `signin`, `session`, `visit`, `seen`. `odbc_users.updated_at` não serve
   (muda a cada edição de cadastro e está parado desde 25/06). A coluna existe no
   layout e mostra `—` até alguém expor esse campo no espelho; o KPI de abandono usa
   **último pedido** no lugar. Já o **último acesso no Tino** existe e está na aba do
   Tino: é o `last_login` da API do produto.

2. **O fee da Vesti só existe para cartão.** Em PIX o campo vem nulo tanto em
   `MongoDB_Pedidos_Geral` quanto em `vestipago_transaction_detail`, e PIX é ~53%
   das transações VestiPago (108.950 transações / R$ 90,2M em 2026). Então
   "Interchange" e "Receita (fee)" cobrem só o cartão; **valor transacionado cobre
   os dois** e está quebrado em Cartão e PIX na aba.

2b. **A fatura do Iugu acha a marca por CNPJ e, se falhar, pelo nome (18/08).**
   A fatura não traz domínio, então o casamento é por CNPJ — e em 2026 **925
   faturas pagas (R$ 564k, 13% do faturamento Iugu) estão num CNPJ que não existe
   no cadastro**. Foi o caso da Sawary: paga R$ 4.078/mês no CNPJ
   00.422.351/0001-90 e o cadastro dela tem 82.364.623/0001-08 — a receita sumia
   da linha dela (e o CNPJ do Iugu ainda aparece no cadastro de um terceiro,
   "Mary Elias"). Agora, quando o CNPJ não acha ninguém, a fatura procura pelo
   **nome do pagador**: o Iugu grava "Marca = RAZÃO SOCIAL LTDA", então tanto o
   apelido quanto a razão servem. Casamento **exato** depois de normalizar e só
   quando aponta para UMA marca. Isso resgatou 336 linhas (~R$ 154k). O mesmo
   resgate vale para **plano, vencimento e churn**, que saem da mesma fatura —
   sem ele, marca que paga em dia podia ser marcada como cancelada.
   Sobram R$ 410k sem dono, e a divisão é: **R$ 146k de contas que existem mas
   estão como "só compras"** (mesmo caso de [[DOMINIOS_EXTRA]], resolvível
   incluindo a marca) e **R$ 282k cujo nome não bate com domínio nenhum** — esses
   precisam de correção de cadastro, não de código.

3. **Mensalidade é só o plano.** A fatura do Iugu junta plano, Oráculo, Filial,
   Assistente e taxa de ativação no mesmo `total_cents`, e só **75,2%** é plano.
   Por isso a soma é feita linha a linha do item: o plano vai para "Mensalidade"
   (R$ 2,75M em 2026) e o resto para "Outros (Iugu)" (R$ 793k). Os dois entram na
   Receita total. Se a régua do time for "mensalidade = tudo que a marca paga por
   mês", é só somar as duas colunas.

4. **Antecipação é estimada.** `payment_transaction_antecipationValue` é o que o
   lojista pagou de antecipação, não o que a Vesti ganhou. O fetcher mede a fração
   da Vesti em `vestipago_transaction_detail`
   (`antecipationVestiFee / antecipationValue` = **18,83%**) e aplica sobre o valor
   cobrado. O fator é recalculado a cada carga e fica em `meta.fatorAntecipacaoVesti`.

5. **Links do VestiPago = só `'Link de cobrança'`.** Conferido no dado: os pedidos
   dessa origem que aparecem sem provider são exatamente os que ninguém pagou
   (8.562 pedidos, 0 pagos), ou seja, o link é do VestiPago de ponta a ponta.
   `'Link sem preço'` ficou de fora porque tem 4.226 pedidos **pagos por fora**
   (R$ 8,8M), e `'Link'` puro (573k pedidos) é o link de compartilhamento do
   vendedor, não de cobrança.

6. **Pedido com provider nulo não é VestiPago.** 162k pedidos pagos / R$ 352M de GMV
   em 2026 são vendas registradas na plataforma mas pagas por fora. Entram no GMV da
   tabela geral e ficam fora da aba VestiPago. É por isso que marcas grandes como
   Egoiste e JDL aparecem com receita R$ 0 — está certo, elas não usam o produto.

6b. **Data de implantação por produto (26/08/2026).** Cada aba de produto ganhou
   a coluna "Implantado em", com o tempo de casa embaixo; marca que entrou dentro
   do período selecionado aparece destacada, porque o número dela cobre menos
   dias que o das outras. As fontes estão na tabela acima. **A do Oráculo pede
   cuidado**: 699 dos 1.055 domínios têm a configuração criada em jan/2026, que é
   quando a tabela nasceu no espelho — para esses, a data é do espelho e não da
   venda. Quando o primeiro atendimento é anterior, ele é que vale, e a coluna diz
   de onde veio cada data.

6c. **Bonificação: os números e, embaixo, os pontos.** A aba traz as sete regras
   da planilha da Laura, uma coluna cada, por CS e por mês-calendário — mais
   "Integrações ativas", que entrou em 01/09/2026 vinda do Power BI. Três regras
   comparam com a **marca d'água** do CS (Tino +40 eventos, mensalidade,
   integrações ativas), duas com
   o mesmo mês do ano passado (VestiPago, GMV) e três são contagem do próprio mês
   (reuniões, varejos). Passar o mouse no número lista as marcas que
   entraram nele. As três de dinheiro (mensalidade, VestiPago, GMV) mostram a
   variação em **porcentagem**, não em reais (27/08/2026) — o valor em R$ da
   diferença fica no title da célula.

   A **segunda tabela** converte esses mesmos números em pontos (régua da Laura,
   revisada em 01/09/2026), sem medir nada de novo:

   | regra | pontos |
   |---|---|
   | Tino | 10 por cliente extra com 40+ eventos, acima da marca d'água |
   | Mensalidade | meta 0: 3 a cada 1% acima da marca d'água |
   | VestiPago | meta 40%: 2 a cada 1% acima dela, vs. o mesmo mês do ano passado |
   | Reuniões | 1 cada |
   | Integrações ativas | 10 por integração acima da marca d'água |
   | GMV | meta 10%: 2 a cada 1% acima dela, vs. o mesmo mês do ano passado |
   | Varejos | 10 cada |

   **Meta é piso, e não paga nada por si.** Bater exatamente 40% no VestiPago é
   zero; 41% são 2 pontos. Só ponto fechado conta: 41,9% continua sendo 1 de
   excedente, não 2.

   **"Novas integrações" foi SUBSTITUÍDA por "Integrações ativas" em 01/09/2026.**
   A antiga media o fluxo — integração nova fechada no mês — e dava 0 ou 1: foram
   7 no time todo em 2026, e nunca duas no mesmo mês para o mesmo CS. A nova mede
   o estoque e herdou a vaga de pontos, agora valendo 10 por integração acima da
   marca d'água. O retrato diário (`integracoes_snapshot.json`) **continua sendo
   gravado** mesmo sem a coluna que ele alimentava — é a única coisa que registra
   quando uma integração começa, e um dia não fotografado não volta.

   A **marca d'água** (31/08/2026) é o maior número que aquele CS já registrou em
   um mês, contando só os meses **anteriores** ao escolhido — incluir o próprio mês
   faria a diferença ser sempre zero ou negativa e ninguém bateria a própria marca.
   Antes, Tino e mensalidade comparavam com o mês anterior; na prática o ponto
   ficou mais caro, porque só pontua quem faz o melhor mês da própria história. O
   primeiro mês da série não tem recorde atrás e compara contra zero, igual ao que
   já acontecia com um "mês anterior" inexistente.

   Duas decisões que a régua não dizia: **queda não tira ponto** (mês que não bate
   a marca d'água, ou pior que o ano passado, dá zero, não negativo) e, nas
   porcentagens, **só bloco fechado conta** — 3,9% no
   VestiPago é 1 ponto, não 2. A mensalidade é a única que arredonda para cima,
   porque foi o que ela pediu. Quem não tem base no ano anterior (marca que não
   existia, ou CS que assumiu a carteira depois) faz zero ponto nas regras de %:
   não dá para chamar de crescimento o que não tem de onde crescer. O title de
   cada célula mostra a conta que gerou o ponto.

   Três coisas para ler junto com a tabela:
   - **A carteira é a de hoje.** A marca é creditada ao CS que a atende agora,
     porque o cadastro não guarda o histórico de quem atendia antes. Quem assumiu
     carteira no meio do caminho aparece com base baixa em 2025 e um "crescimento"
     que é troca de responsável.
   - **Varejo novo = filial nova de marca já existente, e de VAREJO.** São duas
     perguntas, e cada uma tem sua fonte:
     - *é filial?* `odbc_companies.parent_id` nunca vem preenchido no espelho
       (zero linhas em 20 meses), então filial é a 2ª empresa em diante do mesmo
       domínio, por ordem de criação — a mesma régua do PainelElisa. Filial com
       "teste" no nome fica de fora.
     - *é de varejo?* **Não existe no espelho `odbc_*`**: `lojista` vem `false` em
       todas as filiais, `market` vem nulo, as 18 tags são de segmento de moda
       (jeans, fitness, praia) e o canal "Varejo Vesti" está zerado desde
       jul/2025. A marcação real é a coluna **"Tipo _Atacado | Varejo_"** do
       Relatório Confecções (Fabric, `dbo.Confeccao2025_Query1`), a mesma que o
       CS-Sucesso usa. Ela foi trazida para o BigQuery em **`confeccao_tipo_empresa`**
       por `carregar_tipo_empresa.js`.

     Isso muda o número: contando qualquer filial dava 3 a 13 por mês; contando só
     as de varejo dá **1 a 4**. Cerca de cinco em cada seis filiais novas são de
     atacado.

     ⚠️ **A classificação tem data de corte.** A carga atual é de **30/03/2026**,
     porque veio do CSV do CS-Sucesso: em 26/08/2026 o warehouse do Fabric não
     respondia nem a um `SELECT 1` ("Couldn't complete the operation due to a
     system update", em 6 tentativas com reconexão). Filial criada depois disso
     fica sem tipo, **não entra na conta** e aparece na célula como
     "+N sem classificação" — para ninguém ler zero como "não abriu nenhuma".
     Quando o Fabric voltar, `node carregar_tipo_empresa.js --fabric` atualiza a
     tabela e a aba melhora sozinha, sem mexer em mais nada.

     ✍️ **Dá para marcar na mão, e é o que vale.** Como a classificação automática
     está congelada, a aba deixa dizer filial por filial se é de varejo: na coluna
     **"Varejos novos"**, clicar no número abre a lista daquele CS naquele mês, com
     três botões por filial — *Varejo*, *Atacado* e *Automático* (seguir o cadastro).
     Também dá para apontar uma **marca inteira**, para o varejo que abre em domínio
     próprio ("Nicoboco Varejo") e que a régua de "2ª empresa do mesmo domínio" nunca
     enxerga como filial.

     **Um clique em "Salvar para todo mundo" e acabou.** A marcação vai para
     `CS/varejo_manual.json` no repositório e passa a valer para quem abrir o painel,
     sem esperar a carga da madrugada.

     Como uma página estática não commita nada sozinha, quem grava é a **API do
     stark-admin** (`https://vesti-contas.vercel.app/api/varejo`), que guarda o
     `GH_TOKEN` no servidor — mesma ideia do `overlays.js` do relatoriocs2:
     - `GET /api/varejo` é **público**: o painel lê no boot e aplica por cima do
       `dados.js`, então a marcação de uma CS aparece para as outras no mesmo dia;
     - `POST /api/varejo` pede `Authorization: Bearer <senha do painel>` (env
       **`CS_SENHA`** na Vercel, hoje igual à senha da tela). Manda só o que mudou;
       o servidor aplica em cima do arquivo mais novo com retry, então duas CS
       marcando ao mesmo tempo não se apagam. Cada salvamento é **1 commit**.
     - ⚠️ a senha de escrita é a mesma que está no código da página. Quem abre o
       painel pode marcar varejo — é o mesmo nível de acesso do painel em si. Para
       separar, basta trocar `CS_SENHA` na Vercel e pedir a senha na tela.

     Enquanto não foi salvo, fica **só no navegador** (`localStorage`, chave
     `painelcs:varejo-manual`) e aparece com um **ponto dourado** — inclusive se a
     API estiver fora. O botão **"Baixar arquivo"** é o plano B: gera o
     `varejo_manual.json` para publicar à mão (`node publicar.js --varejo --sem-dados`).

     O `fetch_dados.js` lê esse mesmo arquivo em cada carga, então os números
     agregados do `dados.js` também nascem já com a marcação.

     Precedência: **marcação no navegador > `varejo_manual.json` > cadastro**. O
     `publicar.js` se recusa a subir um `varejo_manual.json` local que tenha MENOS
     marcações do que o que já está no repositório — seria apagar o trabalho de
     outra pessoa; nesse caso ele avisa e publica o resto.
   - **Integração nova ainda é o que o HubSpot registrou.** O cadastro guarda quem
     TEM integração, não desde quando — não há histórico para reconstruir. A partir
     desta versão a carga fotografa a carteira todo dia (`integracoes_snapshot.json`)
     e acumula o que mudou (`integracoes_novas.json`), então o número melhora
     sozinho a cada dia que passa. Os dois arquivos são commitados pelo workflow:
     sem isso o retrato nasceria vazio a cada execução e nada seria detectado.

7. **Churn (10/09/2026) passou a ser a mesma leitura da aba Inadimplentes do
   Painel Elisa/Gambiarra**, não mais a inferência por fatura vencida deste
   item (histórico, mantido aqui pelo contexto). 3 estados: Em alerta (módulo
   `vendas` ligado, 1-10 dias de fatura vencida), Bloqueada (módulo ligado
   11+ dias, OU módulo já cortado com fatura ainda em aberto na Iugu) e
   Cancelada (módulo cortado **e** a última fatura mapeada tem status
   `canceled` na Iugu — a mera ausência de fatura vencida não comprova
   cancelamento). A data exata em que o módulo `vendas` foi cortado **não
   existe em nenhuma tabela do BigQuery** (confirmado em 09/09/2026, buscando
   nas 3 datasets do projeto) — vem de uma planilha Google Sheets alimentada
   por um workflow n8n, que o Painel Elisa já lê. Em vez de duplicar esse
   fetch aqui, `carregarChurnGambiarra` (fetch_dados.js) lê os JSONs que o
   Painel Elisa já gera todo dia (`../Gambiarra/inadimplentes_elisa.json`,
   `status_faturas_elisa.json`, `ambiente_elisa.json`, `pagamentos_elisa.json`)
   e replica a mesma lógica de negócio. Os dois painéis rodam em horários
   diferentes (Elisa 08:00/15:30 BRT, CS 04:00 BRT), então um domínio pode
   ficar num limbo de 1 carga — visto e documentado no código, tende a sumir
   sozinho na carga seguinte.

8. **Cross-sell × upsell sai do nome do negócio.** A API não liberou escopo de
   `line_items` (403), então a classificação usa os padrões em `REGRAS_PRODUTO`.
   Regra definida na revisão de 13/08: **upsell = só upgrade de plano**; todo o
   resto (Filial, Multiloja, Oráculo, Integração, Assistente, VestiPago, Tino) é
   cross-sell. Exceções em `EXCECOES`: Kelly Rodrigues Store Fortaleza = Filial,
   Jay & Co e Landê Oficial = Upgrade. Fechado é só o estágio "Ganho (Expand)";
   "Em aberto" não conta como perdido.

9. **CS.** Marcas de anjos que saíram da carteira (`ANJOS_FORA`: Shirley Silva,
   Priscila Argolo) aparecem como "Sem CS". A aba Tarefas mostra só o time em
   `CS_TAREFAS` — Luana, Thamiris, Cristiane, Elisa, Gabriella, Alexia e Tatiane.
   O filtro de CS de cada aba é montado a partir das linhas dela, então nunca
   oferece um nome que não devolve nada. Cross-sell, Upsell e Churn passaram a
   mostrar a coluna **CS** junto com o filtro.

9b. **Interchange agora é líquido do banco (18/08).** O fee de cartão que o
   lojista paga (`vestiPagoValue`) não é receita inteira da Vesti: ele se divide
   em `mdrCardBrandValue`, que vai para o adquirente (Iugu, Starkbank, Pagarme),
   e `mdrVestiValue`, que fica com a Vesti. Em 2026 são R$ 953k de fee, dos quais
   **R$ 840k (88%) são do banco** — a coluna Interchange passou a ser
   `mdrVestiValue + antifraudValue` = **R$ 450k**, e a Receita total caiu junto.
   O antifraude continua inteiro: é cobrança da Vesti, não taxa de banco. Por
   isso o interchange saiu de `MongoDB_Pedidos_Geral` e passou a ser medido em
   `vestipago_transaction_detail`, a única tabela com a quebra do MDR (a
   diferença entre as duas bases é ~1%, já conferida em 13/08). A antecipação já
   era líquida, pelo fator `antecipationVestiFee/antecipationValue`.

9c. **O Tino não vem mais do BigQuery (18/08).** `sucessodocliente_rankings` só
   tinha os links compartilhados ("cliques") e não sabe quem *tem* o produto. A
   aba passou a ler a **API do Tino** (a mesma de `admin.tino.vesti.com.br`):
   `customer_kpis` dá o total de marcas — **92**, o número que o time usa —,
   `login_days` dá último acesso, dias de acesso e situação, e
   `companies_chart` dá **eventos** e sessões, uma chamada por semana. Evento é
   o que o Tino registra: login, troca de aba, filtro, abertura de produto,
   busca, export (23,8k eventos no ano). O casamento com o cadastro é por nome
   (a API só devolve o slug): **90 das 92** casaram; Lete Moda e Praia e Santho
   Pano ficam na tabela com "sem marca no cadastro".

9d. **Duas marcas entram no painel fora da regra de módulos (18/08).**
   A carteira é "domínio com módulo de vendas", filtro que impede o painel de
   encher de conta de lojista comprador. **Lete Moda Praia** (Summer House, CS
   Jennyfer) e **Santho Pano** (Donna Sami, CS Luana) estão no cadastro como
   *só compras*, mas têm CS, canal, pedidos e usam o Tino — foi por isso que a
   aba do Tino as mostrou como "sem marca no cadastro". Entram pela lista
   `DOMINIOS_EXTRA` no `fetch_dados.js`; se aparecer outra assim, é só
   acrescentar o domínio lá.

9e. **"Nunca acessaram" tem três números possíveis — o painel usa o do Tino.**
   No admin do Tino o card diz **12** e a tabela logo abaixo diz **16**; a
   primeira versão desta aba dizia **19**. Os três medem coisas diferentes:
   **12** = marcas sem nenhuma atividade registrada (é `total_brands` menos
   `company_list`, a régua do card); **16** = marcas com `login_days = 0`;
   **19** era 16 + 3 marcas que não têm linha em `login_days` — essas três
   (andressa_vesti, per_pochi, refugio_modas) TÊM atividade, então contá-las como
   "nunca acessou" estava errado. A diferença de 12 para 16 são quatro marcas
   (delia_modas, miss_manu, daline, stefani) que entram pelo **SSO da Vesti**: o
   evento é `sso_login_vesti` e não conta em `login_days`. Elas aparecem na
   coluna Situação como "entra sem login (SSO)".

9f. **A série do Tino não pode sair de `companies_chart` (18/08).** Essa rota
   devolve no máximo **20 linhas** — é o top 20 da tela do Tino, e o corte vale
   mesmo passando a lista de empresas no corpo (25 slugs explícitos voltam 20).
   Como a série era montada com uma chamada por semana, as semanas cheias (S29 em
   diante) vinham truncadas exatamente onde a CS mais olha: 205 pares
   semana-marca contra **311** reais. Agora é uma chamada de `timeline`
   (granularity=week) e uma de `metrics` por marca, 4 em paralelo.

10. **Teto de R$ 50.000 por pedido**, o mesmo filtro do CS-Sucesso e do PainelElisa,
   para os números baterem entre os painéis.

11. **Reuniões no lugar de Tarefas (18/08).** A aba de Tarefas saiu e entrou
    **Reuniões**, com a mesma leitura do painel
    [PlanilhasEPainelCS](https://vesti-mobi.github.io/dados/PlanilhasEPainelCS/):
    reunião realizada de um lado, negócio fechado do outro. A fonte é o objeto
    `meetings` do HubSpot (289 no ano, do time em `CS_TIME`), e o cliente vem da
    empresa associada à reunião. O **negócio ganho é creditado à última reunião
    daquela empresa antes do fechamento** — sem isso, uma empresa com cinco
    reuniões e um negócio viraria cinco negócios. Negócio ganho de qualquer
    pipeline conta (o time fecha filial, upgrade e VestiPago em pipelines
    diferentes); dos 370 ganhos em 2026, 59 caíram em alguma reunião — o resto
    fechou sem reunião registrada. Reunião com data futura aparece como
    **Agendada** quando a semana atual está na seleção.

12. **Canal = parceiro dono da conta.** `odbc_domains.partner_id` →
    `odbc_partners.name`: Vesti, Attasoft, Uemtel, Trial, Starter, Varejo Vesti,
    Treino, Onix, Glads, ProRoi, Tizeefy, Up Agency, Ve Vantagens. Quem está sem
    parceiro ou com `"N/A"` aparece como **Sem canal**. O filtro aceita mais de um
    canal ao mesmo tempo e nenhum marcado quer dizer todos. Atenção: `odbc_partners`
    vem com cada linha **duplicada** no espelho — o join agrupa antes, senão o
    cadastro dobraria de tamanho.

13. **Tickets: o cliente vem da empresa associada, não do assunto.** O ticket é
    ligado à marca do cadastro em três tentativas — nome igual, nome sem ruído
    (`chaveMarca()` tira "Ltda", "Modas", pontuação) e, por último, CNPJ
    (propriedades `cnpj` e `hs_tax_id` da empresa no HubSpot). Numa amostra de 121
    empresas isso levou o casamento de 54% para 76%. Ticket que não casa continua
    na lista, só fica **Sem canal** — sumir com ticket por causa de cadastro seria
    pior que mostrá-lo sem canal. A busca do HubSpot só pagina até 10.000
    resultados por consulta, então a carga de tickets é quebrada **mês a mês**
    (`buscarPorMes`); sem isso o resto sumiria em silêncio, sem erro.

14. **Só 2026.** Todas as séries são semanas 1..atual do ano corrente, porque o painel
    inteiro é "semana do ano". Negócios e tarefas de anos anteriores ficam de fora
    (o pipeline Expand existe desde 2021; 101 dos 1.108 negócios têm data em 2026).

## Como o painel se comporta

- **Semanas**: dá para escolher semanas soltas, de meses diferentes. Cada semana é
  rotulada pela posição dentro do mês (1ª, 2ª...); clicar no nome do mês marca ou
  desmarca o mês inteiro; os atalhos põem as últimas 4/12/26 semanas ou o ano todo.
  O recorte vale de verdade em todas as abas — a tabela geral e as três abas de
  produto são somadas a partir das séries semanais, não de um total anual pronto.
- **Filtro de CS** existe em **todas as abas** e é de seleção múltipla (nenhum
  marcado = todo o time), com atalhos "Todos" e "Inverter". Recorta tabela *e*
  gráfico. Em Cross-sell e Upsell o responsável é o dono do negócio no HubSpot,
  caindo no CS da carteira quando o negócio não tem dono; em Tarefas e Tickets é
  o dono do registro; nas demais, o CS da carteira da marca. O mesmo responsável
  gravado com nome curto na carteira e completo no registro ("Jennyfer Rabelo" ×
  "Jennyfer Rabelo dos Santos") é juntado num único filtro por `normalizarCs()`.
- **Filtro de Canal** é de seleção múltipla (nenhum marcado = todos) e vale na
  tabela geral, nas três abas de produto, no Churn e nos Tickets. Nas abas que
  agregam por cliente, o canal é buscado no cadastro pelo nome da marca.
- Os gráficos obedecem só a cliente + CS. Filtros de linha (status do negócio,
  situação do churn) não mexem no histórico, de propósito.
- Exportar CSV exporta exatamente as linhas e colunas visíveis.
- **"Hoje" é o dia de verdade do navegador.** Era uma data fixa (13/08/2026) de
  quando o painel foi escrito; com a carga diária, tudo que é relativo ("há X
  dias", tarefa atrasada, tempo de casa) tem que andar com o calendário.
