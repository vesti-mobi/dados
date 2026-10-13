/**
 * /api/tier — o tier fixado à mão do Painel de Clientes CS.
 *
 * O painel (vesti-mobi.github.io/dados/CS/) é estático: não tem onde gravar o
 * que a pessoa arrasta. Este endpoint é esse lugar.
 *
 *   GET   devolve o estado inteiro — é o que o painel lê no boot.
 *   POST  recebe um DELTA ({marcas:{chave:{...}}}) e aplica sobre o que já
 *         está guardado, devolvendo o resultado inteiro. Mandar delta, e não
 *         o estado todo, é o que evita duas pessoas arrastando ao mesmo tempo
 *         uma apagar o trabalho da outra.
 *
 * Uma marca com `tier: null` no delta significa "volta a seguir o GMV" e sai
 * do arquivo.
 *
 * POR QUE CADA ESCRITA CRIA UM ARQUIVO NOVO. A primeira versão gravava sempre
 * em `tier-manual.json`, com allowOverwrite. Os METADADOS atualizavam na hora
 * (o list() mostrava o tamanho e a data novos), mas o CONTEÚDO continuava
 * vindo da versão anterior pelo CDN — nem `cacheControlMaxAge: 0` nem um
 * carimbo na query resolveram. Resultado: cada escrita lia um estado velho e
 * apagava a escrita anterior; dois arrastos seguidos e o primeiro sumia.
 *
 * Agora cada escrita cria `tier-<timestamp>.json`. Uma URL que nunca existiu
 * não tem o que vir de cache. O `list()` ordena por nome e o mais recente é o
 * estado; os antigos ficam como histórico curto e os velhos são apagados.
 *
 * AUTORIZAÇÃO. A escrita pede a senha do painel no header Authorization. É a
 * mesma tranca do painel e do /api/varejo: segura a porta, não é um cofre — a
 * senha viaja no HTML de um repositório público. O que está em jogo aqui é a
 * classificação de porte de uma carteira, não dado de cliente.
 */
import { put, list, del } from '@vercel/blob';

const PREFIXO = 'tier-';
const GUARDAR = 5;                 // quantas versões anteriores ficam de pé
const TIERS = ['T1', 'T2', 'T3', 'T4'];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/* Os nomes são `tier-<ms>.json` com o número zerado à esquerda, então ordenar
   por nome é ordenar por data.

   O padrão exige DÍGITOS depois do prefixo. Sem isso o `tier-manual.json` da
   primeira versão — que ficou no armazenamento — entrava na lista e, como
   "m" vem depois de qualquer dígito, ordenava na frente de todas as versões
   novas: o GET lia para sempre o estado congelado daquele arquivo. */
const PADRAO = /^tier-\d+\.json$/;
function versoes(blobs) {
  return blobs
    .filter(b => PADRAO.test(b.pathname))
    .sort((a, b) => b.pathname.localeCompare(a.pathname));
}

async function ler() {
  const { blobs } = await list({ prefix: PREFIXO, limit: 100 });
  const v = versoes(blobs);
  if (!v.length) return { atualizadoEm: null, marcas: {}, _versoes: 0 };
  const r = await fetch(v[0].url, { cache: 'no-store' });
  if (!r.ok) throw new Error('não consegui ler o estado guardado (HTTP ' + r.status + ')');
  const j = await r.json();
  return { atualizadoEm: j.atualizadoEm || null, marcas: j.marcas || {}, _versoes: v.length };
}

async function escrever(marcas) {
  const saida = { atualizadoEm: new Date().toISOString(), marcas };
  const nome = PREFIXO + String(Date.now()).padStart(16, '0') + '.json';
  await put(nome, JSON.stringify(saida), {
    access: 'public', contentType: 'application/json',
    addRandomSuffix: false, cacheControlMaxAge: 0,
  });
  /* Faxina das versões velhas. Falhar aqui não pode derrubar a escrita, que já
     aconteceu — no pior caso sobra lixo barato no armazenamento. */
  try {
    const { blobs } = await list({ prefix: PREFIXO, limit: 100 });
    const velhas = versoes(blobs).slice(GUARDAR + 1).map(b => b.url);
    if (velhas.length) await del(velhas);
  } catch (e) { console.warn('faxina das versões antigas falhou:', e.message) }
  return saida;
}

/* Uma entrada só é aceita com tier válido (ou null, que é o "desfaz") e com
   alguma forma de achar a marca. Texto livre entra limitado em tamanho: o
   painel escreve aqui, mas quem posta pode ser qualquer um com a senha. */
function limpar(m) {
  if (!m || typeof m !== 'object') return null;
  const tier = m.tier === null ? null : String(m.tier || '').toUpperCase();
  if (tier !== null && !TIERS.includes(tier)) return null;
  const txt = (v, n) => String(v == null ? '' : v).slice(0, n);
  const dominio = txt(m.dominio, 40), nome = txt(m.nome, 160);
  if (!dominio && !nome) return null;
  return { dominio, nome, tier,
           porque: txt(m.porque, 200), quem: txt(m.quem, 80),
           em: /^\d{4}-\d{2}-\d{2}$/.test(m.em || '') ? m.em : new Date().toISOString().slice(0, 10) };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const estado = await ler();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, atualizadoEm: estado.atualizadoEm,
        marcas: estado.marcas, total: Object.keys(estado.marcas).length });
    }

    if (req.method === 'POST') {
      const senha = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!process.env.SENHA_PAINEL || senha !== process.env.SENHA_PAINEL)
        return res.status(401).json({ ok: false, erro: 'senha do painel incorreta' });

      const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const delta = corpo.marcas || {};
      if (typeof delta !== 'object' || Array.isArray(delta))
        return res.status(400).json({ ok: false, erro: 'esperava um objeto em "marcas"' });
      if (Object.keys(delta).length > 500)
        return res.status(400).json({ ok: false, erro: 'delta grande demais' });

      const estado = await ler();
      let mudou = 0;
      for (const [chave, bruto] of Object.entries(delta)) {
        if (String(chave).length > 220) continue;
        const m = limpar(bruto);
        if (!m) continue;
        if (m.tier === null) { if (estado.marcas[chave]) { delete estado.marcas[chave]; mudou++ } }
        else { estado.marcas[chave] = m; mudou++ }
      }

      const saida = await escrever(estado.marcas);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, ...saida,
        total: Object.keys(saida.marcas).length, aplicadas: mudou });
    }

    return res.status(405).json({ ok: false, erro: 'use GET ou POST' });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: e.message });
  }
}
