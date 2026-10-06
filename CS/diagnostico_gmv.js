/**
 * diagnostico_gmv.js — de onde sai cada versão do GMV.
 *
 * A Laura em 06/10/2026: "na tabela geral, somando o GMV de todos os clientes
 * de agosto dá 79 milhões, era pra dar 98 milhões". O painel conta pedido PAGO,
 * com teto de R$ 50 mil, só das marcas da carteira, pela data de criação do
 * pedido — e dá 79,4 mi. Em vez de discutir qual número é "o certo", este
 * script mede TODAS as combinações no BigQuery e mostra quanto cada uma dá.
 * O 98 vai aparecer em uma delas, e aí dá para saber qual régua é a da
 * pergunta.
 *
 * Eixos cruzados:
 *   pago × criado          (payment_isPaid = True ou qualquer pedido)
 *   com teto × sem teto    (R$ 50 mil por pedido, o filtro de outlier)
 *   carteira × base toda   (só domínio com módulo vendas ou tudo)
 *
 * Mais duas leituras que mudam o total sem mudar a régua: por data de PAGAMENTO
 * em vez de criação, e o peso do que foi cancelado.
 *
 * Só lê. MES=2026-08 por padrão.
 */

const path = require('path');
const { BigQuery } = require(path.join(__dirname, '..', 'node_modules', '@google-cloud/bigquery'));

const DS = '`vesti-data-499015.vestilake_BI`';
const PROJETO = 'vesti-data-499015';
const MES = process.env.MES || '2026-08';
const TETO = 50000;
const DOMINIOS_EXTRA = ['1593235', '1833676'];

const ini = MES + '-01';
const [ano, mes] = MES.split('-').map(Number);
const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

const CARTEIRA = `
  SELECT CAST(ID AS STRING) id
  FROM ${DS}.odbc_domains
  WHERE (LOWER(IFNULL(modulos,'')) LIKE '%vendas%'
         OR CAST(ID AS STRING) IN (${DOMINIOS_EXTRA.map(x => `'${x}'`).join(',')}))
    AND LOWER(IFNULL(name,'')) NOT LIKE '%teste%'
    AND LOWER(IFNULL(name,'')) NOT LIKE '%andressa vesti%'
  GROUP BY id`;

const SQL = `
WITH carteira AS (${CARTEIRA}),
ped AS (
  SELECT CAST(domainId AS STRING) dom,
         SAFE_CAST(summary_total AS FLOAT64) total,
         payment_isPaid = 'True' pago,
         settings_status status
  FROM ${DS}.MongoDB_Pedidos_Geral
  WHERE settings_createdAt IS NOT NULL AND SAFE_CAST(domainId AS INT64) IS NOT NULL
    AND SAFE_CAST(summary_total AS FLOAT64) > 0
    AND DATE(CAST(settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'
),
m AS (SELECT p.*, c.id IS NOT NULL na_carteira FROM ped p LEFT JOIN carteira c ON c.id = p.dom)
SELECT
  ROUND(SUM(IF(pago AND total < ${TETO} AND na_carteira, total, 0)),2) a_pago_teto_carteira,
  ROUND(SUM(IF(pago AND total < ${TETO}, total, 0)),2)                 b_pago_teto_tudo,
  ROUND(SUM(IF(pago AND na_carteira, total, 0)),2)                     c_pago_semteto_carteira,
  ROUND(SUM(IF(pago, total, 0)),2)                                     d_pago_semteto_tudo,
  ROUND(SUM(IF(total < ${TETO} AND na_carteira, total, 0)),2)          e_criado_teto_carteira,
  ROUND(SUM(IF(total < ${TETO}, total, 0)),2)                          f_criado_teto_tudo,
  ROUND(SUM(IF(na_carteira, total, 0)),2)                              g_criado_semteto_carteira,
  ROUND(SUM(total),2)                                                  h_criado_semteto_tudo,
  COUNT(*) pedidos,
  COUNTIF(pago) pedidos_pagos,
  COUNTIF(NOT pago AND na_carteira) nao_pagos_carteira,
  ROUND(SUM(IF(NOT pago AND total < ${TETO} AND na_carteira, total, 0)),2) valor_nao_pago_carteira,
  ROUND(SUM(IF(pago AND total >= ${TETO} AND na_carteira, total, 0)),2)    acima_do_teto_carteira,
  COUNTIF(pago AND total >= ${TETO} AND na_carteira)                       qt_acima_do_teto
FROM m`;

/* A mesma soma, mas pela data em que o pedido FOI PAGO. Pedido criado em julho
   e pago em agosto entra em agosto aqui, e não entra na régua do painel. */
const SQL_PAGAMENTO = `
WITH carteira AS (${CARTEIRA})
SELECT ROUND(SUM(SAFE_CAST(p.summary_total AS FLOAT64)),2) valor
FROM ${DS}.MongoDB_Pedidos_Geral p
JOIN carteira c ON c.id = CAST(p.domainId AS STRING)
WHERE p.payment_isPaid = 'True'
  AND SAFE_CAST(p.summary_total AS FLOAT64) > 0
  AND SAFE_CAST(p.summary_total AS FLOAT64) < ${TETO}
  AND p.payment_paidAt IS NOT NULL
  AND DATE(CAST(p.payment_paidAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'`;

const mi = v => 'R$ ' + (Number(v) / 1e6).toFixed(2).replace('.', ',') + ' mi';

(async () => {
  console.log('GMV de ' + MES + ' — todas as réguas\n');
  const bq = new BigQuery({ projectId: PROJETO });
  const [[r]] = await bq.query({ query: SQL });

  const linhas = [
    ['pago · com teto · carteira   (o painel)', r.a_pago_teto_carteira],
    ['pago · com teto · base toda', r.b_pago_teto_tudo],
    ['pago · sem teto · carteira', r.c_pago_semteto_carteira],
    ['pago · sem teto · base toda', r.d_pago_semteto_tudo],
    ['criado · com teto · carteira', r.e_criado_teto_carteira],
    ['criado · com teto · base toda', r.f_criado_teto_tudo],
    ['criado · sem teto · carteira', r.g_criado_semteto_carteira],
    ['criado · sem teto · base toda', r.h_criado_semteto_tudo],
  ];
  linhas.forEach(([l, v]) => console.log('  ' + l.padEnd(42) + mi(v).padStart(14)));

  try {
    const [[p]] = await bq.query({ query: SQL_PAGAMENTO });
    console.log('  ' + 'pago · com teto · carteira · POR DATA DE PAGAMENTO'.padEnd(42) + mi(p.valor).padStart(14));
  } catch (e) {
    console.log('  (por data de pagamento falhou: ' + String(e.message).slice(0, 90) + ')');
  }

  console.log('\nO QUE EXPLICA A DIFERENÇA, na carteira:');
  console.log('  pedidos no mês: ' + r.pedidos + ' · pagos: ' + r.pedidos_pagos
    + ' · não pagos (carteira): ' + r.nao_pagos_carteira);
  console.log('  valor criado e NÃO pago:      ' + mi(r.valor_nao_pago_carteira));
  console.log('  pago acima do teto de R$ 50 mil: ' + mi(r.acima_do_teto_carteira)
    + ' em ' + r.qt_acima_do_teto + ' pedidos');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
