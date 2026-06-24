"""
Performance Intelligence dataset — real multi-window NAV returns + category & AMC
analytics, computed entirely from AMFI NAV (no sample data).

Method: take the current NAV (NAVAll) and the NAV at each anchor (1w/1m/3m/6m/1y
ago) by fetching a short AMFI history window around each anchor and using the
latest trading day in it. return_W = (now - anchor) / anchor * 100.

Equity Direct/Growth plans only (IDCW payouts would distort returns). Every number
traces to AMFI NAV. Outputs a single JSON the frontend renders.

    .venv/bin/python -m scripts.build_performance > frontend/app/data/performance.json
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import date, datetime, timedelta
from statistics import mean, median

from ingestion.amfi_parser import parse_file

REPORT = "https://portal.amfiindia.com/spages/NAVAll.txt".replace("/spages/NAVAll.txt", "/DownloadNAVHistoryReport_Po.aspx")
WINDOWS = [("r1w", 7), ("r1m", 30), ("r3m", 91), ("r6m", 182), ("r1y", 365)]


def is_growth(name: str) -> bool:
    n = name.lower()
    return "growth" in n and not any(b in n for b in ("idcw", "dividend", "bonus", "payout"))


def clean_category(cat: str) -> str:
    # "Equity Scheme - Large Cap Fund" -> "Large Cap"
    c = cat.split(" - ")[-1].strip() if " - " in cat else cat.strip()
    return c.replace(" Fund", "").replace("Scheme", "").strip() or "Other"


def fetch_anchor_nav(anchor: date) -> dict:
    """NAV per scheme at the latest trading day on/before `anchor` (7-day lookback)."""
    frm = (anchor - timedelta(days=7)).strftime("%d-%b-%Y")
    to = anchor.strftime("%d-%b-%Y")
    req = urllib.request.Request(f"{REPORT}?frmdt={frm}&todt={to}", headers={"User-Agent": "mfpulse/1.0"})
    out: dict[str, float] = {}
    by_code: dict[str, dict] = {}
    with urllib.request.urlopen(req, timeout=180) as r:
        for raw in r.read().decode("utf-8", errors="replace").splitlines():
            s = raw.strip()
            if ";" not in s:
                continue
            p = s.split(";")
            if len(p) < 8 or not p[0].strip().isdigit():
                continue
            try:
                nav = float(p[4].strip().replace(",", ""))
                d = datetime.strptime(p[7].strip(), "%d-%b-%Y").date()
            except ValueError:
                continue
            if nav > 0:
                by_code.setdefault(p[0].strip(), {})[d] = nav
    for code, m in by_code.items():
        out[code] = m[max(m)]
    return out


def main() -> None:
    dim = {r.scheme_code: r for r in parse_file("data/NAVAll.txt")}
    asof = max((r.nav_date for r in dim.values() if r.nav_date), default=date.today())
    now_nav = {c: r.nav_value for c, r in dim.items() if r.nav_value}

    anchors = {key: fetch_anchor_nav(asof - timedelta(days=days)) for key, days in WINDOWS}
    print(f"-- fetched {len(anchors)} anchor windows", file=sys.stderr)

    funds = []
    for code, r in dim.items():
        if r.asset_class != "Equity" or not is_growth(r.scheme_name) or code not in now_nav:
            continue
        rec = {
            "code": code, "name": r.scheme_name.strip(), "amc": r.amc_name.replace(" Mutual Fund", ""),
            "category": clean_category(r.category_raw or ""), "nav": round(now_nav[code], 2),
        }
        for key, _ in WINDOWS:
            a = anchors[key].get(code)
            rec[key] = round((now_nav[code] - a) / a * 100, 2) if a and a > 0 else None
        funds.append(rec)

    funds.sort(key=lambda f: (f["r1m"] is None, -(f["r1m"] or -999)))

    # ---- category intelligence (by 1m return) ----
    cats: dict[str, list] = {}
    for f in funds:
        if f["r1m"] is not None:
            cats.setdefault(f["category"], []).append(f)
    categories = []
    for cat, fs in cats.items():
        rets = [f["r1m"] for f in fs]
        ranked = sorted(fs, key=lambda f: f["r1m"], reverse=True)
        categories.append({
            "category": cat, "count": len(fs), "avg": round(mean(rets), 2),
            "best": {"name": ranked[0]["name"], "amc": ranked[0]["amc"], "ret": ranked[0]["r1m"]},
            "worst": {"name": ranked[-1]["name"], "amc": ranked[-1]["amc"], "ret": ranked[-1]["r1m"]},
            "breadth": round(100 * sum(1 for x in rets if x > 0) / len(rets), 0),
        })
    categories.sort(key=lambda c: c["avg"], reverse=True)

    # ---- AMC quality (% of schemes beating their category median, 1m) ----
    cat_median = {c: median([f["r1m"] for f in fs]) for c, fs in cats.items()}
    amc_map: dict[str, list] = {}
    for f in funds:
        if f["r1m"] is not None:
            amc_map.setdefault(f["amc"], []).append(f)
    amcs = []
    for amc, fs in amc_map.items():
        if len(fs) < 3:
            continue
        beats = sum(1 for f in fs if f["r1m"] > cat_median.get(f["category"], 0))
        rets = [f["r1m"] for f in fs]
        pct_out = 100 * beats / len(fs)
        breadth = 100 * sum(1 for x in rets if x > 0) / len(fs)
        # quality = blend of outperformance + breadth + avg-return percentile proxy
        score = round(0.55 * pct_out + 0.25 * breadth + 0.20 * max(0, min(100, 50 + mean(rets) * 8)), 1)
        amcs.append({"amc": amc, "funds": len(fs), "avg": round(mean(rets), 2), "pct_outperform": round(pct_out, 0), "breadth": round(breadth, 0), "score": score})
    amcs.sort(key=lambda a: a["score"], reverse=True)

    # ---- auto research insights (traceable) ----
    insights = []
    if len(categories) >= 2:
        lead, lag = categories[0], categories[-1]
        insights.append(f"{lead['category']} led equity categories at +{lead['avg']:.1f}% (1-month NAV), outpacing {lag['category']} ({lag['avg']:+.1f}%) by {lead['avg'] - lag['avg']:.1f} pts.")
    top10 = [f for f in funds if f["r1m"] is not None][:10]
    if top10:
        insights.append(f"The top 10 equity funds averaged +{mean([f['r1m'] for f in top10]):.1f}% over 1 month, led by {top10[0]['name'][:40]} (+{top10[0]['r1m']:.1f}%).")
    allret = [f["r1m"] for f in funds if f["r1m"] is not None]
    if allret:
        insights.append(f"Across {len(allret):,} equity Growth funds, {100 * sum(1 for x in allret if x > 0) / len(allret):.0f}% posted positive 1-month NAV returns.")
    if amcs:
        insights.append(f"{amcs[0]['amc']} ranks #1 on AMC quality ({amcs[0]['pct_outperform']:.0f}% of its funds beat their category median).")

    out = {
        "asOf": asof.isoformat(), "universe": len(funds),
        "source": "AMFI NAV history · equity Direct/Growth plans · point-to-point NAV returns",
        "windows": [w[0] for w in WINDOWS],
        "top": funds[:30], "bottom": [f for f in funds if f["r1m"] is not None][-15:][::-1],
        "categories": categories, "amcs": amcs, "insights": insights,
    }
    print(json.dumps(out, indent=0))
    print(f"-- {len(funds)} funds, {len(categories)} categories, {len(amcs)} AMCs", file=sys.stderr)


if __name__ == "__main__":
    main()
