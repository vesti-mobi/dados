"""Diagnostico: lista TODAS as purchases da Alcance via API Vesti e
imprime contagem por dia BRT + range de datas por pagina. Roda no GH
Actions (que tem VESTIAPI_TOKEN). Tb salva o JSON cru em
_debug_alcance.json pra inspecao.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta
from collections import Counter

WS = "6602349567016960"  # Alcance Jeans
URL = f"https://apivesti.vesti.mobi/payment/v1/starkbank/workspace/{WS}/purchases"
TOKEN = os.environ["VESTIAPI_TOKEN"].strip()


def fetch(cursor=None):
    url = URL + (f"?cursor={cursor}" if cursor else "")
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
        "User-Agent": "debug-alcance/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def brt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")) + timedelta(hours=-3)
    except Exception:
        return None


def main():
    all_purs = []
    cursor = None
    page = 0
    while True:
        page += 1
        resp = fetch(cursor)
        msg = resp.get("message") or {}
        purs = msg.get("purchases") or []
        all_purs.extend(purs)
        dates = [brt(p.get("created")) for p in purs]
        dates = [d for d in dates if d]
        rng = f"{min(dates).isoformat()} .. {max(dates).isoformat()}" if dates else "(vazio)"
        cursor = msg.get("cursor") or None
        print(f"[page {page}] n={len(purs):>4} range={rng} cursor_next={'sim' if cursor else 'NAO'}")
        if not cursor:
            break
        if page > 500:
            print("[warn] passou de 500 pages, abortando")
            break

    print(f"\n=== TOTAL: {len(all_purs)} purchases ===")
    # contagem por dia BRT
    by_day = Counter()
    by_day_status = Counter()
    for p in all_purs:
        d = brt(p.get("created"))
        if d:
            day = d.date().isoformat()
            by_day[day] += 1
            by_day_status[(day, p.get("status"))] += 1
    print("\nPor dia BRT:")
    for day in sorted(by_day):
        statuses = {s: c for (d, s), c in by_day_status.items() if d == day}
        print(f"  {day}: {by_day[day]:>4}  {statuses}")

    # salva cru
    with open("_debug_alcance.json", "w", encoding="utf-8") as f:
        json.dump({"total": len(all_purs), "purchases": all_purs}, f, ensure_ascii=False, indent=2)
    print("\n[write] _debug_alcance.json")


if __name__ == "__main__":
    main()
