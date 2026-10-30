/**
 * sla.js — SLA das três equipes, direto do HubSpot.
 *
 * Substitui a planilha "SLA Vesti", que era exportada à mão e vivia semanas
 * atrás. A régua é a mesma que a planilha declara nas próprias abas, conferida
 * contra ela: as três equipes batem ao centésimo de dia e com a mesma contagem
 * de tickets.
 *
 *   pipeline ............ Suporte (id 0)
 *   categoria ........... contém "Erro - <equipe>"
 *   status .............. encerrado
 *   identificador Jira .. preenchido
 *   criado em ........... 2026 em diante
 *
 * SLA = dias corridos entre createdate e closed_date, pelo dia do fechamento —
 * "atendimentos resolvidos no período", como pede o MDATA-503. Aqui existem os
 * componentes de verdade, um ticket por linha: nada é reconstruído.
 *
 * Token em HUBSPOT_TOKEN.
 */
const https = require('https');

const PIPELINE_SUPORTE = '0';
const CATEGORIAS = [
  { equipe: 'integracao', categoria: 'Erro - Integração' },
  { equipe: 'plataforma', categoria: 'PRODUCT_ISSUE' },   // rótulo: "Erro - Plataforma"
  { equipe: 'vestipago', categoria: 'Erro - Vestipago' },
];
const DESDE_PADRAO = '2026-01-01';

function pedir(caminho, corpo, token) {
  return new Promise((resolve, reject) => {
    const dados = JSON.stringify(corpo);
    const req = https.request({
      hostname: 'api.hubapi.com', path: caminho, method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
                 'Content-Length': Buffer.byteLength(dados) },
    }, (res) => {
      const partes = [];
      res.on('data', (d) => partes.push(d));
      res.on('end', () => {
        const txt = Buffer.concat(partes).toString();
        if (res.statusCode >= 300) return reject(new Error(`HubSpot ${res.statusCode}: ${txt.slice(0, 160)}`));
        try { resolve(JSON.parse(txt)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(dados);
    req.end();
  });
}

async function buscarTickets(token, categoria, desde) {
  const filtros = [
    { propertyName: 'hs_ticket_category', operator: 'CONTAINS_TOKEN', value: categoria },
    { propertyName: 'hs_is_closed', operator: 'EQ', value: 'true' },
    { propertyName: 'hs_pipeline', operator: 'EQ', value: PIPELINE_SUPORTE },
    { propertyName: 'si_jira_issue_key', operator: 'HAS_PROPERTY' },
    { propertyName: 'createdate', operator: 'GTE', value: `${desde}T00:00:00Z` },
  ];
  const todos = [];
  let after;
  for (;;) {
    const corpo = { filterGroups: [{ filters: filtros }],
                    properties: ['createdate', 'closed_date'], limit: 100 };
    if (after) corpo.after = after;
    const r = await pedir('/crm/v3/objects/tickets/search', corpo, token);
    todos.push(...(r.results || []));
    after = r.paging && r.paging.next && r.paging.next.after;
    if (!after) break;
  }
  return todos;
}

/**
 * Devolve { 'AAAA-MM-DD': { sla_dias_<equipe>, sla_qtd_<equipe> } }.
 *
 * Dia sem ticket dentro da janela vale ZERO resolvidos, não "desconhecido" —
 * senão um fim de semana sem fechamento derrubaria a semana inteira para "—".
 * A janela termina no dia de hoje, porque o HubSpot é consultado ao vivo: não
 * existe aqui o atraso de exportação que a planilha tinha.
 */
async function lerSla({ desde = DESDE_PADRAO, ate } = {}) {
  const token = (process.env.HUBSPOT_TOKEN || '').trim();
  if (!token) throw new Error('HUBSPOT_TOKEN não definido');

  const porDia = {};
  const cobertura = {};
  for (const { equipe, categoria } of CATEGORIAS) {
    const tickets = await buscarTickets(token, categoria, desde);
    let n = 0;
    for (const t of tickets) {
      const criado = t.properties && t.properties.createdate;
      const fechado = t.properties && t.properties.closed_date;
      if (!criado || !fechado) continue;
      const dias = (new Date(fechado) - new Date(criado)) / 86400000;
      if (!Number.isFinite(dias) || dias < 0) continue;
      const dia = new Date(fechado).toISOString().slice(0, 10);
      if (ate && dia > ate) continue;
      const alvo = porDia[dia] || (porDia[dia] = {});
      alvo[`sla_dias_${equipe}`] = (alvo[`sla_dias_${equipe}`] || 0) + dias;
      alvo[`sla_qtd_${equipe}`] = (alvo[`sla_qtd_${equipe}`] || 0) + 1;
      n++;
    }
    cobertura[equipe] = n;
  }

  const dias = Object.keys(porDia).sort();
  if (dias.length) {
    const limite = ate || new Date().toISOString().slice(0, 10);
    const fim = new Date([dias[dias.length - 1], limite].sort()[0] + 'T00:00:00Z');
    for (let d = new Date(dias[0] + 'T00:00:00Z'); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      const dia = d.toISOString().slice(0, 10);
      const alvo = porDia[dia] || (porDia[dia] = {});
      for (const { equipe } of CATEGORIAS) {
        if (alvo[`sla_qtd_${equipe}`] == null) {
          alvo[`sla_dias_${equipe}`] = 0;
          alvo[`sla_qtd_${equipe}`] = 0;
        }
      }
    }
  }
  return { porDia, cobertura, de: dias[0] || null, ate: dias[dias.length - 1] || null };
}

module.exports = { lerSla, CATEGORIAS };
