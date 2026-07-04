"""
Market Terminal quote persistence — Neon only (Phase 2 Neon migration).

market_quotes/market_quote_runs are new tables that exist only in Neon: Yahoo Finance quotes
were fetched live per-request by frontend/app/lib/marketTerminal.js and never persisted
anywhere before this migration. Adding the equivalent tables to Supabase would be a production
schema change beyond what was asked for this sprint, so this script is intentionally
Neon-only — not a "dual-write" like cloud_pipeline.py / ingest_news.py / archive_factsheets.py.

Mirrors frontend/app/lib/marketTerminal.js's instrument list and fetch logic exactly (same
19 symbols, same Yahoo Finance public chart API, same honest "unlicensed, not a real-time feed"
framing) so the persisted history matches what the live terminal actually shows.

Requires DATABASE_URL. Exits 0 with a clear message if unset (expected until a Neon project
exists / secret is configured) — never hardcodes a connection string.

    DATABASE_URL=... python -m scripts.persist_market_quotes
"""
from __future__ import annotations

import sys
import time
import urllib.parse
import urllib.request
import json
from datetime import datetime, timezone

from ingestion import db as neon_db

UA = "Mozilla/5.0 (compatible; MFPulseTerminal/1.0; +https://mf-pulse.vercel.app)"

INSTRUMENTS = [
    {"group_name": "India", "name": "NIFTY 50", "symbol": "^NSEI"},
    {"group_name": "India", "name": "NIFTY Next 50", "symbol": "^NSMIDCP"},
    {"group_name": "India", "name": "NIFTY Midcap 150", "symbol": "NIFTYMIDCAP150.NS"},
    {"group_name": "India", "name": "NIFTY Smallcap 250", "symbol": "NIFTYSMLCAP250.NS"},
    {"group_name": "India", "name": "SENSEX", "symbol": "^BSESN"},
    {"group_name": "India", "name": "BANK NIFTY", "symbol": "^NSEBANK"},
    {"group_name": "India", "name": "India VIX", "symbol": "^INDIAVIX"},
    {"group_name": "Global", "name": "S&P 500", "symbol": "^GSPC"},
    {"group_name": "Global", "name": "NASDAQ", "symbol": "^IXIC"},
    {"group_name": "Global", "name": "Dow Jones", "symbol": "^DJI"},
    {"group_name": "Global", "name": "FTSE 100", "symbol": "^FTSE"},
    {"group_name": "Global", "name": "Nikkei 225", "symbol": "^N225"},
    {"group_name": "Global", "name": "Hang Seng", "symbol": "^HSI"},
    {"group_name": "Commodities", "name": "Gold", "symbol": "GC=F"},
    {"group_name": "Commodities", "name": "Silver", "symbol": "SI=F"},
    {"group_name": "Commodities", "name": "Brent Crude", "symbol": "BZ=F"},
    {"group_name": "Commodities", "name": "WTI Crude", "symbol": "CL=F"},
    {"group_name": "Currency", "name": "USD/INR", "symbol": "INR=X"},
    {"group_name": "Currency", "name": "EUR/INR", "symbol": "EURINR=X"},
]


def fetch_quote(instrument):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(instrument['symbol'])}?range=1d&interval=1d"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        meta = (data.get("chart", {}).get("result") or [{}])[0].get("meta")
        if not meta or meta.get("regularMarketPrice") is None:
            return None
        price = meta["regularMarketPrice"]
        prev_close = meta.get("chartPreviousClose", meta.get("previousClose"))
        change = price - prev_close if prev_close is not None else None
        change_pct = (change / prev_close * 100) if (change is not None and prev_close) else None
        quote_time = None
        if meta.get("regularMarketTime"):
            quote_time = datetime.fromtimestamp(meta["regularMarketTime"], tz=timezone.utc).isoformat()
        return {
            "symbol": instrument["symbol"],
            "name": instrument["name"],
            "group_name": instrument["group_name"],
            "price": price,
            "change": round(change, 2) if change is not None else None,
            "change_pct": round(change_pct, 2) if change_pct is not None else None,
            "currency": meta.get("currency"),
            "quote_time": quote_time,
        }
    except Exception:
        return None


def main() -> int:
    if not neon_db.neon_enabled():
        print("DATABASE_URL not set — Neon not configured yet, skipping market quote persistence.")
        return 0

    started = datetime.now(timezone.utc)
    quotes = []
    for instrument in INSTRUMENTS:
        q = fetch_quote(instrument)
        if q:
            quotes.append(q)
        time.sleep(0.2)  # light pacing across 19 requests to one public API

    status = "success" if quotes else "failed"
    try:
        with neon_db.connect() as conn:
            if quotes:
                neon_db.upsert(conn, "market_quotes", quotes)
            neon_db.upsert(conn, "market_quote_runs", [{
                "status": status,
                "requested": len(INSTRUMENTS),
                "received": len(quotes),
                "error": None if quotes else "no quotes returned",
                "started_at": started.isoformat(),
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }])
    except Exception as e:
        print(f"could not persist market quotes: {e}", file=sys.stderr)
        return 1

    print(f"market_quotes: {len(quotes)}/{len(INSTRUMENTS)} quotes persisted to Neon")
    return 0 if quotes else 1


if __name__ == "__main__":
    sys.exit(main())
