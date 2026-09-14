#!/usr/bin/env python3
"""
Coleta logs de estoque (Loki) de um produto/empresa, enriquece com nome do
usuario (API appvendas) e numero do pedido (API orders) e gera um CSV.

Uso:
    python3 stock-logs.py --start=2026-08-01T00:00:00 --end=2026-09-01T00:00:00 \
        --product-code=KR9182625229 \
        --company-id=9d42510e-9776-4fe1-87d7-8fe0dec1c58c

Saidas (no diretorio atual, ou --out-dir):
    {companyId}_{productCode}-{YYYYMMDD}-{YYYYMMDD}.log
    {companyId}_{productCode}-{YYYYMMDD}-{YYYYMMDD}.csv
"""

import argparse
import asyncio
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta

import requests

LOKI_URL = "https://loki.meuvesti.com/loki/api/v1/query_range"
USERS_URL = "https://apivesti.vesti.mobi/appvendas/v1/users/{user_id}"
ORDERS_URL = "https://apivesti.vesti.mobi/order/v1/orders"

DEFAULT_TOKEN = (
    ""
)

CSV_COLUMNS = [
    "action_date", "action", "origin", "ip", "user_name", "user_id", "sku",
    "old_qty", "new_qty", "old_balance", "new_balance", "order_number",
    "stock_reserve_id",
]

STOCKLOG_RE = re.compile(
    r"\[(?P<date>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\].*?StockLog:\s*(?P<json>\{)"
)
_DECODER = json.JSONDecoder()


# --------------------------------------------------------------------------- #
# 1. Loki
# --------------------------------------------------------------------------- #
def fetch_loki(product_code, company_id, start_time, end_time, interval_minutes,
               limit, sleep_seconds, output_file):
    """Consulta o Loki em janelas e grava o resultado bruto em .log (JSONL)."""
    query = (
        '{container_name="app_core_stock_logs"} '
        f"|= `{product_code}` |= `{company_id}`"
    )
    params = {"query": query, "limit": limit}

    chunks = 0
    entries = 0
    with open(output_file, "w") as f:
        current_time = start_time
        while current_time <= end_time:
            window_end = min(current_time + timedelta(minutes=interval_minutes), end_time)
            params["start"] = int(current_time.timestamp())
            params["end"] = int(window_end.timestamp()) - 1

            print(f"[loki] {current_time:%Y-%m-%d %H:%M} -> {window_end:%Y-%m-%d %H:%M}",
                  flush=True)

            response = requests.get(LOKI_URL, params=params, timeout=120)
            if response.status_code != 200:
                raise SystemExit(
                    f"Erro ao consultar Loki: {response.status_code} - {response.text}"
                )

            result = response.json().get("data", {}).get("result", [])
            chunk_entries = 0
            for entry in result:
                f.write(json.dumps(entry) + "\n")
                f.write("\n")
                chunk_entries += len(entry.get("values", []))

            entries += chunk_entries
            chunks += 1
            if chunk_entries >= limit:
                print(
                    f"  [aviso] janela atingiu o limite de {limit} entradas; "
                    "reduza --interval para nao perder registros.",
                    file=sys.stderr, flush=True,
                )

            if window_end >= end_time:
                break
            current_time = window_end
            if sleep_seconds:
                time.sleep(sleep_seconds)

    print(f"[loki] {entries} entradas em {chunks} janelas -> {output_file}")
    return entries


# --------------------------------------------------------------------------- #
# 2. Parse do .log
# --------------------------------------------------------------------------- #
def parse_log_file(path):
    """Le o .log gerado e devolve a lista de registros StockLog (sem duplicidade)."""
    rows = []
    seen = set()

    with open(path) as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw)
            except json.JSONDecodeError:
                continue

            for value in entry.get("values", []):
                if len(value) < 2:
                    continue
                ts_ns, line = value[0], value[1]

                # a linha normalmente vem como {"log": "..."} serializado
                if isinstance(line, str) and line.lstrip().startswith("{"):
                    try:
                        line = json.loads(line).get("log", line)
                    except json.JSONDecodeError:
                        pass

                record = _parse_stocklog_line(line)
                if record is None:
                    continue

                key = (ts_ns, json.dumps(record["payload"], sort_keys=True))
                if key in seen:
                    continue
                seen.add(key)

                record["ts_ns"] = int(ts_ns)
                rows.append(record)

    rows.sort(key=lambda r: (r["action_date"], r["ts_ns"]))
    return rows


def _parse_stocklog_line(line):
    if not isinstance(line, str):
        return None
    match = STOCKLOG_RE.search(line)
    if not match:
        return None
    try:
        payload, _ = _DECODER.raw_decode(line[match.start("json"):])
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return {"action_date": match.group("date").replace("T", " "), "payload": payload}


# --------------------------------------------------------------------------- #
# 3. Enriquecimento assincrono (users / orders)
# --------------------------------------------------------------------------- #
class AsyncFetcher:
    """requests em thread pool, orquestrado por asyncio, com limite de
    concorrencia e retry/backoff para 429 e 5xx."""

    def __init__(self, token, concurrency, max_retries=5):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Accept-Encoding": "gzip, deflate",
        })
        self.semaphore = asyncio.Semaphore(concurrency)
        self.max_retries = max_retries

    async def get_json(self, url, params=None):
        async with self.semaphore:
            delay = 1.0
            for attempt in range(self.max_retries):
                try:
                    response = await asyncio.to_thread(
                        self.session.get, url, params=params, timeout=60
                    )
                except requests.RequestException as exc:
                    if attempt == self.max_retries - 1:
                        print(f"  [erro] {url}: {exc}", file=sys.stderr)
                        return None
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue

                if response.status_code == 200:
                    try:
                        return response.json()
                    except ValueError:
                        return None
                if response.status_code == 404:
                    return None
                if response.status_code == 429 or response.status_code >= 500:
                    wait = float(response.headers.get("Retry-After") or delay)
                    await asyncio.sleep(wait)
                    delay *= 2
                    continue

                print(f"  [erro] {response.status_code} em {response.url}", file=sys.stderr)
                return None
            return None


def _unwrap(payload):
    """Normaliza {'data': X} / {'result': X} para X."""
    while isinstance(payload, dict) and any(k in payload for k in ("data", "result")):
        nxt = payload.get("data", payload.get("result"))
        if nxt is payload or nxt is None:
            break
        payload = nxt
    return payload


async def fetch_user_names(fetcher, user_ids):
    """{user_id: 'Nome Sobrenome'}"""
    async def one(user_id):
        payload = _unwrap(await fetcher.get_json(USERS_URL.format(user_id=user_id)))
        if isinstance(payload, list):
            payload = payload[0] if payload else None
        if not isinstance(payload, dict):
            return user_id, ""
        name = payload.get("name") or payload.get("firstName") or ""
        last = payload.get("lastname") or payload.get("lastName") or ""
        full = " ".join(p for p in (str(name).strip(), str(last).strip()) if p)
        return user_id, full

    results = await asyncio.gather(*(one(uid) for uid in user_ids))
    return dict(results)


async def fetch_order_numbers(fetcher, company_id, stock_reserve_ids):
    """{stock_reserve_id: order_number}"""
    async def one(reserve_id):
        payload = _unwrap(await fetcher.get_json(ORDERS_URL, params={
            "filter[companyId]": company_id,
            "filter[settings.stockReserveId]": reserve_id,
            "select": "orderNumber",
        }))
        if isinstance(payload, dict):
            payload = [payload]
        if not isinstance(payload, list) or not payload:
            return reserve_id, ""
        first = payload[0]
        if not isinstance(first, dict):
            return reserve_id, ""
        number = first.get("orderNumber") or first.get("order_number") or ""
        return reserve_id, str(number)

    results = await asyncio.gather(*(one(rid) for rid in stock_reserve_ids))
    return dict(results)


async def enrich(rows, company_id, token, concurrency):
    user_ids = sorted({
        str(r["payload"].get("user_id")) for r in rows if r["payload"].get("user_id")
    })
    reserve_ids = sorted({
        str(r["payload"].get("order_id")) for r in rows if r["payload"].get("order_id")
    })

    fetcher = AsyncFetcher(token, concurrency)

    print(f"[users] consultando {len(user_ids)} usuarios unicos...", flush=True)
    users = await fetch_user_names(fetcher, user_ids)
    print(f"[orders] consultando {len(reserve_ids)} reservas unicas...", flush=True)
    orders = await fetch_order_numbers(fetcher, company_id, reserve_ids)

    print(f"[users] {sum(1 for v in users.values() if v)}/{len(user_ids)} resolvidos")
    print(f"[orders] {sum(1 for v in orders.values() if v)}/{len(reserve_ids)} resolvidos")
    return users, orders


# --------------------------------------------------------------------------- #
# 4. CSV
# --------------------------------------------------------------------------- #
def write_csv(rows, users, orders, output_file):
    with open(output_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in rows:
            p = row["payload"]
            user_id = p.get("user_id") or ""
            reserve_id = p.get("order_id") or ""
            writer.writerow({
                "action_date": row["action_date"],
                "action": p.get("action", ""),
                "origin": p.get("origin", ""),
                "ip": p.get("ip", ""),
                "user_name": users.get(str(user_id), "") if user_id else "",
                "user_id": user_id,
                "sku": p.get("sku", ""),
                "old_qty": p.get("old_qty", ""),
                "new_qty": p.get("new_qty", ""),
                "old_balance": p.get("old_balance", ""),
                "new_balance": p.get("new_balance", ""),
                "order_number": orders.get(str(reserve_id), "") if reserve_id else "",
                "stock_reserve_id": reserve_id,
            })
    print(f"[csv] {len(rows)} linhas -> {output_file}")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def parse_datetime(value):
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise argparse.ArgumentTypeError(f"data invalida: {value!r} (use 2026-08-01T00:00:00)")


def main():
    parser = argparse.ArgumentParser(
        description="Extrai logs de estoque do Loki e gera .log + .csv enriquecido."
    )
    parser.add_argument("--start", required=True, type=parse_datetime,
                        help="data/hora inicial, ex: 2026-08-01T00:00:00")
    parser.add_argument("--end", required=True, type=parse_datetime,
                        help="data/hora final, ex: 2026-09-01T00:00:00")
    parser.add_argument("--product-code", required=True, help="ex: KR9182625229")
    parser.add_argument("--company-id", required=True,
                        help="ex: 9d42510e-9776-4fe1-87d7-8fe0dec1c58c")
    parser.add_argument("--token", default=os.environ.get("VESTI_TOKEN", DEFAULT_TOKEN),
                        help="Bearer token das APIs Vesti (ou env VESTI_TOKEN)")
    parser.add_argument("--interval", type=int, default=1440,
                        help="tamanho da janela de consulta no Loki, em minutos (padrao 1440)")
    parser.add_argument("--limit", type=int, default=1000,
                        help="limit por consulta no Loki (padrao 1000)")
    parser.add_argument("--sleep", type=float, default=5.0,
                        help="pausa entre janelas do Loki, em segundos (padrao 5)")
    parser.add_argument("--concurrency", type=int, default=8,
                        help="requisicoes simultaneas nas APIs Vesti (padrao 8)")
    parser.add_argument("--out-dir", default=".", help="diretorio de saida")
    parser.add_argument("--skip-fetch", action="store_true",
                        help="nao consulta o Loki; reaproveita o .log existente")
    args = parser.parse_args()

    if args.end <= args.start:
        raise SystemExit("--end precisa ser maior que --start")

    os.makedirs(args.out_dir, exist_ok=True)
    base = (
        f"{args.company_id}_{args.product_code}"
        f"-{args.start:%Y%m%d}-{args.end:%Y%m%d}"
    )
    log_file = os.path.join(args.out_dir, base + ".log")
    csv_file = os.path.join(args.out_dir, base + ".csv")

    if args.skip_fetch:
        if not os.path.exists(log_file):
            raise SystemExit(f"--skip-fetch informado mas {log_file} nao existe")
        print(f"[loki] pulado, usando {log_file}")
    else:
        fetch_loki(
            args.product_code, args.company_id, args.start, args.end,
            args.interval, args.limit, args.sleep, log_file,
        )

    rows = parse_log_file(log_file)
    print(f"[parse] {len(rows)} registros StockLog")
    if not rows:
        write_csv([], {}, {}, csv_file)
        return

    users, orders = asyncio.run(enrich(rows, args.company_id, args.token, args.concurrency))
    write_csv(rows, users, orders, csv_file)


if __name__ == "__main__":
    main()
