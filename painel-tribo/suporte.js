/**
 * suporte.js — lê os indicadores de suporte das três equipes direto do Google
 * Sheets: CSAT e taxa de resposta da planilha "OKRs e KPIs - Tribo 1", SLA da
 * planilha "SLA Vesti".
 *
 * Acesso pela service account painel-cs-sheets-reader@csatenps, a mesma que o
 * PainelCSGerencial já usa. A planilha está compartilhada com ela; não há nada
 * a configurar além do caminho da chave.
 *
 *   GOOGLE_SHEETS_SA_JSON_FILE=/caminho/para/sa.json   (opcional)
 *
 * A planilha guarda o indicador PRONTO por semana — CSAT médio e % de resposta,
 * ambos digitados à mão — e não os componentes. Para o painel poder somar um
 * intervalo qualquer sem cair em média de médias, os componentes são
 * reconstruídos:
 *
 *   pesquisas enviadas = atendimentos
 *   respostas          = atendimentos x taxa_resposta
 *   soma das notas     = csat x respostas
 *
 * Cada aba tem uma régua própria, por isso a configuração abaixo é por equipe.
 * Semana ISO (segunda a domingo) nas três, confirmado com o time — a aba de
 * VestiPago ainda tem "Dom - Sab" escrito no cabeçalho, que está desatualizado.
 */
const fs = require('fs');
const path = require('path');
const { JWT } = require(path.join(__dirname, '..', 'node_modules', 'google-auth-library'));

const PLANILHA = '15i3jOD_I6oAgtKUo34rliVZ3cqIQTPE9eM5Qm9sopWY';
const PLANILHA_SLA = '1eTCorxSCgUk6qJTrSJeee7X2bBZvK6EBpN-SXv__dJU';

// Abas de SLA: uma por equipe, com a lista de tickets a partir da linha 22
// (cabeçalho na 21). Colunas: 3 nome, 4 criação, 5 fechamento, 7 SLA em horas.
const ABAS_SLA = [
  { equipe: 'integracao', aba: 'SLA - Integração' },
  { equipe: 'plataforma', aba: 'SLA - Plataforma' },
  { equipe: 'vestipago', aba: 'SLA - Vestipago' },
];
const SLA_LINHA0 = 22, SLA_COL_NOME = 3, SLA_COL_FECHAMENTO = 5, SLA_COL_HORAS = 7;

// A planilha de SLA ainda está em construção e tem tickets de teste dentro.
// Em setembro/2026 os únicos dois tickets da Integração eram "Teste Ticket" e
// "Teste Ticket 2", ambos fechados em minutos: o SLA da equipe dava 0,0 dia, um
// número ótimo e falso. Ligar isto descarta ticket cujo nome começa por "teste".
// Default false para não inventar regra sobre o dado de ninguém.
const IGNORAR_TICKETS_TESTE = false;
const ehTeste = (nome) => /^\s*teste\b/i.test(String(nome || ''));

const CAMINHOS_CHAVE = [
  process.env.GOOGLE_SHEETS_SA_JSON_FILE,
  path.join(__dirname, 'google_sa.json'),
  path.join(__dirname, '..', 'PainelCSGerencial', 'google_sa.json'),
  path.join(process.env.HOME || '', 'Documents', 'Ideia-vesti', 'PainelCSGerencial', 'google_sa.json'),
].filter(Boolean);

// Uma entrada por bloco de suporte da planilha. `linhas` é o índice 0-based da
// linha na aba; `linSemana` é a linha que numera as semanas; `col0` a primeira
// coluna de dado.
const BLOCOS = [
  {
    equipe: 'integracao', aba: 'Integração - KPIs', linSemana: 2, col0: 3,
    linhas: { csat: 96, atendimentos: 97, resposta: 98 },
  },
  // VestiPago saiu daqui: o CSAT dele vem do Huggy, no BigQuery, com os
  // componentes de verdade. A aba continua existindo, mas é cópia manual da
  // mesma origem e estava quatro semanas atrás.
  // Plataforma está partida em duas abas e, em 2026, em dois públicos:
  // confecção e multimarca. Os dois somam no mesmo número, porque é uma
  // equipe só atendendo dois tipos de cliente.
  //
  // NÃO confundir com o atacado/varejo do painel. Já tentei mapear
  // confecção->atacado e multimarca->varejo, e os números desmentem: o layout
  // varejo tem 48 lojas contra 654 do atacado, mas o suporte a multimarca tem
  // 443 atendimentos contra 843 da confecção. As multimarcas atendidas são as
  // lojistas COMPRADORAS, clientes das confecções — elas não aparecem no GMV
  // como vendedoras, então não são o segmento varejo.
  {
    equipe: 'plataforma', aba: 'Plataforma - KPIs', linSemana: 1, col0: 4,
    linhas: { csat: 14, atendimentos: 16, resposta: 15 },
  },
  {
    equipe: 'plataforma', aba: 'Plataforma - KPIs (2026)', linSemana: 1, col0: 4,
    linhas: { csat: 13, atendimentos: 15, resposta: 14 },
  },
  {
    equipe: 'plataforma', aba: 'Plataforma - KPIs (2026)', linSemana: 1, col0: 4,
    linhas: { csat: 21, atendimentos: 23, resposta: 22 },
  },
];

function lerChave() {
  for (const p of CAMINHOS_CHAVE) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  throw new Error(
    'Chave da service account não encontrada. Procurei em:\n  ' + CAMINHOS_CHAVE.join('\n  ') +
    '\nDefina GOOGLE_SHEETS_SA_JSON_FILE apontando para o google_sa.json.');
}

function autenticar() {
  const chave = lerChave();
  return new JWT({
    email: chave.client_email, key: chave.private_key,
    // drive.readonly tambem: a planilha de antifraude e um .xlsx no Drive,
    // que a API do Sheets nao le.
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
}

async function buscarAbas(cliente, planilha, nomes) {
  const fora = {};
  for (const nome of nomes) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${planilha}/values/${encodeURIComponent(`'${nome}'`)}?valueRenderOption=UNFORMATTED_VALUE`;
    const r = await cliente.request({ url });
    fora[nome] = r.data.values || [];
  }
  return fora;
}

// Data serial do Sheets (dias desde 30/12/1899) para 'AAAA-MM-DD' em UTC.
const EPOCA_SHEETS = Date.UTC(1899, 11, 30);
function diaDoSerial(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  return new Date(EPOCA_SHEETS + serial * 86400000).toISOString().slice(0, 10);
}

/**
 * SLA por dia, a partir da lista de tickets. Diferente do CSAT, aqui existem
 * os componentes de verdade — um ticket por linha — então nada é reconstruído
 * nem diluído: cada ticket entra no dia em que foi FECHADO, que é o que o
 * ticket do Jira pede ("atendimentos resolvidos no período").
 *
 * A coluna "SLA (Horas)" é o tempo corrido entre abertura e fechamento
 * (conferido ticket a ticket nos 320 da Plataforma), o que é exatamente a
 * definição de SLA do MDATA-503: dias corridos, fim de semana incluído.
 *
 * Dentro da janela que a planilha cobre, dia sem ticket vale ZERO resolvidos,
 * não "desconhecido" — senão o painel descartaria o período inteiro por causa
 * de um domingo sem fechamento. Fora da janela o valor fica null de propósito:
 * ali não dá para saber se ninguém fechou ticket ou se a planilha ainda não
 * foi atualizada.
 */
async function lerSla(cliente) {
  const abas = await buscarAbas(cliente, PLANILHA_SLA, ABAS_SLA.map((a) => a.aba));
  const porDia = {};
  const cobertura = {};
  for (const { equipe, aba } of ABAS_SLA) {
    const V = abas[aba] || [];
    for (const linha of V.slice(SLA_LINHA0)) {
      if (!linha || linha.length <= SLA_COL_HORAS) continue;
      const dia = diaDoSerial(linha[SLA_COL_FECHAMENTO]);
      const horas = linha[SLA_COL_HORAS];
      if (!dia || typeof horas !== 'number' || !Number.isFinite(horas) || horas < 0) continue;
      if (IGNORAR_TICKETS_TESTE && ehTeste(linha[SLA_COL_NOME])) continue;
      const alvo = porDia[dia] || (porDia[dia] = {});
      alvo[`sla_dias_${equipe}`] = (alvo[`sla_dias_${equipe}`] || 0) + horas / 24;
      alvo[`sla_qtd_${equipe}`] = (alvo[`sla_qtd_${equipe}`] || 0) + 1;
      cobertura[equipe] = (cobertura[equipe] || 0) + 1;
    }
  }

  // Preenche com zero os dias sem fechamento dentro da janela coberta.
  const dias = Object.keys(porDia).sort();
  if (dias.length) {
    const fim = new Date(dias[dias.length - 1] + 'T00:00:00Z');
    for (let d = new Date(dias[0] + 'T00:00:00Z'); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      const dia = d.toISOString().slice(0, 10);
      const alvo = porDia[dia] || (porDia[dia] = {});
      for (const { equipe } of ABAS_SLA) {
        if (alvo[`sla_qtd_${equipe}`] == null) {
          alvo[`sla_dias_${equipe}`] = 0;
          alvo[`sla_qtd_${equipe}`] = 0;
        }
      }
    }
  }
  return { porDia, cobertura, janela: dias.length ? { de: dias[0], ate: dias[dias.length - 1] } : null };
}

const numero = (V, i, c) => {
  const v = V[i] && V[i][c];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

// Nenhuma aba marca o ano em toda coluna: a virada é o ponto em que a
// numeração da semana recomeça. A de Plataforma tem uma aba por ano, e aí o
// ano sai do próprio nome.
function colunasPorSemana(V, bloco) {
  const anoFixo = /\(2026\)/.test(bloco.aba) ? 2026
    : bloco.aba === 'Plataforma - KPIs' ? 2025 : null;
  const larg = Math.max(...V.map((r) => r.length));
  const saida = [];
  let ano = anoFixo || 2025, ultima = 0;
  for (let c = bloco.col0; c < larg; c++) {
    const s = numero(V, bloco.linSemana, c);
    if (s == null || s < 1 || s > 53) continue;
    if (!anoFixo && s < ultima) ano++;
    ultima = s;
    saida.push({ col: c, ano, semana: s });
  }
  return saida;
}

function primeiraSegundaISO(ano) {
  const d = new Date(Date.UTC(ano, 0, 4));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/**
 * Devolve { 'AAAA-MM-DD': { csat_soma_<equipe>, csat_qtd_<equipe>, csat_env_<equipe> } }
 * com o valor da semana diluído nos 7 dias — o painel soma dias, então semana
 * fechada bate exato e recorte parcial fica proporcional.
 */
async function lerSuporte() {
  const cliente = autenticar();
  const abas = await buscarAbas(cliente, PLANILHA, [...new Set(BLOCOS.map((b) => b.aba))]);
  const porSemana = {};   // chave 'equipe|ano|semana' -> componentes somados

  for (const bloco of BLOCOS) {
    const V = abas[bloco.aba];
    if (!V || !V.length) continue;
    for (const { col, ano, semana } of colunasPorSemana(V, bloco)) {
      const nota = numero(V, bloco.linhas.csat, col);
      const enviadas = numero(V, bloco.linhas.atendimentos, col);
      let taxa = numero(V, bloco.linhas.resposta, col);
      if (nota == null || enviadas == null || taxa == null) continue;
      if (nota <= 0 || enviadas <= 0) continue;          // semana sem atendimento
      if (taxa > 1.5) taxa /= 100;                        // VestiPago grava 42,2 em vez de 0,422
      if (taxa <= 0) continue;

      const respostas = enviadas * taxa;
      const k = `${bloco.equipe}|${bloco.segmento || 'ambos'}|${ano}|${semana}`;
      const a = porSemana[k] || (porSemana[k] = { enviadas: 0, respostas: 0, soma: 0 });
      a.enviadas += enviadas;
      a.respostas += respostas;
      a.soma += nota * respostas;
    }
  }

  const porDia = {};
  const cobertura = {};
  for (const [k, a] of Object.entries(porSemana)) {
    const [equipe, segmento, ano, semana] = k.split('|');
    cobertura[equipe] = (cobertura[equipe] || 0) + 1;
    const inicio = primeiraSegundaISO(Number(ano));
    inicio.setUTCDate(inicio.getUTCDate() + (Number(semana) - 1) * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setUTCDate(d.getUTCDate() + i);
      const dia = d.toISOString().slice(0, 10);
      const alvo = porDia[dia] || (porDia[dia] = {});
      // sufixo vazio = vale para os dois segmentos
      const sufixo = segmento === 'ambos' ? '' : `@${segmento}`;
      alvo[`csat_env_${equipe}${sufixo}`] = a.enviadas / 7;
      alvo[`csat_qtd_${equipe}${sufixo}`] = a.respostas / 7;
      alvo[`csat_soma_${equipe}${sufixo}`] = a.soma / 7;
    }
  }

  // SLA vem de outra planilha e numa granularidade melhor: ticket a ticket.
  // Se ela falhar, o CSAT continua de pé e só o SLA fica "—".
  let sla = { porDia: {}, cobertura: {}, janela: null };
  try {
    sla = await lerSla(cliente);
    for (const [dia, vals] of Object.entries(sla.porDia)) {
      Object.assign(porDia[dia] || (porDia[dia] = {}), vals);
    }
  } catch (e) {
    console.log(`  [sheets] AVISO: SLA não lido (${e.message.slice(0, 100)})`);
  }

  return { porDia, cobertura, coberturaSla: sla.cobertura, janelaSla: sla.janela };
}

module.exports = { lerSuporte, autenticar, BLOCOS };
