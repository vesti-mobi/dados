/**
 * conferir_hubspot.js — o painel bate com o HubSpot?
 *
 * Pergunta da Laura em 24/09/2026: "reuniões e tickets estão alinhados 100% com
 * o HubSpot?". Este script responde com número, não com promessa de código: vai
 * ao HubSpot contar reuniões, tickets e negócios do ano, compara com o que está
 * no CS/dados.js publicado e diz, mês a mês, onde e quanto diverge.
 *
 * Não escreve nada: só lê o HubSpot e o arquivo. Roda no workflow "Conferir
 * HubSpot" (workflow_dispatch) ou na mão, com HUBSPOT_TOKEN no ambiente.
 *
 * A contagem no HubSpot usa o campo `total` da Search API — ele vem na primeira
 * página, então contar 12 meses custa 12 chamadas, não 12 páginas inteiras.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const HS_TOKEN = process.env.HUBSPOT_TOKEN || '';
if (!HS_TOKEN) { console.error('HUBSPOT_TOKEN não veio no ambiente.'); process.exit(1); }

const ANO = Number(process.env.ANO_CONFERENCIA) || new Date().getUTCFullYear();
const HOJE = new Date();

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

/* Quantos objetos existem entre duas datas. `total` vem na resposta da busca. */
async function contar(objeto, propData, ini, fim) {
  const j = await hs('POST', `/crm/v3/objects/${objeto}/search`, {
    limit: 1, properties: ['hs_object_id'],
    filterGroups: [{ filters: [
      { propertyName: propData, operator: 'GTE', value: String(Date.parse(ini + 'T00:00:00Z')) },
      { propertyName: propData, operator: 'LT', value: String(Date.parse(fim + 'T00:00:00Z')) },
    ] }],
  });
  return j.total || 0;
}

const mesesDoAno = () => {
  const out = [];
  const ate = ANO === HOJE.getUTCFullYear() ? HOJE.getUTCMonth() : 11;
  for (let m = 0; m <= ate; m++) {
    const ini = new Date(Date.UTC(ANO, m, 1)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(ANO, m + 1, 1)).toISOString().slice(0, 10);
    out.push({ mes: ini.slice(0, 7), ini, fim });
  }
  return out;
};

/* O dados.js é um script de navegador: carrega numa gaiola com `window`. */
function lerPainel() {
  const arq = path.join(__dirname, 'dados.js');
  if (!fs.existsSync(arq)) { console.error('CS/dados.js não existe aqui.'); process.exit(1); }
  global.window = {};
  require(arq);
  const d = global.window.PAINEL_DATA;
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
  return desempacotar(d);
}

function tabela(titulo, linhas) {
  console.log('\n' + titulo);
  console.log('  mês       HubSpot   painel   diferença');
  linhas.forEach(l => {
    const dif = l.painel - l.hubspot;
    console.log('  ' + l.mes.padEnd(9)
      + String(l.hubspot).padStart(7)
      + String(l.painel).padStart(9)
      + (dif === 0 ? '        =' : String(dif > 0 ? '+' + dif : dif).padStart(9)));
  });
  const tH = linhas.reduce((a, l) => a + l.hubspot, 0);
  const tP = linhas.reduce((a, l) => a + l.painel, 0);
  console.log('  ' + 'TOTAL'.padEnd(9) + String(tH).padStart(7) + String(tP).padStart(9)
    + (tP === tH ? '        =' : String(tP - tH > 0 ? '+' + (tP - tH) : tP - tH).padStart(9)));
  return { hubspot: tH, painel: tP };
}

(async () => {
  console.log('Conferência painel × HubSpot — ano ' + ANO);
  const data = lerPainel();
  console.log('dados.js gerado em ' + (data.meta && data.meta.geradoEm));

  const meses = mesesDoAno();

  // ---------------------------------------------------------------- REUNIÕES
  const reunioes = data.reunioes || [];
  const linhasR = [];
  for (const m of meses) {
    linhasR.push({ mes: m.mes,
      hubspot: await contar('meetings', 'hs_meeting_start_time', m.ini, m.fim),
      painel: reunioes.filter(r => String(r.data || '').slice(0, 7) === m.mes).length });
  }
  const totR = tabela('REUNIÕES (hs_meeting_start_time)', linhasR);
  const donos = {};
  reunioes.forEach(r => { donos[r.cs] = (donos[r.cs] || 0) + 1; });
  console.log('  donos no painel: ' + Object.entries(donos).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + ' (' + v + ')').join(', '));
  console.log('  sem empresa associada no painel: '
    + reunioes.filter(r => r.cliente === '(sem empresa)').length);
  console.log('  com domínio da carteira: ' + reunioes.filter(r => r.dominio).length);

  // ----------------------------------------------------------------- TICKETS
  const tickets = data.tickets || [];
  const linhasT = [];
  for (const m of meses) {
    linhasT.push({ mes: m.mes,
      hubspot: await contar('tickets', 'createdate', m.ini, m.fim),
      painel: tickets.filter(t => String(t.data || '').slice(0, 7) === m.mes).length });
  }
  const totT = tabela('TICKETS (createdate)', linhasT);
  console.log('  com domínio da carteira: ' + tickets.filter(t => t.dominio).length);
  console.log('  abertos no painel: ' + tickets.filter(t => t.situacao !== 'Encerrado').length);

  // ---------------------------------------------------- NEGÓCIOS DO PIPELINE
  /* O painel guarda os negócios de Expand (cross-sell/upsell) e os dos quatro
     pipelines de CS (onboarding). Conferir o total do pipeline Expand fecha o
     terceiro número que a aba mostra. */
  const pipes = await hs('GET', '/crm/v3/pipelines/deals');
  const expand = (pipes.results || []).find(p => /^expand/i.test(p.label || ''));
  if (expand) {
    const j = await hs('POST', '/crm/v3/objects/deals/search', {
      limit: 1, properties: ['hs_object_id'],
      filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: expand.id }] }],
    });
    console.log('\nNEGÓCIOS do pipeline "' + expand.label + '"');
    console.log('  HubSpot (todos os anos): ' + (j.total || 0));
    console.log('  painel (ano corrente + abertos de qualquer ano): ' + (data.negocios || []).length);
  }

  console.log('\nResumo: reuniões ' + totR.painel + '/' + totR.hubspot
    + ' · tickets ' + totT.painel + '/' + totT.hubspot);
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1); });
