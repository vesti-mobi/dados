/**
 * antifraude.js — tempo de análise e chargeback, das duas planilhas do time.
 *
 *   Tempo de análise  "Metrica Antifraude 2026 - Atualizada.xlsx" (Drive),
 *                     aba "Resumo Semanal".
 *   Chargeback        planilha "Chargebacks", abas "Chargeback 2025" e
 *                     "Chargeback 2026".
 *
 * As duas são lidas pela mesma service account do suporte.js.
 */
const path = require('path');
const { JWT } = require(path.join(__dirname, '..', 'node_modules', 'google-auth-library'));
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));
const { autenticar } = require(path.join(__dirname, 'suporte.js'));

const PLANILHA_ANTIFRAUDE = '1b3sA8gqRJguzZHPRUl8yjIjutqChyQrT';   // .xlsx no Drive
const PLANILHA_CHARGEBACK = '1LsYVZiQ5_B6bcRQmGkW7p6ZGO0VhbZU1ZM78ThXncao';
const ABAS_CHARGEBACK = ['Chargeback 2025', 'Chargeback 2026'];

// Resumo Semanal: 1 início da semana, 10 qtd de análise, 9 qtd aprovada,
// 15 "Analise Geral" — o tempo médio de TODAS as análises, que é o que o
// MDATA-503 chama de tempo médio de análise. As colunas 3 e 6 são recortes
// (horário comercial e fora dele) e a 11 é só a análise manual.
const AF = { aba: 'Resumo Semanal', linCabecalho: 2, colInicio: 0, colAnalises: 9, colAprovadas: 8, colTempo: 14 };

const EPOCA_SHEETS = Date.UTC(1899, 11, 30);

function diaDoSerial(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 40000) return null;
  return new Date(EPOCA_SHEETS + Math.floor(v) * 86400000).toISOString().slice(0, 10);
}

// Datas chegam como serial do Sheets, texto dd/mm/aaaa ou ISO. O que não
// casar com nenhum formato fica de fora e é contado — a planilha tem um
// punhado de células digitadas errado.
function dia(v) {
  const serial = diaDoSerial(v);
  if (serial) return serial;
  const txt = String(v == null ? '' : v).split('\n')[0].trim();
  let m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

const valorBRL = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v == null ? '' : v).replace(/[R$\s.]/g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

// "0:47:23.774000" ou fração de dia -> minutos.
function minutos(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v * 24 * 60 : null;
  const m = String(v == null ? '' : v).match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
}

function primeiraSegundaISO(ano) {
  const d = new Date(Date.UTC(ano, 0, 4));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

async function baixarXlsx(cliente, fileId) {
  const r = await cliente.request({
    url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    responseType: 'arraybuffer',
  });
  return XLSX.read(Buffer.from(r.data), { type: 'buffer' });
}

async function lerAbas(cliente, planilha, nomes) {
  const fora = {};
  for (const nome of nomes) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${planilha}/values/${encodeURIComponent(`'${nome}'`)}?valueRenderOption=UNFORMATTED_VALUE`;
    const r = await cliente.request({ url });
    fora[nome] = r.data.values || [];
  }
  return fora;
}

/**
 * Tempo de análise por dia. A planilha é semanal e traz a MÉDIA, então o
 * total de minutos é reconstruído (média x quantidade) para o painel poder
 * somar qualquer intervalo sem cair em média de médias. O valor da semana é
 * diluído nos 7 dias, igual ao CSAT.
 */
async function lerTempoAnalise(cliente) {
  const wb = await baixarXlsx(cliente, PLANILHA_ANTIFRAUDE);
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[AF.aba], { header: 1, raw: true, defval: null });
  const porDia = {};
  let semanas = 0;
  for (const linha of linhas.slice(AF.linCabecalho)) {
    if (!linha) continue;
    const inicio = dia(linha[AF.colInicio]);
    const analises = Number(linha[AF.colAnalises]);
    const aprovadas = Number(linha[AF.colAprovadas]);
    const media = minutos(linha[AF.colTempo]);
    if (!inicio || !Number.isFinite(analises) || analises <= 0 || media == null) continue;
    semanas++;
    const d0 = new Date(inicio + 'T00:00:00Z');
    for (let i = 0; i < 7; i++) {
      const d = new Date(d0);
      d.setUTCDate(d.getUTCDate() + i);
      porDia[d.toISOString().slice(0, 10)] = {
        af_minutos: (media * analises) / 7,
        // denominador proprio: a aprovacao do painel vem do lake, que conta
        // outra populacao, e misturar os dois daria um tempo medio errado.
        af_tempo_analises: analises / 7,
      };
    }
  }
  return { porDia, semanas };
}

/**
 * Chargeback PERDIDO por dia, separado entre com e sem seguro — é o que a
 * Vesti de fato perdeu. Os outros status (Ganho, Disputa, Acatado, Resolvido,
 * Aguardando a marca) ficam de fora de propósito: ainda não são perda.
 */
async function lerChargeback(cliente) {
  const abas = await lerAbas(cliente, PLANILHA_CHARGEBACK, ABAS_CHARGEBACK);
  const porDia = {};
  let perdidos = 0, semData = 0, total = 0;
  // Até onde a planilha foi preenchida, olhando TODOS os status. Um chargeback
  // recente entra como "Disputa" ou "Aguardando a marca" e só vira "Perdido"
  // quando é julgado — então o último perdido fica semanas atrás do último
  // lançamento. Cortar a série no último perdido faria o painel mostrar "—"
  // num período em que a perda foi, de fato, zero.
  let ultimoLancamento = null;
  for (const nome of ABAS_CHARGEBACK) {
    const V = abas[nome] || [];
    if (!V.length) continue;
    const cab = V[0].map((c) => String(c || '').trim());
    const iStatus = cab.indexOf('Status');
    const iSeguro = cab.indexOf('Seguro');
    const iValor = cab.indexOf('Valor da venda');
    if (iStatus < 0 || iSeguro < 0 || iValor < 0) continue;
    for (const linha of V.slice(1)) {
      if (!linha || linha.length <= iValor) continue;
      total++;
      const dLinha = dia(linha[0]);
      if (dLinha && (!ultimoLancamento || dLinha > ultimoLancamento)) ultimoLancamento = dLinha;
      if (!/^perdid/i.test(String(linha[iStatus] || '').trim())) continue;
      const d = dLinha;
      const v = valorBRL(linha[iValor]);
      if (!d || v == null) { semData++; continue; }
      perdidos++;
      const comSeguro = /^sim$/i.test(String(linha[iSeguro] || '').trim());
      const alvo = porDia[d] || (porDia[d] = {});
      const col = comSeguro ? 'chargeback_com_seguro' : 'chargeback_sem_seguro';
      alvo[col] = (alvo[col] || 0) + v;
    }
  }
  return { porDia, perdidos, semData, total, ultimoLancamento };
}

async function lerAntifraude() {
  const cliente = autenticar();
  const saida = { porDia: {}, resumo: {} };

  try {
    const t = await lerTempoAnalise(cliente);
    for (const [d, v] of Object.entries(t.porDia)) Object.assign(saida.porDia[d] || (saida.porDia[d] = {}), v);
    saida.resumo.tempo_semanas = t.semanas;
  } catch (e) {
    console.log(`  [sheets] AVISO: tempo de análise não lido (${e.message.slice(0, 110)})`);
  }

  try {
    const c = await lerChargeback(cliente);
    // Dia dentro da janela sem chargeback vale ZERO perda, não "desconhecido".
    // A janela vai até o último lançamento da planilha (de qualquer status),
    // nunca além de hoje — há duas linhas datadas de 31/12/2026 que de outro
    // modo esticariam a série por dois meses.
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = [c.ultimoLancamento || hoje, hoje].sort()[0];
    const dias = Object.keys(c.porDia).filter((d) => d <= limite).sort();
    for (const d of Object.keys(c.porDia)) if (d > limite) delete c.porDia[d];
    if (dias.length) {
      const fim = new Date(limite + 'T00:00:00Z');
      for (let d = new Date(dias[0] + 'T00:00:00Z'); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
        const dd = d.toISOString().slice(0, 10);
        const alvo = c.porDia[dd] || (c.porDia[dd] = {});
        alvo.chargeback_com_seguro = alvo.chargeback_com_seguro || 0;
        alvo.chargeback_sem_seguro = alvo.chargeback_sem_seguro || 0;
      }
    }
    for (const [d, v] of Object.entries(c.porDia)) Object.assign(saida.porDia[d] || (saida.porDia[d] = {}), v);
    saida.resumo.chargeback = { perdidos: c.perdidos, sem_data: c.semData, linhas: c.total,
                                de: dias[0] || null, ate: limite, ultimo_perdido: dias[dias.length - 1] || null };
  } catch (e) {
    console.log(`  [sheets] AVISO: chargeback não lido (${e.message.slice(0, 110)})`);
  }

  return saida;
}

module.exports = { lerAntifraude };
