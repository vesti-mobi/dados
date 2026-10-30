/**
 * build_data.js — gera dados.js do Painel da Tribo (MDATA-503) a partir do BigQuery.
 *
 * Fonte única: vesti-data-499015.vestilake_BI (us-central1).
 * Saída: série DIÁRIA por segmento (atacado/varejo) com os COMPONENTES de cada
 * indicador, nunca o indicador pronto. O painel soma o intervalo e só então
 * divide — taxas e médias saem dos totais do período, nunca de média de médias
 * (regra do MDATA-503).
 *
 * Mapeamento indicador → origem:
 *   segmento ............. odbc_companies.layout_webmobile    (1 atacado, 2 varejo)
 *   gmv .................. MongoDB_Pedidos_Geral.summary_total (data de criação)
 *   gmv_integracao ....... pedidos de domínio com odbc_domains.integration_owner
 *   gmv_oraculo_* ........ oraculo_Pedidos.Tipo_Venda_Oraculo (pronto da fonte)
 *   tpv_cartao / tpv_pix . MongoDB_Pedidos_Geral.payment_transaction_value
 *   receita_mdr .......... vestipago_transaction_detail.mdrVestiValue (só a Vesti)
 *   receita_antifraude ... MongoDB_Pedidos_Geral.payment_transaction_antifraudValue
 *   receita_antecipacao .. vestipago_transaction_detail.antecipationVestiFee
 *   af_analises/aprovadas  MongoDB_Pedidos_Geral.payment_analysisStatus
 *   CSAT VestiPago ....... huggy.chats_raw + huggy.csat_raw (mesmo BigQuery)
 *   CSAT Integr./Platf. .. suporte.js → planilha "OKRs e KPIs - Tribo 1"
 *   SLA .................. sla.js → HubSpot, pipeline Suporte
 *   tempo de análise ..... antifraude.js → xlsx "Metrica Antifraude 2026"
 *   chargeback perdido ... antifraude.js → planilha "Chargebacks"
 *
 * Duas réguas de data, de propósito: GMV pela criação do pedido (é venda),
 * TPV e receita pelo pagamento (são eventos financeiros).
 *
 * A régua do GMV é a mesma do relatório "GMV - Métricas 2025" (PBIX/Fabric),
 * para os números baterem: pedido fechado, não cancelado, com payment_isPaid
 * preenchido — PAGO OU NÃO — e sem os paylinks, que o relatório não tem.
 * Conferido mês a mês contra os dados do próprio relatório: bate aos centavos
 * de jan/2025 a set/2026.
 *
 * Todos os indicadores do ticket têm fonte. A aprovação do antifraude segue
 * saindo do lake, e não da planilha do time: a planilha só tem 2026, e trocar
 * custaria a comparação anual. As duas divergem (92,9% contra 85,8% na semana
 * de 19-25/out) porque contam populações diferentes — ver FONTES.md.
 *   MDR e antecipação só existem de maio/2026 em diante — é a janela da
 *   vestipago_transaction_detail, única fonte que separa a fatia da Vesti da
 *   fatia da bandeira (mdrVestiValue) e a taxa de antecipação da Vesti.
 *   Antes disso vão null, e a Receita total também: somar o que falta daria um
 *   número menor que o real e a comparação anual mentiria.
 *   Só a receita de antifraude vem do pedido e tem histórico desde 2025.
 *
 * Uso:  node build_data.js            (histórico completo, 2025-01-01 → D-1)
 *       DESDE=2026-01-01 node build_data.js
 * Auth: Application Default Credentials (gcloud auth application-default login).
 */
const path = require('path');
const fs = require('fs');
const { BigQuery } = require(path.join(__dirname, '..', 'node_modules', '@google-cloud/bigquery'));

const PROJETO = 'vesti-data-499015';
const DS = `\`${PROJETO}.vestilake_BI\``;
const DS_HUGGY = `\`${PROJETO}.huggy\``;
const LOCATION = 'us-central1';

// Régua do GMV, alinhada ao relatório "GMV - Métricas 2025".
// SO_PAGOS = false reproduz o relatório: ele conta todo pedido com
// payment_isPaid preenchido, pago ou não. Em 2025 isso é R$ 1,09 bi contra
// R$ 0,76 bi só de pagos — 43% a mais. Ligar para true conta só pago.
const SO_PAGOS = false;
const EXCLUI_CANCELADOS = true;
const SO_FECHADOS = true;     // isClosed = 'True', como no relatório

// O relatório de GMV não tem os pedidos de "Link de cobrança": eles entraram no
// lake depois do último refresh dele. Excluir é o que faz o GMV bater.
//
// O filtro vale SÓ para o GMV e o GMV via integração. TPV e receita ficam
// completos, porque a referência deles é outra: o BI do VestiPago
// (bi.vesti.com.br/kpis), que conta paylink. Aplicar o filtro aos dois cortava
// 25% do TPV e 42% da receita de antifraude contra aquela fonte.
//
// O preço é que "TPV % do GMV" cruza duas populações: o numerador tem paylink,
// o denominador não. Está dito no FONTES.md.
// Quando o relatório de GMV for atualizado no Fabric, virar para false.
const EXCLUI_PAYLINK = true;

const TETO_PEDIDO = 0;        // 0 = sem teto. O painel CS usa 50000 para cortar outlier.

// payment_type PRE_PAYMENT/POST_PAYMENT marca o pagamento processado pelo VestiPago;
// MANUAL é pagamento combinado fora da plataforma e fica de fora do TPV.
// Conferido em set/2026: cartão por esta régua = R$ 12,70 mi contra R$ 12,64 mi
// na vestipago_transaction_detail (diferença de ingestão).
const TIPOS_VESTIPAGO = `('PRE_PAYMENT','POST_PAYMENT')`;

// MDR = só a fatia que fica com a Vesti (mdrVestiValue) e só de CARTÃO, que é
// como o BI do VestiPago conta: incluir o Pix dava R$ 1.674,87 na semana
// 12-18/10 contra os R$ 1.534,89 do BI — a diferença é exatamente o Pix.
// A fatia da bandeira (mdrCardBrandValue) não é receita e fica de fora.
// vestiPagoValue, no pedido, é a soma das duas e cobriria 2025 — mas não separa
// uma da outra, então o histórico de MDR começa onde esta fonte começa.

// A comparação do painel é contra 364 dias antes, então 2025 inteiro é obrigatório.
const DESDE = process.env.DESDE || '2025-01-01';
const ATE = process.env.ATE || new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// CSAT do VestiPago: recorte do Huggy confirmado com a equipe —
// tabulação "Vestipago", agentes Vânia, Kalinka e Tiago, departamentos
// Confecção ("Marca"), Multimarca e Parceiro.
// O BI (repo vesti-pago-kpis) usa um quarto agente, Marilecia (192502), que não
// está nessa régua; são 3 atendimentos em 2026, 0,07% do total. Para bater com
// o BI ao centavo, acrescente '192502' aqui.
const CSAT_VP = {
  tabulacao: '43825',
  agentes: ['94200', '111156', '172808'],
  departamentos: ['49778', '49777', '52888'],
};

const bq = new BigQuery({ projectId: PROJETO });
async function consultar(sql, rotulo) {
  console.log(`  [bq] ${rotulo}...`);
  const [rows] = await bq.query({ query: sql, location: LOCATION });
  console.log(`  [bq] ${rotulo}: ${rows.length} linha(s)`);
  return rows;
}

// Sem SO_PAGOS ainda é preciso exigir payment_isPaid preenchido: é o que separa
// pedido de verdade de rascunho, e é o que o relatório faz.
const filtroPago = SO_PAGOS
  ? `AND LOWER(p.payment_isPaid) = 'true'`
  : `AND LOWER(p.payment_isPaid) IN ('true','false')`;
const filtroCancel = EXCLUI_CANCELADOS ? `AND p.status_canceled_isCanceled = 'False'` : '';
const filtroFechado = SO_FECHADOS ? `AND p.isClosed = 'True'` : '';
const filtroPaylink = EXCLUI_PAYLINK ? `AND IFNULL(p.settings_source,'') != 'Link de cobrança'` : '';
const filtroTeto = TETO_PEDIDO > 0 ? `AND SAFE_CAST(p.summary_total AS FLOAT64) < ${TETO_PEDIDO}` : '';

// Segmento pelo layout da loja, como no relatório: 1 = atacado, 2 = varejo.
// Um domínio pode ter mais de uma empresa; vale a principal, a de menor id.
// Cobre 100% do GMV — a confeccao_tipo_empresa deixava ~4% sem classificação.
const SEGMENTOS = `
  SELECT CAST(domain_id AS STRING) dominio,
         IF(layout_webmobile = 1, 'atacado', 'varejo') segmento
  FROM (
    SELECT domain_id, layout_webmobile,
           ROW_NUMBER() OVER (PARTITION BY domain_id ORDER BY id) rn
    FROM ${DS}.odbc_companies
    WHERE domain_id IS NOT NULL AND layout_webmobile IN (1, 2)
  ) WHERE rn = 1`;

const SQL = `
WITH seg AS (${SEGMENTOS}),
integrados AS (
  SELECT DISTINCT CAST(ID AS STRING) dominio
  FROM ${DS}.odbc_domains
  WHERE integration_owner IS NOT NULL
),
calendario AS (
  SELECT dia, segmento
  FROM UNNEST(GENERATE_DATE_ARRAY(DATE '${DESDE}', DATE '${ATE}')) dia,
       UNNEST(['atacado','varejo']) segmento
),
-- GMV, GMV via integração e as análises de antifraude saem do mesmo pedido.
pedidos AS (
  SELECT dia, segmento, total, via_integracao FROM (
    SELECT DATE(CAST(p.settings_createdAt AS TIMESTAMP)) dia,
           s.segmento,
           SAFE_CAST(p.summary_total AS FLOAT64) total,
           i.dominio IS NOT NULL via_integracao,
           ROW_NUMBER() OVER (PARTITION BY p._id) rn
    FROM ${DS}.MongoDB_Pedidos_Geral p
    JOIN seg s ON s.dominio = p.domainId
    LEFT JOIN integrados i ON i.dominio = p.domainId
    WHERE p.settings_createdAt IS NOT NULL
      AND SAFE_CAST(p.summary_total AS FLOAT64) > 0
      AND DATE(CAST(p.settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${DESDE}' AND DATE '${ATE}'
      ${filtroPago} ${filtroCancel} ${filtroFechado} ${filtroTeto} ${filtroPaylink}
  ) WHERE rn = 1
),
gmv AS (
  SELECT dia, segmento,
         SUM(total) gmv,
         SUM(IF(via_integracao, total, 0)) gmv_integracao
  FROM pedidos GROUP BY dia, segmento
),
-- Antifraude conta toda análise, paga ou não: filtrar por pago só devolveria
-- aprovadas e a taxa daria perto de 100%.
antifraude AS (
  SELECT DATE(CAST(p.settings_createdAt AS TIMESTAMP)) dia, s.segmento,
         COUNTIF(p.payment_analysisStatus IN ('APPROVED','REFUSED')) af_analises,
         COUNTIF(p.payment_analysisStatus = 'APPROVED') af_aprovadas
  FROM ${DS}.MongoDB_Pedidos_Geral p
  JOIN seg s ON s.dominio = p.domainId
  WHERE p.settings_createdAt IS NOT NULL
    AND p.payment_analysisStatus IN ('APPROVED','REFUSED')
    AND DATE(CAST(p.settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${DESDE}' AND DATE '${ATE}'
  GROUP BY dia, segmento
),
-- Oráculo chega classificado da fonte. O painel não recalcula atribuição.
oraculo AS (
  SELECT DATE(o.settings_createdAt) dia, s.segmento,
         SUM(IF(o.Tipo_Venda_Oraculo = 'Venda Direta', o.summary_total, 0)) gmv_oraculo_direta,
         SUM(IF(o.Tipo_Venda_Oraculo = 'Venda Influenciada', o.summary_total, 0)) gmv_oraculo_influenciada
  FROM ${DS}.oraculo_Pedidos o
  JOIN seg s ON s.dominio = o.domainId
  WHERE o.settings_createdAt IS NOT NULL
    AND o.Tipo_Venda_Oraculo IS NOT NULL
    AND IFNULL(o.summary_total, 0) > 0
    AND DATE(o.settings_createdAt) BETWEEN DATE '${DESDE}' AND DATE '${ATE}'
    ${SO_PAGOS ? `AND LOWER(o.payment_isPaid) = 'true'` : ''}
  GROUP BY dia, segmento
),
-- TPV e receita de antifraude saem do pedido: a vestipago_transaction_detail
-- não cobre Pix nem o histórico de 2025.
--
-- O valor é o payment_transaction_value, não o summary_total: TPV é o que
-- passou pelo meio de pagamento, e cartão parcelado cobra acréscimo acima do
-- total do pedido. Na semana 28/09-04/10 a diferença é 2,2% — o
-- payment_transaction_value fica a 0,09% do BI, o summary_total a 2,23%.
pagamentos AS (
  SELECT DATE(CAST(p.payment_paidAt AS TIMESTAMP)) dia, s.segmento,
         SUM(IF(UPPER(p.payment_method) = 'CREDIT_CARD', SAFE_CAST(p.payment_transaction_value AS FLOAT64), 0)) tpv_cartao,
         SUM(IF(UPPER(p.payment_method) = 'PIX', SAFE_CAST(p.payment_transaction_value AS FLOAT64), 0)) tpv_pix,
         SUM(IFNULL(SAFE_CAST(p.payment_transaction_antifraudValue AS FLOAT64), 0)) receita_antifraude
  FROM ${DS}.MongoDB_Pedidos_Geral p
  JOIN seg s ON s.dominio = p.domainId
  WHERE p.payment_isPaid = 'True'
    AND p.payment_paidAt IS NOT NULL
    AND p.payment_type IN ${TIPOS_VESTIPAGO}
    AND UPPER(p.payment_method) IN ('CREDIT_CARD','PIX')
    AND SAFE_CAST(p.payment_transaction_value AS FLOAT64) > 0
    AND DATE(CAST(p.payment_paidAt AS TIMESTAMP)) BETWEEN DATE '${DESDE}' AND DATE '${ATE}'
    ${filtroCancel}
  GROUP BY dia, segmento
),
-- Única fonte que separa o que fica com a Vesti. Começa em maio/2026.
vestipago AS (
  SELECT DATE(SAFE_CAST(v.paidAt AS TIMESTAMP)) dia, s.segmento,
         SUM(IF(v.method = 'CREDIT_CARD', IFNULL(SAFE_CAST(v.mdrVestiValue AS FLOAT64), 0), 0)) receita_mdr,
         SUM(IFNULL(SAFE_CAST(v.antecipationVestiFee AS FLOAT64), 0)) receita_antecipacao
  FROM ${DS}.vestipago_transaction_detail v
  JOIN seg s ON s.dominio = v.domainId
  WHERE v.paidAt IS NOT NULL
    AND DATE(SAFE_CAST(v.paidAt AS TIMESTAMP)) BETWEEN DATE '${DESDE}' AND DATE '${ATE}'
  GROUP BY dia, segmento
),
-- Primeiro dia coberto pela fonte: antes dele o valor é desconhecido, não zero.
inicio_vestipago AS (
  SELECT MIN(DATE(SAFE_CAST(paidAt AS TIMESTAMP))) dia
  FROM ${DS}.vestipago_transaction_detail
  WHERE SAFE_CAST(mdrVestiValue AS FLOAT64) > 0
     OR SAFE_CAST(antecipationVestiFee AS FLOAT64) > 0
)
SELECT
  FORMAT_DATE('%Y-%m-%d', c.dia) data,
  c.segmento,
  ROUND(IFNULL(g.gmv, 0), 2) gmv,
  ROUND(IFNULL(g.gmv_integracao, 0), 2) gmv_integracao,
  ROUND(IFNULL(o.gmv_oraculo_direta, 0), 2) gmv_oraculo_direta,
  ROUND(IFNULL(o.gmv_oraculo_influenciada, 0), 2) gmv_oraculo_influenciada,
  ROUND(IFNULL(t.tpv_cartao, 0), 2) tpv_cartao,
  ROUND(IFNULL(t.tpv_pix, 0), 2) tpv_pix,
  IF(c.dia < (SELECT dia FROM inicio_vestipago), NULL,
     ROUND(IFNULL(v.receita_mdr, 0), 2)) receita_mdr,
  ROUND(IFNULL(t.receita_antifraude, 0), 2) receita_antifraude,
  IF(c.dia < (SELECT dia FROM inicio_vestipago), NULL,
     ROUND(IFNULL(v.receita_antecipacao, 0), 2)) receita_antecipacao,
  IFNULL(a.af_analises, 0) af_analises,
  IFNULL(a.af_aprovadas, 0) af_aprovadas
FROM calendario c
LEFT JOIN gmv g ON g.dia = c.dia AND g.segmento = c.segmento
LEFT JOIN oraculo o ON o.dia = c.dia AND o.segmento = c.segmento
LEFT JOIN antifraude a ON a.dia = c.dia AND a.segmento = c.segmento
LEFT JOIN pagamentos t ON t.dia = c.dia AND t.segmento = c.segmento
LEFT JOIN vestipago v ON v.dia = c.dia AND v.segmento = c.segmento
ORDER BY data, segmento`;

// Atendimento e nota vêm de tabelas diferentes do Huggy, e a de nota já ficou
// um mês sem carga. O limite da série é a data da ÚLTIMA CARGA da csat_raw:
// até ali, dia sem nota é zero avaliação de verdade (fim de semana, por
// exemplo); depois dali é desconhecido, e as colunas vão null — senão a taxa
// de resposta apareceria como 0%, que seria falso.
//
// Cortar pelo último dia COM nota não serve: sábado e domingo não têm
// atendimento, então a série terminaria sempre na sexta e derrubaria a semana
// inteira para "—".
const SQL_CSAT_VESTIPAGO = `
WITH chat AS (
  SELECT DATE(SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', c.created_at)) dia, f.score
  FROM ${DS_HUGGY}.chats_raw c
  LEFT JOIN ${DS_HUGGY}.csat_raw f ON f.chat_id = c.id
  WHERE JSON_VALUE(c.raw, '$.tabulationId') = '${CSAT_VP.tabulacao}'
    AND JSON_VALUE(c.raw, '$.agentId') IN (${CSAT_VP.agentes.map((a) => `'${a}'`).join(',')})
    AND JSON_VALUE(c.raw, '$.departmentId') IN (${CSAT_VP.departamentos.map((d) => `'${d}'`).join(',')})
    AND JSON_VALUE(c.raw, '$.closedAt') IS NOT NULL
    AND DATE(SAFE.PARSE_DATETIME('%Y-%m-%d %H:%M:%S', c.created_at)) BETWEEN DATE '${DESDE}' AND DATE '${ATE}'
),
ate_quando AS (
  SELECT DATE(MAX(_loaded_at)) dia FROM ${DS_HUGGY}.csat_raw
)
SELECT FORMAT_DATE('%Y-%m-%d', dia) data,
  COUNT(*) fechados,
  COUNTIF(score BETWEEN 1 AND 5) avaliados,
  SUM(IF(score BETWEEN 1 AND 5, score, 0)) soma,
  FORMAT_DATE('%Y-%m-%d', (SELECT dia FROM ate_quando)) limite
FROM chat
WHERE dia <= (SELECT dia FROM ate_quando)
GROUP BY dia ORDER BY dia`;

// Colunas que o painel lê mas que ainda não têm origem mapeada.
// Ficam null (e não zero) para o painel exibir "—" em vez de fingir um número.
const TIMES = ['integracao', 'vestipago', 'plataforma'];
const SEM_FONTE = [];

// Vêm das planilhas do time de antifraude, por dia.
// af_tempo_analises é o denominador do tempo médio e vem da MESMA planilha que
// os minutos; af_analises/af_aprovadas continuam do lake, que tem 2025.
const COLS_ANTIFRAUDE = ['af_minutos', 'af_tempo_analises',
  'chargeback_com_seguro', 'chargeback_sem_seguro'];

// Preenchidas pelas planilhas, por equipe. Dia sem atendimento fica null, e não
// zero: o painel mostra "—" em vez de fingir que o indicador despencou.
const COLS_SUPORTE = TIMES.flatMap((t) =>
  [`csat_soma_${t}`, `csat_qtd_${t}`, `csat_env_${t}`, `sla_dias_${t}`, `sla_qtd_${t}`]);

const { lerSuporte } = require(path.join(__dirname, 'suporte.js'));
const { lerAntifraude } = require(path.join(__dirname, 'antifraude.js'));
const { lerSla } = require(path.join(__dirname, 'sla.js'));

async function main() {
  console.log(`Painel da Tribo — gerando dados de ${DESDE} a ${ATE}`);
  const linhas = await consultar(SQL, 'série diária por segmento');
  if (!linhas.length) throw new Error('A consulta não devolveu nenhuma linha.');

  const csatVp = {};
  try {
    const linhas = await consultar(SQL_CSAT_VESTIPAGO, 'CSAT VestiPago (huggy)');
    // Até onde a fonte é confiável: a data da última carga da csat_raw, limitada
    // ao fim da série. Dia sem atendimento aqui dentro vale zero, não "—".
    const limiteFonte = linhas.length
      ? [linhas[0].limite, ATE].sort()[0]
      : null;
    for (const r of linhas) {
      csatVp[r.data] = {
        csat_env_vestipago: Number(r.fechados) || 0,
        csat_qtd_vestipago: Number(r.avaliados) || 0,
        csat_soma_vestipago: Number(r.soma) || 0,
      };
    }
    // Dia sem nenhum atendimento não volta da consulta. Dentro da janela isso é
    // zero atendimento, não desconhecido — sem preencher, um sábado parado
    // derrubaria a semana inteira para "—".
    const dias = Object.keys(csatVp).sort();
    if (dias.length && limiteFonte) {
      const fim = new Date(limiteFonte + 'T00:00:00Z');
      for (let d = new Date(dias[0] + 'T00:00:00Z'); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
        const dia = d.toISOString().slice(0, 10);
        if (!csatVp[dia]) csatVp[dia] = { csat_env_vestipago: 0, csat_qtd_vestipago: 0, csat_soma_vestipago: 0 };
      }
      console.log(`  [bq] CSAT VestiPago: ${dias[0]} a ${limiteFonte}`);
    }
  } catch (e) {
    console.log(`  [bq] AVISO: CSAT VestiPago não lido (${e.message.slice(0, 100)})`);
  }

  let antifraude = { porDia: {}, resumo: {} };
  try {
    antifraude = await lerAntifraude();
    const cb = antifraude.resumo.chargeback;
    if (antifraude.resumo.tempo_semanas) console.log(`  [sheets] tempo de análise: ${antifraude.resumo.tempo_semanas} semanas`);
    if (cb) {
      console.log(`  [sheets] chargeback: ${cb.perdidos} perdidos de ${cb.linhas} (${cb.de} a ${cb.ate})`);
      if (cb.sem_data) console.log(`  [sheets] AVISO: ${cb.sem_data} chargeback perdido com data ilegível, fora da conta`);
    }
  } catch (e) {
    console.log(`  [sheets] AVISO: antifraude não lido (${e.message.slice(0, 110)})`);
  }

  let sla = { porDia: {}, cobertura: {} };
  try {
    sla = await lerSla({ ate: ATE });
    const c = Object.entries(sla.cobertura).map(([k, v]) => `${k} ${v}`).join(' · ');
    console.log(`  [hubspot] SLA, ${c} tickets (${sla.de} a ${sla.ate})`);
  } catch (e) {
    console.log(`  [hubspot] AVISO: SLA não lido (${e.message.slice(0, 110)}) — fica "—" no painel.`);
  }

  let suporte = { porDia: {}, cobertura: {} };
  try {
    suporte = await lerSuporte();
    const fmt = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${v}`).join(' · ');
    console.log(`  [sheets] CSAT, ${fmt(suporte.cobertura)} semanas`);
  } catch (e) {
    console.log(`  [sheets] AVISO: suporte não lido (${e.message.slice(0, 120)}) — fica "—" no painel.`);
  }

  const diario = linhas.map((r) => {
    const o = { data: r.data, segmento: r.segmento };
    for (const [k, v] of Object.entries(r))
      if (k !== 'data' && k !== 'segmento') o[k] = v == null ? null : Number(v) || 0;
    for (const k of SEM_FONTE) o[k] = null;
    // Quase todo indicador de suporte vale para os dois segmentos: nem a
    // planilha nem o Huggy separam. A exceção é a Plataforma a partir de 2026,
    // cuja planilha divide confecção (atacado) e multimarca (varejo) — ali a
    // coluna vem sufixada com @segmento e cada lado fica com o seu número.
    const s = { ...(suporte.porDia[r.data] || {}), ...(sla.porDia[r.data] || {}), ...(csatVp[r.data] || {}) };
    for (const k of COLS_SUPORTE) {
      const v = s[`${k}@${r.segmento}`] != null ? s[`${k}@${r.segmento}`] : s[k];
      o[k] = v == null ? null : Number(v.toFixed(4));
    }
    const a = antifraude.porDia[r.data] || {};
    for (const k of COLS_ANTIFRAUDE) o[k] = a[k] == null ? null : Number(a[k].toFixed(4));
    return o;
  });

  const totalGmv = diario.reduce((a, r) => a + r.gmv, 0);
  const comGmv = diario.filter((r) => r.gmv > 0).length;
  console.log(`\n  ${diario.length} linhas · ${comGmv} dia-segmento com GMV`);
  console.log(`  GMV do período: ${totalGmv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);

  const saida = {
    gerado_em: new Date().toISOString(),
    periodo: { inicio: DESDE, fim: ATE },
    regua_gmv: { so_pagos: SO_PAGOS, exclui_cancelados: EXCLUI_CANCELADOS,
                 so_fechados: SO_FECHADOS, exclui_paylink: EXCLUI_PAYLINK,
                 teto_pedido: TETO_PEDIDO || null,
                 alinhada_com: 'relatorio GMV - Metricas 2025' },
    fontes: {
      gmv: { tabela: 'MongoDB_Pedidos_Geral', atualizado_ate: ATE },
      gmv_integracao: { tabela: 'MongoDB_Pedidos_Geral + odbc_domains', atualizado_ate: ATE },
      segmento: { tabela: 'odbc_companies.layout_webmobile', atualizado_ate: ATE },
      gmv_oraculo: { tabela: 'oraculo_Pedidos', atualizado_ate: ATE },
      tpv: { tabela: 'MongoDB_Pedidos_Geral (payment_type PRE/POST)', atualizado_ate: ATE },
      receita_antifraude: { tabela: 'MongoDB_Pedidos_Geral', atualizado_ate: ATE },
      receita_mdr_antecipacao: { tabela: 'vestipago_transaction_detail', atualizado_ate: ATE, observacao: 'desde mai/2026' },
          antifraude_analises: { tabela: 'MongoDB_Pedidos_Geral.payment_analysisStatus', atualizado_ate: ATE },
      suporte_csat: { tabela: 'planilha OKRs e KPIs - Tribo 1', atualizado_ate: ATE, observacao: 'Integrações e Plataforma' },
      suporte_csat_vestipago: { tabela: 'huggy.chats_raw + csat_raw', atualizado_ate: ATE, observacao: 'csat_raw parada em 29/09' },
      suporte_sla: { tabela: 'HubSpot, pipeline Suporte', atualizado_ate: ATE, observacao: 'tickets de erro, só 2026' },
      antifraude_tempo: { tabela: 'xlsx Metrica Antifraude 2026', atualizado_ate: ATE, observacao: 'semanal, só 2026' },
      chargeback: { tabela: 'planilha Chargebacks', atualizado_ate: ATE, observacao: 'só os perdidos' },
    },
    sem_fonte: SEM_FONTE,
    pendencias: [],
    cobertura_suporte: { csat: suporte.cobertura, sla: suporte.coberturaSla },
    diario,
  };

  const destino = path.join(__dirname, 'dados.js');
  fs.writeFileSync(destino, 'window.DADOS_TRIBO = ' + JSON.stringify(saida) + ';\n', 'utf-8');
  console.log(`\n  dados.js gravado (${(fs.statSync(destino).size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
