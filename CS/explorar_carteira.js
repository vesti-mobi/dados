/**
 * explorar_carteira.js — existe histórico de CS por marca no lake?
 *
 * Pergunta da Laura em 02/10/2026: ela quer o GMV e o TPV de 2025 com a
 * carteira REAL da época, não a de hoje aplicada para trás. `odbc_domains` só
 * guarda o estado atual do `angel_id`, então a pergunta é se alguma outra
 * tabela registrou a troca — um histórico, um log, um retrato mensal.
 *
 * Este script só OLHA: lista as tabelas do dataset que têm coluna de anjo/CS,
 * as que têm cara de histórico pelo nome, e o tamanho de cada uma. Não lê
 * conteúdo de ninguém e não escreve nada.
 *
 * Roda no workflow "Conferir BigQuery" quando MODO=explorar.
 */

const path = require('path');
const { BigQuery } = require(path.join(__dirname, '..', 'node_modules', '@google-cloud/bigquery'));

const PROJETO = 'vesti-data-499015';
const DS = '`vesti-data-499015.vestilake_BI`';

(async () => {
  const bq = new BigQuery({ projectId: PROJETO });

  console.log('TABELAS COM COLUNA DE ANJO / CS');
  const [cols] = await bq.query({ query: `
    SELECT table_name, column_name, data_type
    FROM ${DS}.INFORMATION_SCHEMA.COLUMNS
    WHERE LOWER(column_name) LIKE '%angel%'
       OR LOWER(column_name) LIKE '%anjo%'
       OR LOWER(column_name) IN ('cs','cs_name','customer_success','responsavel')
    ORDER BY table_name, column_name` });
  cols.forEach(r => console.log('  ' + r.table_name.padEnd(42) + r.column_name + ' (' + r.data_type + ')'));
  if (!cols.length) console.log('  (nenhuma)');

  console.log('\nTABELAS COM CARA DE HISTÓRICO / RETRATO');
  const [hist] = await bq.query({ query: `
    SELECT table_name, row_count, ROUND(size_bytes/1048576,1) mb,
           FORMAT_TIMESTAMP('%Y-%m-%d', TIMESTAMP_MILLIS(creation_time)) criada
    FROM ${DS}.__TABLES__
    WHERE LOWER(table_id) LIKE '%hist%' OR LOWER(table_id) LIKE '%log%'
       OR LOWER(table_id) LIKE '%snap%' OR LOWER(table_id) LIKE '%audit%'
       OR LOWER(table_id) LIKE '%carteira%'` }).catch(async () => {
    const [t] = await bq.query({ query: `
      SELECT table_id table_name, row_count, ROUND(size_bytes/1048576,1) mb,
             FORMAT_TIMESTAMP('%Y-%m-%d', TIMESTAMP_MILLIS(creation_time)) criada
      FROM \`vesti-data-499015.vestilake_BI.__TABLES__\`
      WHERE LOWER(table_id) LIKE '%hist%' OR LOWER(table_id) LIKE '%log%'
         OR LOWER(table_id) LIKE '%snap%' OR LOWER(table_id) LIKE '%audit%'
         OR LOWER(table_id) LIKE '%carteira%'` });
    return [t];
  });
  hist.forEach(r => console.log('  ' + String(r.table_name).padEnd(42)
    + String(r.row_count).padStart(12) + ' linhas · ' + r.mb + ' MB · criada ' + r.criada));
  if (!hist.length) console.log('  (nenhuma)');

  console.log('\nTODAS AS TABELAS DO DATASET');
  const [todas] = await bq.query({ query: `
    SELECT table_id table_name, row_count,
           FORMAT_TIMESTAMP('%Y-%m-%d', TIMESTAMP_MILLIS(creation_time)) criada
    FROM \`vesti-data-499015.vestilake_BI.__TABLES__\`
    ORDER BY table_id` });
  todas.forEach(r => console.log('  ' + String(r.table_name).padEnd(44)
    + String(r.row_count).padStart(12) + ' linhas · criada ' + r.criada));
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
