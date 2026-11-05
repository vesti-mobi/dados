// Busca de movimentacao de estoque, AO VIVO (sem GitHub Actions).
//
// Porta pra JS a mesma logica de stock-logs/stock-logs.py (Loki + APIs Vesti),
// pra rodar sincrono numa function da Vercel e devolver o resultado direto na
// resposta HTTP -- sem disparar workflow, sem commit, sem esperar o GitHub
// Pages atualizar. Pedido da Laura (14/09/2026): "consultar na hora sem
// depender das actions".
//
// LIMITE HONESTO: o gargalo e' o proprio Loki, nao onde o codigo roda -- ele
// so aceita consulta em janelas (medido em producao: rate limit "429 too many
// outstanding requests" apos ~10 janelas de 1 dia seguidas). Por isso este
// endpoint CAPA o periodo em MAX_DIAS: cabe dentro do tempo de execucao de uma
// function serverless (Vercel corta em maxDuration, ver vercel.json). Periodo
// mais longo continua precisando do fluxo assincrono
// (.github/workflows/stock-logs.yml, pasta stock-logs/ do repo principal).
//
// Token: mesma variavel de ambiente VESTI_ORDER_TOKEN, soh que configurada
// aqui na Vercel (nao e' a mesma coisa que o secret do GitHub Actions --
// precisa ser colado nos dois lugares).
//
// Data de cadastro do produto (08/10/2026, pedido da Laura): o Loki nao sabe
// disso, mas o product_id vem no payload de cada StockLog. Com ele da pra
// buscar odbc_products.created_at no BigQuery -- so' funciona quando a busca
// traz pelo menos 1 linha (sem log nenhum, nao tem product_id pra procurar).
// Usa uma service account PROPRIA, so' leitura, so' no dataset vestilake_BI
// (nao e' a mesma credencial do GitHub Actions). Env var GCP_SA_KEY = o JSON
// inteiro da chave.
const { BigQuery } = require("@google-cloud/bigquery");

const LOKI_URL = "https://loki.meuvesti.com/loki/api/v1/query_range";
const USERS_URL = (userId) => `https://apivesti.vesti.mobi/appvendas/v1/users/${userId}`;
const ORDERS_URL = "https://apivesti.vesti.mobi/order/v1/orders";

const MAX_DIAS = 6; // cobre o orcamento de tempo da function (ver maxDuration no vercel.json)
const JANELA_MIN = 24 * 60; // 1 dia por janela, mesmo padrao do script original
const LOKI_LIMIT = 1000;
const LOKI_SLEEP_MS = 1500; // mais curto que o script original (5s) -- a janela total aqui e' bem menor
const ENRICH_CONCORRENCIA = 6;

const STOCKLOG_RE = /\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\].*?StockLog:\s*(\{)/;

function jsonEmChave(texto, posAbre) {
  // equivalente a json.JSONDecoder().raw_decode: extrai so o objeto JSON que
  // comeca em posAbre, ignorando o que vem depois (Loki manda outros campos
  // na mesma linha). Conta chaves respeitando string/escape.
  let prof = 0, dentroStr = false, escapando = false;
  for (let i = posAbre; i < texto.length; i++) {
    const c = texto[i];
    if (escapando) { escapando = false; continue; }
    if (c === "\\") { escapando = true; continue; }
    if (c === '"') { dentroStr = !dentroStr; continue; }
    if (dentroStr) continue;
    if (c === "{") prof++;
    else if (c === "}") {
      prof--;
      if (prof === 0) {
        try { return JSON.parse(texto.slice(posAbre, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

function parseStockLogLine(linha) {
  if (typeof linha !== "string") return null;
  const m = STOCKLOG_RE.exec(linha);
  if (!m) return null;
  const payload = jsonEmChave(linha, m.index + m[0].length - 1);
  if (!payload || typeof payload !== "object") return null;
  return { action_date: m[1].replace("T", " "), payload };
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function lokiComRetry(params, maxTentativas = 5) {
  let delay = 1500;
  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    const url = new URL(LOKI_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (resp.ok) return resp.json();
    const retryable = resp.status === 429 || resp.status >= 500;
    if (!retryable || tentativa === maxTentativas - 1) {
      const corpo = await resp.text().catch(() => "");
      throw new Error(`Loki ${resp.status}: ${corpo.slice(0, 300)}`);
    }
    const retryAfter = resp.headers.get("retry-after");
    const espera = retryAfter ? Number(retryAfter) * 1000 : delay;
    await sleep(espera);
    delay *= 2;
  }
  throw new Error("Loki: esgotou as tentativas");
}

async function buscaLoki(productCode, companyId, inicio, fim) {
  const query = `{container_name="app_core_stock_logs"} |= \`${productCode}\` |= \`${companyId}\``;
  const linhasCruas = [];
  let atual = new Date(inicio);
  while (atual <= fim) {
    const fimJanela = new Date(Math.min(atual.getTime() + JANELA_MIN * 60000, fim.getTime()));
    const params = {
      query,
      limit: String(LOKI_LIMIT),
      start: String(Math.floor(atual.getTime() / 1000)),
      end: String(Math.floor(fimJanela.getTime() / 1000) - 1),
    };
    const data = await lokiComRetry(params);
    const resultado = data?.data?.result || [];
    for (const entrada of resultado) {
      for (const valor of entrada.values || []) {
        linhasCruas.push(valor);
      }
    }
    if (fimJanela >= fim) break;
    atual = fimJanela;
    await sleep(LOKI_SLEEP_MS);
  }
  return linhasCruas;
}

function parseLinhas(linhasCruas) {
  const vistos = new Set();
  const rows = [];
  for (const [tsNs, linhaRaw] of linhasCruas) {
    let linha = linhaRaw;
    if (typeof linha === "string" && linha.trimStart().startsWith("{")) {
      try { linha = JSON.parse(linha).log ?? linha; } catch { /* mantem string crua */ }
    }
    const registro = parseStockLogLine(linha);
    if (!registro) continue;
    const chave = tsNs + "|" + JSON.stringify(registro.payload);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    rows.push({ ...registro, ts_ns: Number(tsNs) });
  }
  rows.sort((a, b) => (a.action_date < b.action_date ? -1 : a.action_date > b.action_date ? 1 : a.ts_ns - b.ts_ns));
  return rows;
}

async function fetchComRetry(url, token, maxTentativas = 4) {
  let delay = 800;
  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    let resp;
    try {
      resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      if (tentativa === maxTentativas - 1) return null;
      await sleep(delay); delay *= 2; continue;
    }
    if (resp.status === 200) { try { return await resp.json(); } catch { return null; } }
    if (resp.status === 404) return null;
    if (resp.status === 429 || resp.status >= 500) {
      if (tentativa === maxTentativas - 1) return null;
      const retryAfter = resp.headers.get("retry-after");
      await sleep(retryAfter ? Number(retryAfter) * 1000 : delay);
      delay *= 2;
      continue;
    }
    return null;
  }
  return null;
}

async function poolLimitado(itens, concorrencia, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  async function worker() {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, itens.length) }, worker));
  return resultados;
}

function unwrap(payload) {
  let p = payload;
  while (p && typeof p === "object" && !Array.isArray(p) && ("data" in p || "result" in p)) {
    const nxt = p.data ?? p.result;
    if (nxt === p || nxt == null) break;
    p = nxt;
  }
  return p;
}

async function enriquecer(rows, companyId, token) {
  const userIds = [...new Set(rows.map((r) => r.payload.user_id).filter(Boolean).map(String))];
  const reserveIds = [...new Set(rows.map((r) => r.payload.order_id).filter(Boolean).map(String))];

  const usuarios = {};
  await poolLimitado(userIds, ENRICH_CONCORRENCIA, async (id) => {
    const payload = unwrap(await fetchComRetry(USERS_URL(id), token));
    const obj = Array.isArray(payload) ? payload[0] : payload;
    if (obj && typeof obj === "object") {
      const nome = obj.name || obj.firstName || "";
      const sobrenome = obj.lastname || obj.lastName || "";
      usuarios[id] = [nome, sobrenome].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
    } else usuarios[id] = "";
  });

  const pedidos = {};
  await poolLimitado(reserveIds, ENRICH_CONCORRENCIA, async (reserveId) => {
    const url = new URL(ORDERS_URL);
    url.searchParams.set("filter[companyId]", companyId);
    url.searchParams.set("filter[settings.stockReserveId]", reserveId);
    url.searchParams.set("select", "orderNumber");
    let payload = unwrap(await fetchComRetry(url, token));
    if (payload && !Array.isArray(payload)) payload = [payload];
    const first = Array.isArray(payload) ? payload[0] : null;
    pedidos[reserveId] = first && typeof first === "object"
      ? String(first.orderNumber ?? first.order_number ?? "") : "";
  });

  return { usuarios, pedidos };
}

// Busca odbc_products.created_at pros product_id encontrados no resultado.
// Falha em silencio (retorna null) se a credencial nao estiver configurada ou
// a query falhar -- isso nao pode derrubar a busca principal, e' so' um dado
// a mais.
async function buscaDataCadastro(rows) {
  const productIds = [...new Set(rows.map((r) => r.payload.product_id).filter(Boolean).map(String))];
  if (!productIds.length) return { produtoId: "", produtoCadastradoEm: "" };

  const chaveRaw = process.env.GCP_SA_KEY;
  if (!chaveRaw) return { produtoId: productIds.join(", "), produtoCadastradoEm: "" };

  try {
    const credentials = JSON.parse(chaveRaw);
    const bq = new BigQuery({ projectId: credentials.project_id, credentials });
    const [linhas] = await bq.query({
      query: `
        SELECT id, created_at
        FROM \`vestilake_BI.odbc_products\`
        WHERE id IN UNNEST(@ids)
        ORDER BY created_at ASC
      `,
      params: { ids: productIds },
      location: "us-central1", // dataset vestilake_BI mora nessa regiao especifica (nao e' "US" multi-regiao)
    });
    if (!linhas.length) return { produtoId: productIds.join(", "), produtoCadastradoEm: "" };
    // o produto mais antigo entre os product_id encontrados -- normalmente so'
    // tem 1, mas cores/tamanhos as vezes tem product_id proprio
    const maisAntigo = linhas[0];
    const dt = maisAntigo.created_at?.value || maisAntigo.created_at;
    return { produtoId: productIds.join(", "), produtoCadastradoEm: dt ? String(dt) : "" };
  } catch {
    return { produtoId: productIds.join(", "), produtoCadastradoEm: "" };
  }
}

function montaLinhasCsv(rows, usuarios, pedidos) {
  const porAcao = {}, porOrigem = {};
  const linhas = rows.map((r) => {
    const p = r.payload;
    const userId = p.user_id || "";
    const reserveId = p.order_id || "";
    const acao = p.action || "";
    const origem = p.origin || "";
    porAcao[acao || "(vazio)"] = (porAcao[acao || "(vazio)"] || 0) + 1;
    porOrigem[origem || "(vazio)"] = (porOrigem[origem || "(vazio)"] || 0) + 1;
    // DELETE sempre vem com old_qty/old_balance=0 e new_* ausente (o registro
    // de estoque deixou de existir, nao "zerou") -- "0 -> —" nao diz nada.
    // Troca pelo booleano existia(1)->nao existe(0), nas duas colunas. Mesma
    // regra do stock-logs.py, pra manter os dois batendo. Pedido da Laura,
    // 15/09/2026.
    const del = acao === "DELETE";
    return {
      action_date: r.action_date,
      action: acao,
      origin: origem,
      ip: p.ip || "",
      user_name: userId ? (usuarios[String(userId)] || "") : "",
      user_id: userId,
      sku: p.sku || "",
      old_qty: del ? 1 : (p.old_qty ?? ""),
      new_qty: del ? 0 : (p.new_qty ?? ""),
      old_balance: del ? 1 : (p.old_balance ?? ""),
      new_balance: del ? 0 : (p.new_balance ?? ""),
      order_number: reserveId ? (pedidos[String(reserveId)] || "") : "",
      stock_reserve_id: reserveId,
    };
  });
  return { linhas, porAcao, porOrigem };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "use POST" });
    return;
  }
  const token = process.env.VESTI_ORDER_TOKEN;
  if (!token) {
    res.status(500).json({ erro: "VESTI_ORDER_TOKEN nao configurado nesta Vercel (env var)" });
    return;
  }

  const { company_id, product_code, start, end } = req.body || {};
  if (!company_id || !product_code || !start || !end) {
    res.status(400).json({ erro: "company_id, product_code, start e end sao obrigatorios" });
    return;
  }
  const inicio = new Date(start);
  const fim = new Date(end);
  if (isNaN(inicio) || isNaN(fim) || fim <= inicio) {
    res.status(400).json({ erro: "periodo invalido (end precisa ser depois de start)" });
    return;
  }
  const dias = (fim - inicio) / 86400000;
  if (dias > MAX_DIAS) {
    res.status(400).json({
      erro: `periodo maximo pra busca ao vivo e' ${MAX_DIAS} dias (pedido: ${dias.toFixed(1)}). `
        + `Pra periodo maior, use o workflow "Stock Logs (busca)" no GitHub Actions do repo `
        + `vesti-mobi/dados -- ele nao tem esse limite, so' demora mais.`,
    });
    return;
  }

  try {
    const brutas = await buscaLoki(product_code, company_id, inicio, fim);
    const rows = parseLinhas(brutas);
    if (!rows.length) {
      res.status(200).json({
        totalLinhas: 0, porAcao: {}, porOrigem: {}, rows: [],
        produtoId: "", produtoCadastradoEm: "",
        geradoEm: new Date().toISOString(),
      });
      return;
    }
    const [{ usuarios, pedidos }, dataCadastro] = await Promise.all([
      enriquecer(rows, company_id, token),
      buscaDataCadastro(rows),
    ]);
    const { linhas, porAcao, porOrigem } = montaLinhasCsv(rows, usuarios, pedidos);
    res.status(200).json({
      totalLinhas: linhas.length,
      porAcao,
      porOrigem,
      rows: linhas,
      produtoId: dataCadastro.produtoId,
      produtoCadastradoEm: dataCadastro.produtoCadastradoEm,
      geradoEm: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ erro: String(e.message || e).slice(0, 500) });
  }
};
