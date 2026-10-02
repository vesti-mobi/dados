/**
 * conferir_bigquery.js — o painel bate com o BigQuery?
 *
 * Pergunta da Laura em 02/10/2026, depois de pedir GMV e TPV por CS de
 * out/nov/dez de 2025: "confere direto no bigquery pra ver se está correto".
 *
 * Este script NÃO lê o fetch_dados.js: ele reescreve a régua em SQL, do zero,
 * e compara o resultado com o que está publicado no CS/dados.js. Se os dois
 * caminhos independentes dão o mesmo número, o número está certo; se não dão,
 * a diferença aparece aqui, mês a mês.
 *
 * Não escreve nada. Roda no workflow "Conferir BigQuery" (workflow_dispatch) ou
 * na mão, com GOOGLE_APPLICATION_CREDENTIALS apontando para a service account.
 *
 * Parâmetros (todos opcionais, por variável de ambiente):
 *   MESES  '2025-10,2025-11,2025-12'            meses a conferir
 *   CS     'Gabriella Busto,Thamiris Ribeiro'   quais carteiras
 *
 * O log do repositório é público. Por isso o padrão é imprimir o VEREDITO, não
 * os valores: "=" quando bate, e a diferença só quando não bate — que é a única
 * hora em que o número ajuda a diagnosticar. VERBOSE=1 mostra tudo.
 */

const fs = require('fs');
const path = require('path');
const { BigQuery } = require(path.join(__dirname, '..', 'node_modules', '@google-cloud/bigquery'));

const DS = '`vesti-data-499015.vestilake_BI`';
const PROJETO = 'vesti-data-499015';
const VERBOSE = process.env.VERBOSE === '1';

const MESES = (process.env.MESES || '2025-10,2025-11,2025-12').split(',').map(s => s.trim());
const CS_ALVO = (process.env.CS || 'Gabriella Busto,Thamiris Ribeiro,Luana Coutinho')
  .split(',').map(s => s.trim());

/* Os mesmos filtros do fetch_dados.js, escritos de novo de propósito: copiar o
   código de lá faria os dois errarem junto. */
const TETO_PEDIDO = 50000;
const ANJOS_FORA = ['Shirley Silva', 'Priscila Argolo'];
const DOMINIOS_EXTRA = ['1593235', '1833676'];

const ini = MESES.slice().sort()[0] + '-01';
const ultimo = MESES.slice().sort().reverse()[0];
const fimDate = new Date(Date.UTC(Number(ultimo.slice(0, 4)), Number(ultimo.slice(5, 7)), 0));
const fim = fimDate.toISOString().slice(0, 10);

const SQL = `
WITH dom AS (
  SELECT CAST(ID AS STRING) id,
         ANY_VALUE(CAST(angel_id AS STRING)) angel_id
  FROM ${DS}.odbc_domains
  WHERE (LOWER(IFNULL(modulos,'')) LIKE '%vendas%'
         OR CAST(ID AS STRING) IN (${DOMINIOS_EXTRA.map(x => `'${x}'`).join(',')}))
    AND LOWER(IFNULL(name,'')) NOT LIKE '%teste%'
    AND LOWER(IFNULL(name,'')) NOT LIKE '%andressa vesti%'
  GROUP BY id
),
carteira AS (
  SELECT d.id dom,
         CASE WHEN a.name IS NULL OR a.name = 'N/A'
                   OR a.name IN (${ANJOS_FORA.map(x => `'${x}'`).join(',')}) THEN 'Sem CS'
              ELSE a.name END cs
  FROM dom d
  LEFT JOIN ${DS}.odbc_angels a ON CAST(a.id AS STRING) = d.angel_id
),
ped AS (
  SELECT CAST(domainId AS STRING) dom,
         FORMAT_DATE('%Y-%m', DATE(CAST(settings_createdAt AS TIMESTAMP))) mes,
         IF(payment_isPaid='True', CAST(summary_total AS FLOAT64), 0) gmv,
         IF(payment_isPaid='True' AND payment_transaction_provider IS NOT NULL,
            CAST(summary_total AS FLOAT64), 0) tpv
  FROM ${DS}.MongoDB_Pedidos_Geral
  WHERE settings_createdAt IS NOT NULL AND SAFE_CAST(domainId AS INT64) IS NOT NULL
    AND SAFE_CAST(summary_total AS FLOAT64) > 0
    AND SAFE_CAST(summary_total AS FLOAT64) < ${TETO_PEDIDO}
    AND DATE(CAST(settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'
)
SELECT c.cs, p.mes, ROUND(SUM(p.gmv),2) gmv, ROUND(SUM(p.tpv),2) tpv
FROM ped p JOIN carteira c ON c.dom = p.dom
GROUP BY 1,2
ORDER BY 1,2`;

/* O dados.js é um script de navegador: carrega numa gaiola com `window`. */
function lerPainel() {
  const arq = path.join(__dirname, 'dados.js');
  if (!fs.existsSync(arq)) { console.error('CS/dados.js não existe aqui.'); process.exit(1); }
  global.window = {};
  require(arq);
  const desempacotar = o => {
    if (Array.isArray(o)) return o;
    if (!o || typeof o !== 'object') return o;
    if (o._p === 1 && Array.isArray(o.c) && Array.isArray(o.r)) {
      const cols = o.c, dic = o.dic || {};
      return o.r.map(l => { const x = {};
        for (let i = 0; i < cols.length; i++) { const k = cols[i]; let v = l[i];
          if (dic[k] && typeof v === 'number') v = dic[k][v]; x[k] = v; }
        return x; });
    }
    for (const k in o) o[k] = desempacotar(o[k]);
    return o;
  };
  const d = desempacotar(global.window.PAINEL_DATA);
  /* A gaiola tem que ser desfeita: a biblioteca do BigQuery decide se está num
     navegador olhando `typeof window`, e com a global de pé ela tenta usar o
     fetch do browser — "fetchImpl is not a function" na primeira consulta. */
  delete global.window;
  return d;
}

const money = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

(async () => {
  console.log('Conferência painel × BigQuery');
  console.log('meses: ' + MESES.join(', ') + ' · carteiras: ' + CS_ALVO.join(', '));

  const data = lerPainel();
  console.log('dados.js gerado em ' + ((data.meta || {}).geradoEm || '?'));

  const bq = new BigQuery({ projectId: PROJETO });
  const [linhas] = await bq.query({ query: SQL });
  console.log('linhas do BigQuery: ' + linhas.length + '\n');

  const doBq = {};
  linhas.forEach(r => { doBq[r.cs + '|' + r.mes] = { gmv: Number(r.gmv) || 0, tpv: Number(r.tpv) || 0 }; });

  const doPainel = (cs, mes, k) => {
    const x = (data.bonificacao.linhas || []).find(l => l.cs === cs && l.mes === mes && l.k === k);
    return x ? Number(x.valor) || 0 : 0;
  };

  let divergentes = 0;
  [['gmv', 'gmv', 'GMV da carteira'], ['vestipago', 'tpv', 'TPV do VestiPago']].forEach(([kPainel, kBq, titulo]) => {
    console.log(titulo);
    console.log('  CS                    mês        veredito');
    CS_ALVO.forEach(cs => {
      MESES.forEach(mes => {
        const a = doPainel(cs, mes, kPainel);
        const b = (doBq[cs + '|' + mes] || {})[kBq] || 0;
        const dif = a - b;
        const pct = b ? Math.abs(dif) / b * 100 : (a ? 100 : 0);
        const bate = pct < 0.01;
        if (!bate) divergentes++;
        const veredito = bate
          ? (VERBOSE ? '= ' + money(b) : '=')
          : 'DIFERENÇA ' + (dif > 0 ? '+' : '') + money(dif) + ' (' + pct.toFixed(2) + '%)'
            + ' · painel ' + money(a) + ' · BigQuery ' + money(b);
        console.log('  ' + cs.padEnd(22) + mes.padEnd(11) + veredito);
      });
    });
    console.log('');
  });

  console.log(divergentes === 0
    ? 'Tudo bateu: as duas contas, feitas por caminhos independentes, dão o mesmo número.'
    : divergentes + ' célula(s) divergem — ver acima.');
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
