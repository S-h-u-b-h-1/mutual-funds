"""
Real daily index history for Nifty 50 / Sensex (Phase 5 — institutional data-depth sprint).
Enables genuine Beta/Alpha/Information Ratio for the ~227 funds whose benchmark is exactly
"NIFTY 50 TRI" or "S&P BSE SENSEX TRI" — previously impossible ("Index-return comparison needs
an index NAV series we don't ingest yet", per benchmark/[slug]/page.js).

HONEST LIMITATION, stated plainly because it matters for anyone using the resulting numbers:
Yahoo Finance's ^NSEI / ^BSESN are PRICE indices (no dividend reinvestment), not the Total
Return Index (TRI) variants funds are actually benchmarked against. TRI compounds faster than
the price index (dividends are reinvested), so Beta/Alpha computed against this series will run
a few points off a true TRI-based figure — usually alpha reads slightly HIGH relative to what a
true TRI comparison would show, since the price index is a slightly easier bar to beat. This is
disclosed everywhere the resulting numbers are shown; never presented as the fund's official
factsheet alpha/beta.

No free, real TRI series is available without a paid NSE/BSE data subscription — using the price
index and disclosing the gap is the honest choice here, not silently guessing a TRI value.

Usage: .venv/bin/python -m scripts.fetch_index_history
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

UA = "Mozilla/5.0 (compatible; MFPulseIndexBot/1.0; +https://mf-pulse.vercel.app)"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "frontend/app/data/index_history.json")

INDICES = {
    "NIFTY 50 TRI": {
        "yahoo_symbol": "^NSEI",
        "actual_series": "NIFTY 50 (price index, NOT the TRI variant funds are benchmarked to)",
    },
    "S&P BSE SENSEX TRI": {
        "yahoo_symbol": "^BSESN",
        "actual_series": "S&P BSE SENSEX (price index, NOT the TRI variant funds are benchmarked to)",
    },
}


def fetch_series(symbol, range_="5y"):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range_}&interval=1d"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    result = data["chart"]["result"][0]
    ts = result["timestamp"]
    closes = result["indicators"]["quote"][0]["close"]
    points = []
    for t, c in zip(ts, closes):
        if c is None:
            continue
        d = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
        points.append({"t": d, "v": round(c, 4)})
    return points


def main():
    out = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Yahoo Finance chart API (query1.finance.yahoo.com)",
        "methodology_caveat": (
            "Series are PRICE indices, not the Total Return Index (TRI) variants funds are "
            "actually benchmarked against — no free real TRI series exists. Beta/Alpha computed "
            "from this data will differ from a true TRI-based figure; always disclosed alongside "
            "any number derived from it."
        ),
        "indices": {},
    }
    for benchmark_name, cfg in INDICES.items():
        try:
            points = fetch_series(cfg["yahoo_symbol"])
            out["indices"][benchmark_name] = {
                "yahoo_symbol": cfg["yahoo_symbol"],
                "actual_series": cfg["actual_series"],
                "points": points,
            }
            print(f"{benchmark_name}: {len(points)} real daily closes ({cfg['yahoo_symbol']})")
        except Exception as e:
            print(f"  ! {benchmark_name}: {e}", file=sys.stderr)
        time.sleep(1)  # light, polite fetcher

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), indent=None)
    print(f"-- wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
