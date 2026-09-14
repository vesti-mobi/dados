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
 * RETENÇÃO CURTA NA ORIGEM: medido em 14/09/2026, a produção só tinha 6 dias
 * de log (15/08 a 21/08/2026, 250.547 linhas) -- não é histórico completo, é
 * uma janela que roda. Rodando todo dia, este espelho vira o ÚNICO histórico
 * que sobrevive; se o workflow ficar mais dias que a retenção da origem sem
 * rodar, aquele intervalo se perde de vez (não tem como recuperar depois).
 *
 * NÃO FILTRA por domain_id / carteira ativa -- ao contrário do
 * sincronizar_cs.js, que só olha quem tem "vendas" nos módulos. Ingere TODO
 * mundo que aparecer em stock_logs (loja de teste incluída). Se algum painel
 * for consumir isso e precisar só da carteira ativa, filtrar na hora da
 * leitura (JOIN com odbc_domains) em vez de aqui -- assim quem quiser os
 * dados crus ainda consegue.
 *
 * Estratégia de carga (incremental, sem duplicar):
 *   1. Garante a tabela (CREATE TABLE IF NOT EXISTS, particionada por
 *      DATE(created_at) -- ela só cresce, particionar mantém custo baixo).
 *   2. Descobre o corte: MAX(created_at) já no BigQuery, menos um colchão de
 *      24h (linha que chegou atrasada / relógio dessincronizado). Espelho
 *      vazio = primeira carga: pergunta ao Metabase o MIN/MAX real da origem
 *      em vez de chutar uma data.
 *   3. Busca no Metabase em janelas de 1 DIA (não um SELECT só): a pergunta
 *      #439 é rotulada "USAR COM SABEDORIA" e eu não sei se o Metabase tem um
 *      teto de linhas por resposta aqui -- ir por dia deixa cada request
 *      pequeno e não arrisca truncar sem avisar.
 *   4. Por dia, pergunta ao BigQuery quais `id` daquele intervalo já existem
 *      e insere só o que falta (streaming insert, em lotes).
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

// colchão de re-varredura: linha que chegou atrasada na origem (relogio,
// commit assincrono) ainda entra, e o dedupe por id evita duplicar.
const BUFFER_HORAS = 24;
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

function diaISO(d) { return d.toISOString().slice(0, 10); }
function addDias(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

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
    OPTIONS (description = "Espelho de public.stock_logs (Postgres de producao da Vesti), via Metabase. RETENCAO CURTA NA ORIGEM (~6 dias medidos em 14/09/2026) -- este e' o unico historico que sobrevive. Ingestao incremental diaria: CS/ingerir_stock_logs.js.")
  `);
}

async function buscaCorte() {
  const [rows] = await bq.query(
    `SELECT MAX(created_at) corte FROM ${TABELA_FQN}`
  ).catch(() => [[{ corte: null }]]);
  return rows[0] && rows[0].corte ? new Date(rows[0].corte.value || rows[0].corte) : null;
}

async function idsExistentes(inicioISO, fimISO) {
  const [rows] = await bq.query({
    query: `SELECT id FROM ${TABELA_FQN} WHERE created_at >= @ini AND created_at < @fim`,
    params: { ini: inicioISO, fim: fimISO },
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

  let inicio = await buscaCorte();
  if (inicio) {
    inicio = new Date(inicio.getTime() - BUFFER_HORAS * 3600 * 1000);
    console.log('  corte (MAX(created_at) no BigQuery, menos ' + BUFFER_HORAS + 'h de colchão): ' + inicio.toISOString());
  } else {
    console.log('  tabela nova/vazia — perguntando o intervalo real ao Metabase');
    const [{ mn, mx } = {}] = await mbQuery(dbId, 'SELECT MIN(created_at) mn, MAX(created_at) mx FROM stock_logs');
    if (!mn) { console.log('  stock_logs não devolveu nenhuma linha na origem — nada a fazer'); return; }
    inicio = new Date(mn);
    console.log('  primeira carga: origem vai de ' + mn + ' até ' + mx);
  }

  const hoje = new Date();
  let totalBuscado = 0, totalNovo = 0, totalJaExistia = 0;

  for (let dia = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate()));
       dia <= hoje;
       dia = addDias(dia, 1)) {
    const fimDia = addDias(dia, 1);
    const iniISO = dia.toISOString(), fimISO = fimDia.toISOString();

    const linhas = await mbQuery(dbId,
      `SELECT ${COLUNAS.join(', ')} FROM stock_logs
       WHERE created_at >= '${iniISO}' AND created_at < '${fimISO}'
       ORDER BY created_at ASC`);
    totalBuscado += linhas.length;
    if (!linhas.length) continue;
    if (linhas.length > 100000) {
      console.log('  ⚠ ' + diaISO(dia) + ': ' + linhas.length + ' linhas num dia só — desconfiar de teto de resposta do Metabase truncando sem avisar');
    }

    const existentes = await idsExistentes(iniISO, fimISO);
    const novas = linhas.filter(l => !existentes.has(l.id));
    totalJaExistia += linhas.length - novas.length;
    if (!novas.length) { console.log('  ' + diaISO(dia) + ': ' + linhas.length + ' na origem, tudo já espelhado'); continue; }

    const agora = new Date().toISOString();
    const linhasBQ = novas.map(l => ({ ...l, ingerido_em: agora }));
    for (let i = 0; i < linhasBQ.length; i += LOTE_INSERT) {
      await bq.dataset(DATASET).table(TABELA).insert(linhasBQ.slice(i, i + LOTE_INSERT), { raw: false });
    }
    totalNovo += novas.length;
    console.log('  ' + diaISO(dia) + ': ' + linhas.length + ' na origem, ' + novas.length + ' novas inseridas');
  }

  console.log('  total: ' + totalBuscado + ' na origem (janela varrida), ' + totalNovo + ' inseridas, ' + totalJaExistia + ' já existiam');
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
