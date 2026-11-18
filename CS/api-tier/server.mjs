// Servidor HTTP do vesti-cs-tier no Cloud Run (GCP vesti-data-499015), no lugar
// da Vercel. api/tier.js continua no formato de function da Vercel
// (export default handler(req, res)); este arquivo reproduz os helpers que a
// Vercel injeta (res.status, res.json, req.body parseado, req.query).
//
// Rotas: so /api/tier, como na Vercel (a raiz devolvia 404 la tambem).
import http from 'node:http';
import querystring from 'node:querystring';
import tier from './api/tier.js';

const PORT = Number(process.env.PORT || 8080);
const FUNCOES = { '/api/tier': tier };

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', c => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

function parseCorpo(buf, contentType) {
  if (!buf.length) return undefined;
  const tipo = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (tipo === 'application/json') return JSON.parse(buf.toString('utf8'));
  if (tipo === 'application/x-www-form-urlencoded') return querystring.parse(buf.toString('utf8'));
  if (tipo === 'text/plain') return buf.toString('utf8');
  return buf;
}

function decorarResposta(res) {
  res.status = codigo => { res.statusCode = codigo; return res; };
  res.json = obj => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = corpo => {
    if (corpo !== null && typeof corpo === 'object' && !Buffer.isBuffer(corpo)) return res.json(corpo);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(corpo);
    return res;
  };
  return res;
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const funcao = FUNCOES[pathname];
  if (!funcao) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('404: NOT_FOUND');
    return;
  }
  decorarResposta(res);
  try {
    const buf = await lerCorpo(req);
    try {
      req.body = parseCorpo(buf, req.headers['content-type']);
    } catch {
      res.status(400).send('Invalid JSON');
      return;
    }
    req.query = Object.fromEntries(url.searchParams);
    await funcao(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, erro: 'FUNCTION_INVOCATION_FAILED' });
    else res.end();
  }
});

process.on('SIGTERM', () => servidor.close(() => process.exit(0)));
servidor.listen(PORT, () => console.log(`vesti-cs-tier ouvindo na porta ${PORT}`));
