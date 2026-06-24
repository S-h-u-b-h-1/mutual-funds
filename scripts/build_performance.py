"""
Scheme-level performance intelligence from real AMFI NAV.

Builds TWO bundles, all traceable to AMFI NAV (no sample data):
  frontend/app/data/performance.json  — equity-Growth summaries (home/performance/categories)
  frontend/app/data/funds.json        — every scheme: returns, category rank/percentile,
                                        trend, quality flags + a coverage report

Returns are point-to-point NAV: return_W = (now - nav_W_ago) / nav_W_ago * 100, using the
latest trading day in a short window around each anchor. Direct vs Regular are kept in
separate peer cohorts; IDCW plans are flagged (payouts distort NAV returns).

    .venv/bin/python -m scripts.build_performance
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import date, datetime, timedelta
from statistics import mean, median, pstdev

from ingestion.amfi_parser import parse_file

REPORT = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx"
WINDOWS = [("r1d", 1), ("r1w", 7), ("r1m", 30), ("r3m", 91), ("r6m", 182), ("r1y", 365)]
DATA = "frontend/app/data"


def is_growth(n):
    n = n.lower()
    return "growth" in n and not any(b in n for b in ("idcw", "dividend", "bonus", "payout"))


def is_idcw(n):
    n = n.lower()
    return any(b in n for b in ("idcw", "dividend", "bonus", "payout"))


def clean_category(cat):
    c = cat.split(" - ")[-1].strip() if " - " in cat else cat.strip()
    return c.replace(" Fund", "").replace("Scheme", "").strip() or "Other"


def fetch_anchor_nav(anchor):
    frm = (anchor - timedelta(days=7)).strftime("%d-%b-%Y")
    to = anchor.strftime("%d-%b-%Y")
    req = urllib.request.Request(f"{REPORT}?frmdt={frm}&todt={to}", headers={"User-Agent": "mfpulse/1.0"})
    by_code = {}
    with urllib.request.urlopen(req, timeout=180) as r:
        for raw in r.read().decode("utf-8", errors="replace").splitlines():
            p = raw.strip().split(";")
            if len(p) < 8 or not p[0].strip().isdigit():
                continue
            try:
                nav = float(p[4].strip().replace(",", ""))
                d = datetime.strptime(p[7].strip(), "%d-%b-%Y").date()
            except ValueError:
                continue
            if nav > 0:
                by_code.setdefault(p[0].strip(), {})[d] = nav
    return {c: m[max(m)] for c, m in by_code.items()}


def main():
    dim = {r.scheme_code: r for r in parse_file("data/NAVAll.txt")}
    asof = max((r.nav_date for r in dim.values() if r.nav_date), default=date.today())
    now_nav = {c: r.nav_value for c, r in dim.items() if r.nav_value}

    anchors = {key: fetch_anchor_nav(asof - timedelta(days=days)) for key, days in WINDOWS}
    print(f"-- fetched {len(anchors)} anchor windows", file=sys.stderr)

    # ---------- per-scheme record ----------
    funds = {}
    for code, r in dim.items():
        if code not in now_nav:
            continue
        name = r.scheme_name.strip()
        idcw, grow, direct = is_idcw(name), is_growth(name), "direct" in name.lower()
        stale_days = (asof - r.nav_date).days if r.nav_date else 999
        rec = {
            "code": code, "name": name, "amc": r.amc_name.replace(" Mutual Fund", ""),
            "category": clean_category(r.category_raw or ""), "assetClass": r.asset_class,
            "plan": "Direct" if direct else "Regular",
            "option": "Growth" if grow else ("IDCW" if idcw else "Other"),
            "isDirect": direct, "isGrowth": grow, "isIdcw": idcw,
            "active": stale_days <= 7, "nav": round(now_nav[code], 4),
            "navDate": r.nav_date.isoformat() if r.nav_date else None, "staleDays": stale_days,
        }
        for key, _ in WINDOWS:
            a = anchors[key].get(code)
            rec[key] = round((now_nav[code] - a) / a * 100, 2) if a and a > 0 else None
        funds[code] = rec

    # ---------- category rank / percentile within (category, plan) growth cohorts ----------
    cohort_members = {}
    for f in funds.values():
        if f["isGrowth"] and not f["isIdcw"] and f["r1m"] is not None and f["assetClass"] == "Equity":
            cohort_members.setdefault(f"{f['category']}|{'D' if f['isDirect'] else 'R'}", []).append(f)
    cohorts = {}
    for key, members in cohort_members.items():
        ranked = sorted(members, key=lambda x: x["r1m"], reverse=True)
        n = len(ranked)
        for i, f in enumerate(ranked):
            f["catRank"], f["catSize"] = i + 1, n
            f["catPct"] = round(100 * (1 - i / n)) if n > 1 else 100
            f["cohortKey"] = key
        rets = [x["r1m"] for x in ranked]
        cohorts[key] = {
            "avg": round(mean(rets), 2), "count": n,
            "best": {"code": ranked[0]["code"], "name": ranked[0]["name"], "ret": ranked[0]["r1m"]},
            "worst": {"code": ranked[-1]["code"], "name": ranked[-1]["name"], "ret": ranked[-1]["r1m"]},
        }

    # ---------- trend score + quality ----------
    for f in funds.values():
        r1m, r3m = f["r1m"], f["r3m"]
        if r1m is not None and r3m is not None:
            f["trend"] = max(0, min(100, round(50 + (r1m - r3m / 3) * 4)))
        elif r1m is not None:
            f["trend"] = max(0, min(100, round(50 + r1m * 3)))
        else:
            f["trend"] = None
        has_latest = f["staleDays"] == 0
        status = "ok" if (has_latest and f["r3m"] is not None) else ("stale" if not has_latest else "limited")
        f["quality"] = {
            "status": status, "hasLatest": has_latest, "has90d": f["r3m"] is not None,
            "has1y": f["r1y"] is not None, "staleDays": f["staleDays"],
            "hasCategory": f["category"] != "Other", "hasAmc": bool(f["amc"]),
        }

    # ---------- coverage report ----------
    vals = list(funds.values())
    coverage = {
        "total": len(dim), "priced": len(vals),
        "active": sum(1 for f in vals if f["active"]),
        "with30d": sum(1 for f in vals if f["r1m"] is not None),
        "with90d": sum(1 for f in vals if f["r3m"] is not None),
        "with1y": sum(1 for f in vals if f["r1y"] is not None),
        "missingLatest": sum(1 for f in vals if f["staleDays"] != 0),
        "stale7d": sum(1 for f in vals if f["staleDays"] > 7),
        "equity": sum(1 for f in vals if f["assetClass"] == "Equity"),
        "directGrowth": sum(1 for f in vals if f["isDirect"] and f["isGrowth"]),
        "growth": sum(1 for f in vals if f["isGrowth"]),
        "idcw": sum(1 for f in vals if f["isIdcw"]),
        "direct": sum(1 for f in vals if f["isDirect"]),
        "noCategory": sum(1 for f in vals if f["category"] == "Other"),
        "coveragePct": round(100 * sum(1 for f in vals if f["r3m"] is not None) / max(1, len(vals))),
    }

    # Keep the bundle lean + server-only: funds that are active or have ≥30d history.
    keep = {c: f for c, f in funds.items() if f["r1m"] is not None or f["active"]}
    with open(f"{DATA}/funds.json", "w") as fh:
        json.dump({"asOf": asof.isoformat(), "source": "AMFI NAV + NAV history",
                   "coverage": coverage, "cohorts": cohorts, "funds": keep}, fh, separators=(",", ":"))

    # ---------- performance.json (equity-Growth summaries, existing consumers) ----------
    eq = sorted([f for f in vals if f["assetClass"] == "Equity" and f["isGrowth"] and not f["isIdcw"] and f["r1m"] is not None],
                key=lambda f: f["r1m"], reverse=True)
    cats = {}
    for f in eq:
        cats.setdefault(f["category"], []).append(f)
    categories = []
    for cat, fs in cats.items():
        rets = [f["r1m"] for f in fs]
        ranked = sorted(fs, key=lambda f: f["r1m"], reverse=True)
        categories.append({"category": cat, "count": len(fs), "avg": round(mean(rets), 2),
                           "best": {"name": ranked[0]["name"], "amc": ranked[0]["amc"], "ret": ranked[0]["r1m"], "code": ranked[0]["code"]},
                           "worst": {"name": ranked[-1]["name"], "amc": ranked[-1]["amc"], "ret": ranked[-1]["r1m"], "code": ranked[-1]["code"]},
                           "breadth": round(100 * sum(1 for x in rets if x > 0) / len(rets))})
    categories.sort(key=lambda c: c["avg"], reverse=True)

    cat_median = {c: median([f["r1m"] for f in fs]) for c, fs in cats.items()}
    amc_map = {}
    for f in eq:
        amc_map.setdefault(f["amc"], []).append(f)
    amcs = []
    for amc, fs in amc_map.items():
        if len(fs) < 3:
            continue
        rets = [f["r1m"] for f in fs]
        pct_out = 100 * sum(1 for f in fs if f["r1m"] > cat_median.get(f["category"], 0)) / len(fs)
        breadth = 100 * sum(1 for x in rets if x > 0) / len(fs)
        score = round(0.55 * pct_out + 0.25 * breadth + 0.20 * max(0, min(100, 50 + mean(rets) * 8)), 1)
        amcs.append({"amc": amc, "funds": len(fs), "avg": round(mean(rets), 2),
                    "pct_outperform": round(pct_out), "breadth": round(breadth), "score": score})
    amcs.sort(key=lambda a: a["score"], reverse=True)

    insights = []
    if len(categories) >= 2:
        lead, lag = categories[0], categories[-1]
        insights.append(f"{lead['category']} led equity categories at +{lead['avg']:.1f}% (1-month NAV), outpacing {lag['category']} ({lag['avg']:+.1f}%) by {lead['avg'] - lag['avg']:.1f} pts.")
    if eq[:10]:
        insights.append(f"The top 10 equity funds averaged +{mean([f['r1m'] for f in eq[:10]]):.1f}% over 1 month, led by {eq[0]['name'][:40]} (+{eq[0]['r1m']:.1f}%).")
    allret = [f["r1m"] for f in eq]
    if allret:
        insights.append(f"Across {len(allret):,} equity Growth funds, {100 * sum(1 for x in allret if x > 0) / len(allret):.0f}% posted positive 1-month NAV returns.")
    if amcs:
        insights.append(f"{amcs[0]['amc']} ranks #1 on AMC quality ({amcs[0]['pct_outperform']:.0f}% of its funds beat their category median).")

    def slim(f):
        return {"code": f["code"], "name": f["name"], "amc": f["amc"], "category": f["category"], "nav": f["nav"],
                "r1w": f["r1w"], "r1m": f["r1m"], "r3m": f["r3m"], "r6m": f["r6m"], "r1y": f["r1y"]}

    with open(f"{DATA}/performance.json", "w") as fh:
        json.dump({"asOf": asof.isoformat(), "universe": len(eq),
                   "source": "AMFI NAV history · equity Direct/Growth plans · point-to-point NAV returns",
                   "windows": ["r1w", "r1m", "r3m", "r6m", "r1y"],
                   "top": [slim(f) for f in eq[:30]], "bottom": [slim(f) for f in eq[-15:][::-1]],
                   "categories": categories, "amcs": amcs, "insights": insights}, fh, indent=0)

    print(f"-- funds.json: {len(funds)} schemes | coverage {coverage['coveragePct']}% 90d | "
          f"{coverage['directGrowth']} direct-growth | {len(cohorts)} cohorts", file=sys.stderr)


if __name__ == "__main__":
    main()
