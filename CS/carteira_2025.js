/**
 * carteira_2025.js — GMV e TPV com a carteira DA ÉPOCA, não a de hoje.
 *
 * Pedido da Laura em 02/10/2026: "quero a carteira real de 2025, não a carteira
 * de hoje aplicada a 2025".
 *
 * O problema: `odbc_domains.angel_id` guarda só o estado ATUAL. O lake inteiro
 * foi vasculhado (modo explorar de conferir_bigquery.js) e não há tabela de
 * histórico, log de troca nem retrato mensal da carteira — a troca de CS
 * sobrescreve o campo e o passado some.
 *
 * A saída é o HubSpot: cada empresa tem `hubspot_owner_id` e a API devolve o
 * HISTÓRICO dessa propriedade, com data de cada troca. Dá para perguntar "quem
 * era a dona desta marca em 30/11/2025" — desde que o owner do HubSpot seja de
 * fato a CS da marca, e é isso que este script mede ANTES de usar o número:
 * quantas marcas da carteira casam com uma empresa do HubSpot, e em quantas o
 * owner de hoje bate com o angel de hoje. Sem concordância alta, o histórico do
 * HubSpot não é carteira — é outra coisa — e o script diz isso em vez de
 * entregar um número bonito e errado.
 *
 * MODO=excel gera CS/carteira_2025.xlsx com duas abas (GMV e TPV).
 *
 * Ambiente: HUBSPOT_TOKEN e GOOGLE_APPLICATION_CREDENTIALS.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const RAIZ = path.join(__dirname, '..');
const { BigQuery } = require(path.join(RAIZ, 'node_modules/@google-cloud/bigquery'));

const HS_TOKEN = process.env.HUBSPOT_TOKEN || '';
if (!HS_TOKEN) { console.error('HUBSPOT_TOKEN não veio no ambiente.'); process.exit(1); }

const MODO = process.env.MODO || 'diagnostico';
const MESES = (process.env.MESES || '2025-10,2025-11,2025-12').split(',').map(s => s.trim());
const PROJETO = 'vesti-data-499015';
const DS = '`vesti-data-499015.vestilake_BI`';
const TETO_PEDIDO = 50000;
const ANJOS_FORA = ['Shirley Silva', 'Priscila Argolo'];
const DOMINIOS_EXTRA = ['1593235', '1833676'];

// ----------------------------------------------------------------- HubSpot
function hs(metodo, caminho, corpo) {
  return new Promise((res, rej) => {
    const b = corpo ? JSON.stringify(corpo) : null;
    const req = https.request({
      hostname: 'api.hubapi.com', path: caminho, method: metodo,
      headers: Object.assign({ Authorization: 'Bearer ' + HS_TOKEN },
        b ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } : {})
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => {
        if (r.statusCode === 429) return setTimeout(() => hs(metodo, caminho, corpo).then(res, rej), 1500);
        if (r.statusCode >= 400) return rej(new Error(r.statusCode + ' ' + d.slice(0, 200)));
        try { res(JSON.parse(d)); } catch (e) { rej(e); }
      });
    });
    req.on('error', rej);
    if (b) req.write(b);
    req.end();
  });
}

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();
const chaveMarca = s => semAcento(s)
  .replace(/\b(ltda|me|epp|eireli|sa|s\/a|comercio|confeccoes|confeccao|modas|store|shop)\b/g, '')
  .replace(/[^a-z0-9]/g, '');
const soDigitos = s => String(s || '').replace(/\D+/g, '');

async function owners() {
  const nome = {};
  let after = null;
  do {
    const j = await hs('GET', '/crm/v3/owners?limit=100' + (after ? '&after=' + after : ''));
    (j.results || []).forEach(o => {
      nome[String(o.id)] = [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email || String(o.id);
    });
    after = j.paging && j.paging.next && j.paging.next.after;
  } while (after);
  return nome;
}

/* Empresas com o HISTÓRICO do dono: cada entrada traz o valor e o timestamp em
   que ele passou a valer. É o que permite perguntar "quem era a dona em X". */
async function empresasComHistorico() {
  const out = [];
  let after = null;
  do {
    /* 50, não 100: com propertiesWithHistory a API corta em 50 por página. */
    const j = await hs('GET', '/crm/v3/objects/companies?limit=50'
      + '&properties=name,cnpj,hs_tax_id,domain'
      + '&propertiesWithHistory=hubspot_owner_id'
      + (after ? '&after=' + after : ''));
    (j.results || []).forEach(c => {
      const h = ((c.propertiesWithHistory || {}).hubspot_owner_id || [])
        .map(x => ({ valor: x.value || null, em: x.timestamp }))
        .sort((a, b) => String(a.em).localeCompare(String(b.em)));
      out.push({
        id: c.id,
        nome: (c.properties || {}).name || '',
        cnpj: soDigitos((c.properties || {}).cnpj || (c.properties || {}).hs_tax_id || ''),
        historico: h,
      });
    });
    after = j.paging && j.paging.next && j.paging.next.after;
    process.stdout.write('\r  empresas lidas: ' + out.length + '   ');
  } while (after);
  process.stdout.write('\n');
  return out;
}

/* Dono vigente numa data: o último valor do histórico anterior a ela. */
function donoEm(historico, iso) {
  const limite = Date.parse(iso + 'T23:59:59Z');
  let v = null;
  for (const h of historico) {
    if (Date.parse(h.em) <= limite) v = h.valor; else break;
  }
  return v;
}

const fimDoMes = mes => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- BigQuery
async function carteiraEPedidos(bq) {
  const ini = MESES.slice().sort()[0] + '-01';
  const fim = fimDoMes(MESES.slice().sort().reverse()[0]);

  const [cart] = await bq.query({ query: `
    WITH dom AS (
      SELECT CAST(ID AS STRING) id, ANY_VALUE(name) nome,
             ANY_VALUE(CAST(angel_id AS STRING)) angel_id
      FROM ${DS}.odbc_domains
      WHERE (LOWER(IFNULL(modulos,'')) LIKE '%vendas%'
             OR CAST(ID AS STRING) IN (${DOMINIOS_EXTRA.map(x => `'${x}'`).join(',')}))
        AND LOWER(IFNULL(name,'')) NOT LIKE '%teste%'
        AND LOWER(IFNULL(name,'')) NOT LIKE '%andressa vesti%'
      GROUP BY id
    ),
    comp AS (
      SELECT CAST(domain_id AS STRING) domain_id,
             ANY_VALUE(tax_document) cnpj, ANY_VALUE(social_name) social
      FROM ${DS}.odbc_companies GROUP BY 1
    )
    SELECT d.id dom, d.nome, c.cnpj, c.social,
           CASE WHEN a.name IS NULL OR a.name = 'N/A'
                     OR a.name IN (${ANJOS_FORA.map(x => `'${x}'`).join(',')}) THEN 'Sem CS'
                ELSE a.name END cs_hoje
    FROM dom d
    LEFT JOIN comp c ON c.domain_id = d.id
    LEFT JOIN ${DS}.odbc_angels a ON CAST(a.id AS STRING) = d.angel_id` });

  const [ped] = await bq.query({ query: `
    SELECT CAST(domainId AS STRING) dom,
           FORMAT_DATE('%Y-%m', DATE(CAST(settings_createdAt AS TIMESTAMP))) mes,
           ROUND(SUM(IF(payment_isPaid='True', CAST(summary_total AS FLOAT64), 0)),2) gmv,
           ROUND(SUM(IF(payment_isPaid='True' AND payment_transaction_provider IS NOT NULL,
                        CAST(summary_total AS FLOAT64), 0)),2) tpv
    FROM ${DS}.MongoDB_Pedidos_Geral
    WHERE settings_createdAt IS NOT NULL AND SAFE_CAST(domainId AS INT64) IS NOT NULL
      AND SAFE_CAST(summary_total AS FLOAT64) > 0
      AND SAFE_CAST(summary_total AS FLOAT64) < ${TETO_PEDIDO}
      AND DATE(CAST(settings_createdAt AS TIMESTAMP)) BETWEEN DATE '${ini}' AND DATE '${fim}'
    GROUP BY 1,2` });

  return { carteira: cart, pedidos: ped };
}

// -------------------------------------------------------------------- main
(async () => {
  console.log('Carteira da época × carteira de hoje');
  console.log('meses: ' + MESES.join(', ') + ' · modo: ' + MODO + '\n');

  const bq = new BigQuery({ projectId: PROJETO });
  const { carteira, pedidos } = await carteiraEPedidos(bq);
  console.log('marcas na carteira (BigQuery): ' + carteira.length);

  const nomeDoOwner = await owners();
  console.log('owners no HubSpot: ' + Object.keys(nomeDoOwner).length);

  console.log('lendo empresas do HubSpot com histórico de dono...');
  const empresas = await empresasComHistorico();

  /* Casamento empresa do HubSpot -> domínio da carteira: CNPJ primeiro, nome
     depois, só quando o nome aponta para UMA marca. */
  const porCnpj = new Map(), porChave = new Map(), ambiguo = new Set();
  carteira.forEach(m => {
    const c = soDigitos(m.cnpj);
    if (c && !porCnpj.has(c)) porCnpj.set(c, m);
    [m.nome, m.social].filter(Boolean).forEach(n => {
      const k = chaveMarca(n);
      if (k.length < 4) return;
      if (porChave.has(k) && porChave.get(k).dom !== m.dom) ambiguo.add(k);
      else porChave.set(k, m);
    });
  });
  ambiguo.forEach(k => porChave.delete(k));

  const marcaDaEmpresa = e => (e.cnpj && porCnpj.get(e.cnpj)) || porChave.get(chaveMarca(e.nome)) || null;

  let casadas = 0, concorda = 0, comHistoricoAntigo = 0;
  const histDoDom = new Map();
  empresas.forEach(e => {
    const m = marcaDaEmpresa(e);
    if (!m) return;
    casadas++;
    const atual = e.historico.length ? e.historico[e.historico.length - 1].valor : null;
    const nomeAtual = atual ? (nomeDoOwner[String(atual)] || null) : null;
    if (nomeAtual && nomeAtual === m.cs_hoje) concorda++;
    if (e.historico.some(h => Date.parse(h.em) < Date.parse('2026-01-01'))) comHistoricoAntigo++;
    if (!histDoDom.has(m.dom)) histDoDom.set(m.dom, { marca: m, hist: e.historico });
  });

  const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';
  console.log('\nDIAGNÓSTICO');
  console.log('  empresas do HubSpot casadas com a carteira: ' + casadas + ' de ' + empresas.length);
  console.log('  dessas, o dono de hoje é a CS de hoje:      ' + concorda + ' (' + pct(concorda, casadas) + ')');
  console.log('  com histórico de dono anterior a 2026:      ' + comHistoricoAntigo + ' (' + pct(comHistoricoAntigo, casadas) + ')');

  if (concorda / Math.max(casadas, 1) < 0.7) {
    console.log('\nO dono da empresa no HubSpot NÃO é a CS da marca na maioria dos casos.');
    console.log('Usar esse histórico como "carteira de 2025" daria um número errado com');
    console.log('cara de certo. É preciso outra fonte — planilha do time, por exemplo.');
    if (MODO !== 'excel') return;
    console.log('MODO=excel mesmo assim: o arquivo sai com o aviso dentro.');
  }

  // ------------------------------------------------- GMV e TPV por CS da época
  const soma = {};   // mes -> cs -> {gmv,tpv}
  const semDono = {};
  MESES.forEach(m => { soma[m] = {}; semDono[m] = { gmv: 0, tpv: 0, marcas: 0 }; });

  const porDom = new Map(carteira.map(m => [m.dom, m]));
  pedidos.forEach(p => {
    if (!soma[p.mes]) return;
    const m = porDom.get(p.dom); if (!m) return;
    const h = histDoDom.get(p.dom);
    let cs = null;
    if (h) {
      const id = donoEm(h.hist, fimDoMes(p.mes));
      cs = id ? (nomeDoOwner[String(id)] || null) : null;
    }
    if (!cs) { const s = semDono[p.mes]; s.gmv += Number(p.gmv) || 0; s.tpv += Number(p.tpv) || 0; s.marcas++; cs = '(sem dono no HubSpot na época)'; }
    const alvo = soma[p.mes][cs] || (soma[p.mes][cs] = { gmv: 0, tpv: 0, marcas: 0 });
    alvo.gmv += Number(p.gmv) || 0;
    alvo.tpv += Number(p.tpv) || 0;
    alvo.marcas++;
  });

  console.log('\nCOBERTURA (quanto do GMV ficou sem dono na época)');
  MESES.forEach(m => {
    const total = Object.values(soma[m]).reduce((a, x) => a + x.gmv, 0);
    console.log('  ' + m + ': ' + pct(semDono[m].gmv, total) + ' do GMV sem dono · '
      + semDono[m].marcas + ' marcas');
  });

  if (MODO !== 'excel') { console.log('\n(diagnóstico só; MODO=excel gera a planilha)'); return; }

  const XLSX = require(path.join(RAIZ, 'node_modules/xlsx'));
  const csTodas = [...new Set(MESES.flatMap(m => Object.keys(soma[m])))].sort();
  const aba = campo => {
    const linhas = csTodas.map(cs => {
      const l = { 'CS (carteira da época)': cs };
      MESES.forEach(m => { l[m] = Math.round((soma[m][cs] || {})[campo] || 0); });
      l['Total'] = MESES.reduce((a, m) => a + Math.round((soma[m][cs] || {})[campo] || 0), 0);
      return l;
    });
    const total = { 'CS (carteira da época)': 'TOTAL' };
    MESES.forEach(m => { total[m] = linhas.reduce((a, l) => a + l[m], 0); });
    total['Total'] = linhas.reduce((a, l) => a + l['Total'], 0);
    linhas.push(total);
    return XLSX.utils.json_to_sheet(linhas);
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba('gmv'), 'GMV');
  XLSX.utils.book_append_sheet(wb, aba('tpv'), 'TPV VestiPago');
  const saida = path.join(__dirname, 'carteira_2025.xlsx');
  XLSX.writeFile(wb, saida);
  console.log('\n[write] ' + saida);
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
