"""
Daily "what changed since yesterday" bundle (Phase 1 / retention digest).

Real 1-day NAV movers (r1d) + today's leaders + any deterministic insights accrued by the
daily-intelligence engine. Written to frontend/app/data/daily.json for the homepage. No
fabrication — movers are real 1-day NAV returns.

    .venv/bin/python -m scripts.build_daily
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from statistics import mean

WH = "data/warehouse"


def slim(f):
    return {"code": f["code"], "name": f["name"], "amc": f["amc"], "category": f["category"],
            "r1d": f.get("r1d"), "r1m": f.get("r1m")}


def main():
    d = json.load(open("frontend/app/data/funds.json"))
    funds = list(d["funds"].values())
    asof = d["asOf"]
    eq = [f for f in funds if f.get("assetClass") == "Equity" and f.get("isGrowth") and not f.get("isIdcw") and f.get("r1d") is not None]
    eq.sort(key=lambda f: f["r1d"], reverse=True)
    r1ds = [f["r1d"] for f in eq]

    by_cat, by_amc = defaultdict(list), defaultdict(list)
    for f in eq:
        if f.get("r1m") is not None:
            by_cat[f["category"]].append(f["r1m"])
            by_amc[f["amc"]].append(f["r1m"])
    top_cat = max(by_cat.items(), key=lambda kv: mean(kv[1]))[0] if by_cat else None
    top_amc = max(((a, v) for a, v in by_amc.items() if len(v) >= 3), key=lambda kv: mean(kv[1]), default=(None, []))[0]
    top_fund = max((f for f in eq if f.get("r1m") is not None), key=lambda f: f["r1m"], default=None)

    # accrued deterministic insights (from the daily-intelligence engine), latest day only
    insights = []
    p = f"{WH}/intelligence.jsonl"
    if os.path.exists(p):
        rows = [json.loads(l) for l in open(p) if l.strip()]
        if rows:
            latest = max(r["intelligence_date"] for r in rows)
            insights = [{"type": r["intelligence_type"], "title": r["title"], "summary": r["summary"], "severity": r["severity"]}
                        for r in rows if r["intelligence_date"] == latest][:8]

    out = {
        "asOf": asof,
        "advancers": sum(1 for x in r1ds if x > 0), "decliners": sum(1 for x in r1ds if x < 0),
        "breadth1d": round(100 * sum(1 for x in r1ds if x > 0) / len(r1ds)) if r1ds else None,
        "gainers": [slim(f) for f in eq[:6]],
        "fallers": [slim(f) for f in eq[-6:][::-1]],
        "topFund": slim(top_fund) if top_fund else None,
        "topCategory": top_cat, "topAmc": top_amc,
        "insights": insights,
    }
    with open("frontend/app/data/daily.json", "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"-- daily.json: {out['advancers']} up / {out['decliners']} down (breadth {out['breadth1d']}%), "
          f"{len(insights)} accrued insights")


if __name__ == "__main__":
    main()
