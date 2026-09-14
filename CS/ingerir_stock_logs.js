/**
 * ingerir_stock_logs.js — espelha `public.stock_logs` (Postgres de produção
 * da Vesti) para `vestilake_BI.postgres_stock_logs` no BigQuery, via Metabase.
 *
 * Por quê (pedido da Laura, 14/09/2026, a partir da pergunta salva #439 "Log
 * de movimentação de estoque do produto"): aquela pergunta exige domainId +
 * companyId + productId pra rodar, então não dá pra usar como fonte de um
 * espelho completo. Este script faz a MESMA leitura da tabela, sem os filtros,
 * direto por SQL nativo no Metabase (mesmo mecanismo do sincronizar_cs.js).
 *
 * ORIGEM PARADA (descoberto em 14/09/2026): os dados existentes vao de
 * 15/08 a 21/08/2026 (6 dias, 250.547 linhas) e NENHUMA linha nova foi escrita
 * depois disso -- confirmado com `now()` do proprio banco (bate com a data
 * real de hoje, entao nao e' sessao/cache velho: a tabela mesmo ficou 24 dias
 * sem receber gravacao). Nao sei dizer se e' uma limpeza que tambem varreu
 * tudo antes de 15/08, ou so' a janela em que o que grava esse log esteve
 * ativo -- so' da' pra afirmar que, HOJE, nao chega linha nova. Por isso a
 * janela de busca (ver JANELA_DIAS) e' ancorada no MAX(created_at) da PROPRIA
 * ORIGEM, nunca em Date.now(): se fosse "ultimos N dias a partir de agora",
 * o script nunca mais acharia nada enquanto a tabela ficar parada. Se um dia
 * ela voltar a receber gravacao, a ancoragem no MAX da origem segue sozinha.
 * Enquanto ninguem mexer nisso, este espelho E' o unico registro completo
 * que existe desses 6 dias.
 *
 * TETO DE LINHAS DA API DO METABASE (descoberto na 1a carga em produção,
 * 14/09/2026): `/api/dataset` devolve NO MÁXIMO 2000 linhas por resposta,
 * sem avisar que truncou -- a 1a versão deste script pedia o dia inteiro numa
 * query só e recebeu sempre exatos 2000, mesmo em dias com 50k+ linhas reais
 * (medido ao vivo: 15/08=22.825, 16/08=21.377, 17/08=52.592, 18/08=51.299,
 * 19/08=51.791, 20/08=45.478, 21/08=5.185 -- total 250.547). Resultado: só
 * 14.000 linhas (5,6%) foram ingeridas naquela carga. Confirmado que o teto é
 * so' na RESPOSTA, nao na query: `LIMIT 2000 OFFSET 2000` devolve a proxima
 * pagina cheia. A partir desta versao, TODA leitura pagina em blocos de
 * PAGINA_METABASE ate' vir uma pagina incompleta.
 *
 * NÃO FILTRA por domain_id / carteira ativa -- ao contrário do
 * sincronizar_cs.js, que só olha quem tem "vendas" nos módulos. Ingere TODO
 * mundo que aparecer em stock_logs (loja de teste incluída). Se algum painel
 * for consumir isso e precisar só da carteira ativa, filtrar na hora da
 * leitura (JOIN com odbc_domains) em vez de aqui -- assim quem quiser os
 * dados crus ainda consegue.
 *
 * Estratégia de carga (idempotente, sem staging table):
 *   1. Garante a tabela (CREATE TABLE IF NOT EXISTS, particionada por
 *      DATE(created_at) -- ela só cresce, particionar mantém custo baixo).
 *   2. SEMPRE revarre uma JANELA FIXA de dias corridos (JANELA_DIAS) ANCORADA
 *      no MAX(created_at) da PROPRIA ORIGEM (Metabase), nunca em Date.now() --
 *      ver "ORIGEM PARADA" acima. Não tenta ser esperto calculando "desde a
 *      última carga" pelo MAX(...) do NOSSO ESPELHO no BigQuery:
 *      depois do teto de linhas ter mascarado uma carga incompleta sem erro
 *      nenhum, confiar no próprio histórico do espelho é arriscado. Revarrer
 *      é barato (dedupe por id) e AUTO-CURA qualquer buraco deixado por uma
 *      carga anterior incompleta, sem precisar saber que ela foi incompleta.
 *   3. Busca no Metabase PAGINADO (LIMIT/OFFSET, ORDER BY created_at, id --
 *      o `id` como desempate torna a paginação determinística mesmo com
 *      created_at repetido) até uma página vir com menos que PAGINA_METABASE
 *      linhas.
 *   4. Pergunta ao BigQuery, numa query só, quais `id` da janela inteira já
 *      existem, e insere (streaming, em lotes) só o que falta.
 *
 * Falha em qualquer etapa: avisa e sai sem travar a carga do painel (mesmo
 * comportamento do sincronizar_cs.js e do Tino/HubSpot em fetch_dados.js).
 *
 * Rodar:  node ingerir_stock_logs.js
 */

const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SA_KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || 'C:/Users/Laura/Downloads/vesti-data-499015-7ea468dae45e.json';
process.env.GOOGLE_APPLICATION_CREDENTIALS = SA_KEY;

const { BigQuery } = require(path.join(RAIZ, 'node_modules/@google-cloud/bigquery'));
const bq = new BigQuery({ projectId: 'vesti-data-499015' });
const PROJETO = 'vesti-data-499015';
const DATASET = 'vestilake_BI';
const TABELA = 'postgres_stock_logs';
const TABELA_FQN = `\`${PROJETO}.${DATASET}.${TABELA}\``;

const METABASE_URL = (process.env.METABASE_URL || '').replace(/\/+$/, '');
const METABASE_API_KEY = process.env.METABASE_API_KEY;

// Folga sobre os 6 dias de dados observados na origem (14/09/2026) -- cobre
// fim de semana / execucao que falhou sem deixar buraco permanente. Ancorada
// no MAX(created_at) da ORIGEM (nao em Date.now(), ver "ORIGEM PARADA" no topo
// do arquivo), entao continua fazendo sentido se a escrita ficar parada ou
// se um dia voltar.
const JANELA_DIAS = 10;
// Teto real medido da API do Metabase (/api/dataset), 14/09/2026. Paginar
// LIMIT/OFFSET nesse tamanho ate' vir pagina incompleta.
const PAGINA_METABASE = 2000;
// trava de sanidade: nunca deveria passar disso (JANELA_DIAS * pico diario
// observado de ~53k ainda caberia em ~270 paginas). Se estourar, algo esta
// errado (paginacao nao terminando) -- para e avisa em vez de rodar pra sempre.
const MAX_PAGINAS = 2000;

const LOTE_INSERT = 2000; // margem confortavel sob o limite de streaming da API

const COLUNAS = ['id', 'domain_id', 'company_id', 'stock_id', 'product_id', 'user_id',
  'order_id', 'action', 'origin', 'ip', 'sku', 'old_qty', 'new_qty',
  'old_balance', 'new_balance', 'created_at', 'updated_at'];

async function mbGet(caminho) {
  const r = await fetch(METABASE_URL + caminho, { headers: { 'x-api-key': METABASE_API_KEY } });
  const j = await r.json();
  if (!r.ok) throw new Error('Metabase GET ' + caminho + ': ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return j;
}
async function mbPost(caminho, corpo) {
  const r = await fetch(METABASE_URL + caminho, {
    method: 'POST',
    headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('Metabase POST ' + caminho + ': ' + (j.error || r.status) + ' ' + JSON.stringify(j).slice(0, 300));
  return j;
}
async function buscarDatabaseId() {
  const j = await mbGet('/api/database');
  const lista = j.data || j;
  const db = lista.find(d => /^vesti$/i.test(d.name) && d.engine === 'postgres');
  if (!db) throw new Error('banco "Vesti" (postgres) não encontrado no Metabase — nome ou engine mudou?');
  return db.id;
}
async function mbQuery(dbId, sql) {
  const resp = await mbPost('/api/dataset', { database: dbId, type: 'native', native: { query: sql } });
  const cols = resp.data.cols.map(c => c.name);
  return resp.data.rows.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

// Busca TODAS as linhas de stock_logs desde `desdeISO`, paginando em blocos de
// PAGINA_METABASE (ver comentario no topo -- a API trunca sem avisar acima
// disso). ORDER BY created_at, id: o id garante ordem estavel mesmo quando
// varias linhas tem o mesmo created_at, senao OFFSET poderia repetir ou pular
// linha entre paginas.
async function buscaTudoPaginado(dbId, desdeISO) {
  const todas = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const offset = pagina * PAGINA_METABASE;
    const bloco = await mbQuery(dbId,
      `SELECT ${COLUNAS.join(', ')} FROM stock_logs
       WHERE created_at >= '${desdeISO}'
       ORDER BY created_at ASC, id ASC
       LIMIT ${PAGINA_METABASE} OFFSET ${offset}`);
    todas.push(...bloco);
    if (bloco.length < PAGINA_METABASE) return todas; // ultima pagina
  }
  console.log('  ⚠ atingiu o limite de ' + MAX_PAGINAS + ' páginas sem terminar — parando por segurança, pode ter ficado linha de fora');
  return todas;
}

async function garanteTabela() {
  await bq.query(`
    CREATE TABLE IF NOT EXISTS ${TABELA_FQN} (
      id STRING, domain_id INT64, company_id STRING, stock_id STRING,
      product_id STRING, user_id STRING, order_id STRING, action STRING,
      origin STRING, ip STRING, sku STRING,
      old_qty INT64, new_qty INT64, old_balance INT64, new_balance INT64,
      created_at TIMESTAMP, updated_at TIMESTAMP, ingerido_em TIMESTAMP
    )
    PARTITION BY DATE(created_at)
    OPTIONS (description = "Espelho de public.stock_logs (Postgres de producao da Vesti), via Metabase. Origem tinha so' 15/08-21/08/2026 (250.547 linhas) e parou de escrever depois disso, confirmado em 14/09/2026 -- ver CS/ingerir_stock_logs.js. Ingestao incremental diaria, janela ancorada no MAX(created_at) da origem (nao confia no MAX proprio nem em Date.now()).")
  `);
}

async function idsExistentes(desdeISO) {
  const [rows] = await bq.query({
    query: `SELECT id FROM ${TABELA_FQN} WHERE created_at >= @desde`,
    params: { desde: desdeISO },
  });
  return new Set(rows.map(r => r.id));
}

async function main() {
  if (!METABASE_URL || !METABASE_API_KEY) {
    console.log('[stock_logs] sem METABASE_URL/METABASE_API_KEY — pulando ingestão');
    return;
  }
  console.log('\n[stock_logs] espelhando public.stock_logs (Postgres) -> ' + TABELA);

  await garanteTabela();
  const dbId = await buscarDatabaseId();

  // Ancorado no MAX(created_at) da PROPRIA ORIGEM, nao em Date.now(): descoberto
  // ao rodar em producao (14/09/2026) que stock_logs esta parada ha 24 dias
  // (ultima linha 21/08/2026, 09:40 -- confirmado com now() do proprio banco,
  // que bate com a data real de hoje, entao nao e' cache/sessao velha). Se a
  // janela fosse "ultimos N dias a partir de agora", nunca mais acharia nada
  // enquanto a tabela ficar parada. Ancorando no MAX da origem, a janela segue
  // sozinha pra onde os dados realmente estao -- parada ou nao.
  const [{ mx } = {}] = await mbQuery(dbId, 'SELECT MAX(created_at) mx FROM stock_logs');
  if (!mx) { console.log('  stock_logs não devolveu nenhuma linha na origem — nada a fazer'); return; }
  const desdeISO = new Date(new Date(mx).getTime() - JANELA_DIAS * 24 * 3600 * 1000).toISOString();
  console.log('  mais recente na origem: ' + mx + ' — revarrendo ' + JANELA_DIAS + ' dias antes disso, desde ' + desdeISO);

  const [linhas, existentes] = await Promise.all([
    buscaTudoPaginado(dbId, desdeISO),
    idsExistentes(desdeISO),
  ]);
  console.log('  ' + linhas.length + ' linhas na origem dentro da janela');

  const novas = linhas.filter(l => !existentes.has(l.id));
  console.log('  ' + existentes.size + ' já espelhadas, ' + novas.length + ' novas');

  if (!novas.length) { console.log('  nada para inserir'); return; }

  const agora = new Date().toISOString();
  const linhasBQ = novas.map(l => ({ ...l, ingerido_em: agora }));
  for (let i = 0; i < linhasBQ.length; i += LOTE_INSERT) {
    await bq.dataset(DATASET).table(TABELA).insert(linhasBQ.slice(i, i + LOTE_INSERT), { raw: false });
  }
  console.log('  ' + novas.length + ' linhas inseridas');
}

if (require.main === module) {
  main().catch(e => {
    const detalhe = e.name === 'PartialFailureError'
      ? JSON.stringify((e.errors || []).slice(0, 3))
      : e.message;
    console.log('[stock_logs] falhou, seguindo sem ingerir: ' + String(detalhe).slice(0, 500));
  });
}

module.exports = { main };
