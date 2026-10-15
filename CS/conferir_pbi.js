/**
 * conferir_pbi.js — reproduz a medida "GMV Total" do relatório do Power BI.
 *
 * A fórmula que o Eduardo usa (confirmada pela Laura em 15/10/2026):
 *
 *   Valor Total v1 = CALCULATE(SUM([Valor Total]), FILTER(.., [Status] = 1))
 *   Valor Total v2 = CALCULATE(SUM([Valor Total]), FILTER(.., [docs.payment.isPaid] <> BLANK()))
 *   GMV Total      = v1 + v2
 *
 * Somar dois CALCULATE sobre a mesma coluna conta DUAS VEZES o pedido que
 * passa nos dois filtros e deixa de fora o que não passa em nenhum. Este
 * script mede isso: para cada candidato a coluna "Status", calcula v1, v2, a
 * soma (a medida dele), a união (o que a medida queria ser) e a interseção
 * duplicada. Quem bater com o número do relatório é a coluna certa.
 *
 * Roda no workflow "Conferir BigQuery" com MODO=pbi.
 */
const path = require('path');
const { BigQuery } = require(path.join(__dirname, '..', 'node_modules', '@google-cloud/bigquery'));

const PROJETO = 'vesti-data-499015';
const DS = '`vesti-data-499015.vestilake_BI`';
const MES = (process.env.MES || '2026-09').slice(0, 7);
const ini = MES + '-01';
const fim = new Date(Date.UTC(+MES.slice(0, 4), +MES.slice(5, 7), 0)).toISOString().slice(0, 10);
const mi = v => 'R$ ' + (Number(v || 0) / 1e6).toFixed(2).replace('.', ',') + ' mi';

(async () => {
  const bq = new BigQuery({ projectId: PROJETO });
  console.log('Medida "GMV Total" do Power BI, reproduzida — ' + MES + ' (' + ini + ' a ' + fim + ')\n');

  /* Candidatos a "Status = 1". A tabela do relatório é um merge, então a
     coluna pode ter sido renomeada ou derivada; aqui vão os campos do lake
     que viram 1/0 e fazem sentido como "pedido vale". */
  const CANDIDATOS = [
    ["status_canceled_isCanceled = 'False'", "não cancelado"],
    ["status_removed_isRemoved = 'False'", "não removido"],
    ["status_consolidatedOrderStatus = 'SEPARATED'", "separado"],
    ["payment_consolidatedPaymentStatus = 'PAID'", "pago (consolidado)"],
    ["payment_isPaid = 'True'", "isPaid verdadeiro"],
    ["SAFE_CAST(payment_invoiceVersion AS INT64) = 1", "invoiceVersion = 1"],
  ];

  for (const [cond, rotulo] of CANDIDATOS) {
    try {
      const [[r]] = await bq.query({ query: `
        WITH p AS (
          SELECT SAFE_CAST(summary_total AS FLOAT64) v,
                 (${cond}) AS st,
                 (payment_isPaid IS NOT NULL AND payment_isPaid != '') AS pg
          FROM ${DS}.MongoDB_Pedidos_Geral
          WHERE settings_createdAt IS NOT NULL
            AND SAFE_CAST(summary_total AS FLOAT64) > 0
            AND DATE(CAST(settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'
        )
        SELECT ROUND(SUM(IF(st, v, 0)),2) v1,
               ROUND(SUM(IF(pg, v, 0)),2) v2,
               ROUND(SUM(IF(st, v, 0)) + SUM(IF(pg, v, 0)),2) soma,
               ROUND(SUM(IF(st OR pg, v, 0)),2) uniao,
               ROUND(SUM(IF(st AND pg, v, 0)),2) intersecao,
               ROUND(SUM(v),2) tudo
        FROM p` });
      console.log('  Status = ' + rotulo);
      console.log('    v1 ' + mi(r.v1).padStart(14) + ' · v2 ' + mi(r.v2).padStart(14)
        + ' · SOMA (a medida) ' + mi(r.soma).padStart(14));
      console.log('    união ' + mi(r.uniao).padStart(11) + ' · contado em dobro ' + mi(r.intersecao).padStart(12)
        + ' · tudo ' + mi(r.tudo).padStart(14) + '\n');
    } catch (e) {
      console.log('  Status = ' + rotulo + ': ' + String(e.message).slice(0, 80) + '\n');
    }
  }
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
