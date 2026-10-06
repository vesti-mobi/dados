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
         payment_isPaid = 'True' pago
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

/* Nenhuma das réguas acima deu os 98 milhões que a Laura esperava, e o número
   fica entre "pago" e "criado" — cheira a "criado menos o que foi cancelado".
   Para saber, é preciso achar a coluna de status do pedido: a tabela não tem
   `settings_status`, então aqui o script procura o nome certo e quebra o GMV
   criado por ele. */
async function porStatus(bq) {
  const [cols] = await bq.query({ query: `
    SELECT column_name
    FROM ${DS}.INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = 'MongoDB_Pedidos_Geral'
      AND (LOWER(column_name) LIKE '%status%' OR LOWER(column_name) LIKE '%cancel%'
           OR LOWER(column_name) LIKE '%situac%' OR LOWER(column_name) LIKE '%estado%')
    ORDER BY column_name` });
  console.log('\nCOLUNAS COM CARA DE STATUS: ' + (cols.map(c => c.column_name).join(', ') || 'nenhuma'));

  /* As que interessam, não as quatro primeiras do alfabeto: cancelamento e o
     status consolidado do pedido. */
  const PRIORIDADE = ['status_canceled_isCanceled', 'status_consolidatedOrderStatus',
                      'payment_consolidatedPaymentStatus', 'status_removed_isRemoved'];
  const escolhidas = PRIORIDADE.filter(p => cols.some(c => c.column_name === p))
    .map(column_name => ({ column_name }));
  for (const { column_name: col } of escolhidas) {
    try {
      const [linhas] = await bq.query({ query: `
        WITH carteira AS (${CARTEIRA})
        SELECT IFNULL(CAST(p.\`${col}\` AS STRING), '(vazio)') valor,
               COUNT(*) qt,
               ROUND(SUM(SAFE_CAST(p.summary_total AS FLOAT64)),2) total
        FROM ${DS}.MongoDB_Pedidos_Geral p
        JOIN carteira c ON c.id = CAST(p.domainId AS STRING)
        WHERE p.settings_createdAt IS NOT NULL
          AND SAFE_CAST(p.summary_total AS FLOAT64) > 0
          AND SAFE_CAST(p.summary_total AS FLOAT64) < ${TETO}
          AND DATE(CAST(p.settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'
        GROUP BY 1 ORDER BY total DESC LIMIT 12` });
      console.log('\n  ' + col + ':');
      linhas.forEach(l => console.log('    ' + String(l.valor).slice(0, 28).padEnd(30)
        + String(l.qt).padStart(7) + ' pedidos' + mi(l.total).padStart(14)));
    } catch (e) {
      console.log('\n  ' + col + ': não deu para agrupar (' + String(e.message).slice(0, 60) + ')');
    }
  }
}

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

  await porStatus(bq);

  /* O relatório do Power BI ("GMV - Métricas 2025") soma a medida GMV Total —
     nome original "Total Valor Pedidos" — com um único filtro visível: fora o
     canal Treino. Aqui a soma é repetida sobre CADA coluna de valor do pedido,
     para achar qual delas dá o número de lá: pode não ser `summary_total`. */
  const [cols] = await bq.query({ query: `
    SELECT column_name FROM ${DS}.INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = 'MongoDB_Pedidos_Geral'
      AND (LOWER(column_name) LIKE 'summary%' OR LOWER(column_name) LIKE '%total%'
           OR LOWER(column_name) LIKE '%subtotal%')
    ORDER BY column_name` });
  console.log('\nCOLUNAS DE VALOR DO PEDIDO');
  const nomes = cols.map(c => c.column_name);
  console.log('  ' + nomes.join(', '));

  const somas = nomes.map(n => `ROUND(SUM(IF(pago, SAFE_CAST(o.\`${n}\` AS FLOAT64), 0)),2) pago_${n},
       ROUND(SUM(SAFE_CAST(o.\`${n}\` AS FLOAT64)),2) criado_${n}`).join(',\n       ');
  const [[v]] = await bq.query({ query: `
    WITH carteira AS (${CARTEIRA})
    SELECT ${somas}
    FROM (SELECT *, payment_isPaid='True' pago FROM ${DS}.MongoDB_Pedidos_Geral) o
    JOIN carteira c ON c.id = CAST(o.domainId AS STRING)
    WHERE o.settings_createdAt IS NOT NULL
      AND DATE(CAST(o.settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'` });
  console.log('\n  coluna                              pago          criado   (sem teto, carteira)');
  nomes.forEach(n => {
    const p = v['pago_' + n], c2 = v['criado_' + n];
    if (!p && !c2) return;
    console.log('  ' + n.padEnd(34) + mi(p).padStart(13) + mi(c2).padStart(15));
  });

  /* Mês a mês, as duas réguas principais: às vezes o número que não bate é o
     de outro mês, ou de outro ano. */
  const [serie] = await bq.query({ query: `
    WITH carteira AS (${CARTEIRA})
    SELECT FORMAT_DATE('%Y-%m', DATE(CAST(o.settings_createdAt AS TIMESTAMP))) mes,
           ROUND(SUM(IF(o.payment_isPaid='True', SAFE_CAST(o.summary_total AS FLOAT64), 0)),2) pago,
           ROUND(SUM(SAFE_CAST(o.summary_total AS FLOAT64)),2) criado
    FROM ${DS}.MongoDB_Pedidos_Geral o
    JOIN carteira c ON c.id = CAST(o.domainId AS STRING)
    WHERE o.settings_createdAt IS NOT NULL
      AND SAFE_CAST(o.summary_total AS FLOAT64) > 0
      AND SAFE_CAST(o.summary_total AS FLOAT64) < ${TETO}
      AND DATE(CAST(o.settings_createdAt AS TIMESTAMP)) >= DATE '2025-01-01'
    GROUP BY 1 ORDER BY 1` });
  console.log('\nMÊS A MÊS (carteira, com teto):');
  console.log('  mês        pago           criado');
  serie.forEach(l => console.log('  ' + l.mes.padEnd(10) + mi(l.pago).padStart(12) + mi(l.criado).padStart(15)));

  /* O número que a Laura espera fica ENTRE pago e criado. O palpite é "criado
     menos o que foi cancelado" — aqui ele é medido, junto com as variações
     vizinhas, para a conversa ter número em vez de teoria. */
  const [[x]] = await bq.query({ query: `
    WITH carteira AS (${CARTEIRA}),
    p AS (
      SELECT SAFE_CAST(summary_total AS FLOAT64) total,
             payment_isPaid = 'True' pago,
             IFNULL(CAST(status_canceled_isCanceled AS STRING), '') cancelado,
             IFNULL(CAST(status_removed_isRemoved AS STRING), '') removido
      FROM ${DS}.MongoDB_Pedidos_Geral o
      JOIN carteira c ON c.id = CAST(o.domainId AS STRING)
      WHERE o.settings_createdAt IS NOT NULL
        AND SAFE_CAST(o.summary_total AS FLOAT64) > 0
        AND SAFE_CAST(o.summary_total AS FLOAT64) < ${TETO}
        AND DATE(CAST(o.settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'
    )
    SELECT
      ROUND(SUM(IF(cancelado NOT IN ('true','True','1'), total, 0)),2) sem_cancelado,
      ROUND(SUM(IF(cancelado NOT IN ('true','True','1') AND removido NOT IN ('true','True','1'), total, 0)),2) sem_cancelado_nem_removido,
      ROUND(SUM(IF(cancelado IN ('true','True','1'), total, 0)),2) so_cancelado,
      COUNTIF(cancelado IN ('true','True','1')) qt_cancelado,
      ROUND(SUM(IF(pago OR cancelado NOT IN ('true','True','1'), total, 0)),2) pago_ou_vivo
    FROM p` });
  console.log('\nCRIADO, TIRANDO O QUE MORREU (carteira, com teto):');
  console.log('  criado menos cancelado:            ' + mi(x.sem_cancelado));
  console.log('  criado menos cancelado e removido: ' + mi(x.sem_cancelado_nem_removido));
  console.log('  só os cancelados:                  ' + mi(x.so_cancelado) + ' em ' + x.qt_cancelado + ' pedidos');
  console.log('  pago + ainda vivo (não cancelado): ' + mi(x.pago_ou_vivo));
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
