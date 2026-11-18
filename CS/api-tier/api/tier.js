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
 *
 * ONDE FICA GUARDADO. Com TIER_BUCKET definido (Cloud Run, GCP
 * vesti-data-499015) o estado vai para um bucket GCS; sem ele, continua no
 * Vercel Blob. O esquema de um arquivo por escrita é o mesmo nos dois — o GCS
 * não tem o problema de cache do Blob (leitura depois de escrita é consistente),
 * mas manter o mesmo formato deixa o histórico e a faxina idênticos.
 */
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

/* Os dois armazenamentos expõem a mesma interface: listar() devolve
   [{pathname, ref}], lerJson(ref), gravar(nome, texto), apagar([ref]). */
let _armazenamento;
async function armazenamento() {
  if (_armazenamento) return _armazenamento;
  if (process.env.TIER_BUCKET) {
    const { Storage } = await import('@google-cloud/storage');
    const bucket = new Storage().bucket(process.env.TIER_BUCKET);
    _armazenamento = {
      async listar() {
        const [files] = await bucket.getFiles({ prefix: PREFIXO, maxResults: 100 });
        return files.map(f => ({ pathname: f.name, ref: f.name }));
      },
      async lerJson(ref) {
        const [buf] = await bucket.file(ref).download();
        return JSON.parse(buf.toString('utf8'));
      },
      async gravar(nome, texto) {
        await bucket.file(nome).save(texto, {
          resumable: false, contentType: 'application/json',
          metadata: { cacheControl: 'no-store' },
        });
      },
      async apagar(refs) {
        await Promise.all(refs.map(r => bucket.file(r).delete({ ignoreNotFound: true })));
      },
    };
  } else {
    const { put, list, del } = await import('@vercel/blob');
    _armazenamento = {
      async listar() {
        const { blobs } = await list({ prefix: PREFIXO, limit: 100 });
        return blobs.map(b => ({ pathname: b.pathname, ref: b.url }));
      },
      async lerJson(ref) {
        const r = await fetch(ref, { cache: 'no-store' });
        if (!r.ok) throw new Error('não consegui ler o estado guardado (HTTP ' + r.status + ')');
        return r.json();
      },
      async gravar(nome, texto) {
        await put(nome, texto, {
          access: 'public', contentType: 'application/json',
          addRandomSuffix: false, cacheControlMaxAge: 0,
        });
      },
      async apagar(refs) { await del(refs); },
    };
  }
  return _armazenamento;
}

async function ler() {
  const arm = await armazenamento();
  const v = versoes(await arm.listar());
  if (!v.length) return { atualizadoEm: null, marcas: {}, _versoes: 0 };
  const j = await arm.lerJson(v[0].ref);
  return { atualizadoEm: j.atualizadoEm || null, marcas: j.marcas || {}, _versoes: v.length };
}

async function escrever(marcas) {
  const arm = await armazenamento();
  const saida = { atualizadoEm: new Date().toISOString(), marcas };
  const nome = PREFIXO + String(Date.now()).padStart(16, '0') + '.json';
  await arm.gravar(nome, JSON.stringify(saida));
  /* Faxina das versões velhas. Falhar aqui não pode derrubar a escrita, que já
     aconteceu — no pior caso sobra lixo barato no armazenamento. */
  try {
    const velhas = versoes(await arm.listar()).slice(GUARDAR + 1).map(b => b.ref);
    if (velhas.length) await arm.apagar(velhas);
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
