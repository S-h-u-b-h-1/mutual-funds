"""
Market-universe + analytical-readiness audit (CDO mission).

Answers: how many schemes exist, how many are active/investor-accessible, how many MF Pulse
can actually ANALYZE (trend / risk / research / institutional), and where the gaps are.
Computed from real data only: AMFI NAVAll (universe), funds.json (analytical layer),
metadata.json (factsheet metadata), and the MFAPI scheme list (reconciliation).

    .venv/bin/python -m scripts.coverage_audit
"""

from __future__ import annotations

import json
import urllib.request
from collections import Counter
from datetime import date, datetime

from ingestion.amfi_parser import parse_file


def is_growth(n): n = n.lower(); return "growth" in n and not any(b in n for b in ("idcw", "dividend", "bonus", "payout"))
def is_idcw(n): n = n.lower(); return any(b in n for b in ("idcw", "dividend", "bonus", "payout"))
def is_etf(n): n = n.lower(); return "etf" in n or "exchange traded" in n
def is_fof(n): n = n.lower(); return "fund of fund" in n or "fof" in n
def pct(a, b): return round(100 * a / b, 1) if b else 0.0


def mfapi_count():
    try:
        req = urllib.request.Request("https://api.mfapi.in/mf", headers={"User-Agent": "mfpulse/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return len(json.load(r))
    except Exception:
        return None


def main():
    dim = list(parse_file("data/NAVAll.txt"))
    asof = max((r.nav_date for r in dim if r.nav_date), default=date.today())
    funds = json.load(open("frontend/app/data/funds.json"))["funds"]
    meta = json.load(open("frontend/app/data/metadata.json"))["metadata"]
    meta_codes = {str(m["scheme_code"]) for m in meta}
    meta_port = {str(m["scheme_code"]) for m in meta if m.get("holdings") or m.get("sector_allocation")}

    total = len(dim)
    active = [r for r in dim if r.nav_date and (asof - r.nav_date).days <= 7]
    universe = {
        "amfi_total": total,
        "mfapi_total": mfapi_count(),
        "factsheet_total": len({m["scheme_name"].split(" - ")[0] for m in meta}),
        "mfpulse_analytical": len(funds),
        "active": len(active),
        "etf": sum(1 for r in dim if is_etf(r.scheme_name)),
        "fof": sum(1 for r in dim if is_fof(r.scheme_name)),
        "direct": sum(1 for r in dim if "direct" in r.scheme_name.lower()),
        "growth": sum(1 for r in dim if is_growth(r.scheme_name)),
        "idcw": sum(1 for r in dim if is_idcw(r.scheme_name)),
        "active_direct_growth": sum(1 for r in active if "direct" in r.scheme_name.lower() and is_growth(r.scheme_name)),
        "active_regular_growth": sum(1 for r in active if "direct" not in r.scheme_name.lower() and is_growth(r.scheme_name)),
        "active_idcw": sum(1 for r in active if is_idcw(r.scheme_name)),
        "amcs": len({r.amc_name for r in dim}),
        "categories": len({r.category_raw for r in dim}),
    }

    # ---- analytical readiness over the ACTIVE investor universe ----
    buckets = Counter()
    flags = Counter()
    missing_meta_by_amc = Counter()
    missing_1y_by_cat = Counter()
    for r in active:
        f = funds.get(r.scheme_code)
        has_latest = True
        has90 = bool(f and f.get("r3m") is not None)
        has1y = bool(f and f.get("r1y") is not None)
        has3y = bool(f and f.get("r3y") is not None)
        risk = bool(f and f.get("vol90") is not None)
        bench = bool(f and f.get("benchmark")) or r.scheme_code in meta_codes
        md = r.scheme_code in meta_codes
        port = r.scheme_code in meta_port
        if has_latest: flags["latest"] += 1
        if has90: flags["d90"] += 1
        if has1y: flags["y1"] += 1
        if has3y: flags["y3"] += 1
        if risk: flags["risk"] += 1
        if bench: flags["benchmark"] += 1
        if md: flags["metadata"] += 1
        if port: flags["portfolio"] += 1
        # classify
        if has1y and risk and bench:
            buckets["FULLY"] += 1
        elif has90 and risk:
            buckets["PARTIALLY"] += 1
        elif has_latest:
            buckets["MINIMALLY"] += 1
        else:
            buckets["UNANALYZABLE"] += 1
        # gaps
        if not md and is_growth(r.scheme_name):
            missing_meta_by_amc[r.amc_name.replace(" Mutual Fund", "")] += 1
        if not has1y:
            cat = (r.category_raw or "Other").split(" - ")[-1].replace(" Fund", "").strip()
            missing_1y_by_cat[cat] += 1

    na = max(1, len(active))
    coverage = {
        "universe": pct(len(active), total),                 # active share of total
        "nav": pct(flags["latest"], na),
        "performance": pct(flags["d90"], na),
        "trend": pct(flags["d90"], na),
        "risk": pct(flags["risk"], na),
        "research": pct(flags["y1"], na),
        "institutional": pct(flags["y3"], na),
        "benchmark": pct(flags["benchmark"], na),
        "metadata": pct(flags["metadata"], na),
        "portfolio": pct(flags["portfolio"], na),
    }
    # weighted MF Pulse Coverage Score (first-spec weights)
    score = round(
        0.30 * coverage["universe"] + 0.20 * coverage["nav"] + 0.15 * coverage["performance"]
        + 0.15 * coverage["trend"] + 0.10 * coverage["risk"] + 0.10 * coverage["metadata"], 1)

    top_missing_amcs = missing_meta_by_amc.most_common(10)
    top_missing_cats = missing_1y_by_cat.most_common(8)

    out = {"asof": asof.isoformat(), "universe": universe, "buckets": dict(buckets),
           "flags": dict(flags), "coverage": coverage, "score": score,
           "top_missing_amcs": top_missing_amcs, "top_missing_cats": top_missing_cats}
    print(json.dumps(out, indent=2))

    # ---- markdown ----
    md_lines = [
        "# MF Pulse — Market Universe & Analytical Readiness Audit",
        f"\n_As of {asof}. Computed from AMFI NAVAll, funds.json (analytical layer), metadata.json, and MFAPI._\n",
        "## Phase 1 — Market universe",
        "| Source | Schemes |", "|---|---|",
        f"| AMFI (NAVAll) | **{universe['amfi_total']:,}** |",
        f"| MFAPI | {universe['mfapi_total'] if universe['mfapi_total'] else '—':,} |".replace("'—':,", "—"),
        f"| AMC factsheets ingested | {universe['factsheet_total']} funds |",
        f"| MF Pulse analytical store | {universe['mfpulse_analytical']:,} |",
        f"\n- Active (NAV ≤7d): **{universe['active']:,}** · AMCs {universe['amcs']} · categories {universe['categories']}",
        f"- Active Direct Growth: **{universe['active_direct_growth']:,}** · Active Regular Growth: {universe['active_regular_growth']:,} · Active IDCW: {universe['active_idcw']:,}",
        f"- ETF: {universe['etf']} · Fund-of-Funds: {universe['fof']} · Direct plans: {universe['direct']:,} · Growth: {universe['growth']:,} · IDCW: {universe['idcw']:,}\n",
        "## Phase 2 — Analytical readiness (of active universe)",
        "| Class | Count | % of active |", "|---|---|---|",
        f"| FULLY ANALYZABLE (1Y + risk + benchmark) | {buckets['FULLY']:,} | {pct(buckets['FULLY'], na)}% |",
        f"| PARTIALLY (90D + risk) | {buckets['PARTIALLY']:,} | {pct(buckets['PARTIALLY'], na)}% |",
        f"| MINIMALLY (latest NAV only) | {buckets['MINIMALLY']:,} | {pct(buckets['MINIMALLY'], na)}% |",
        f"| UNANALYZABLE | {buckets['UNANALYZABLE']:,} | {pct(buckets['UNANALYZABLE'], na)}% |\n",
        "## Phase 3 — Coverage score",
        "| Dimension | % of active |", "|---|---|",
        f"| Universe (active/total) | {coverage['universe']}% |",
        f"| NAV | {coverage['nav']}% |",
        f"| Performance (90D) | {coverage['performance']}% |",
        f"| Trend-ready (90D+) | {coverage['trend']}% |",
        f"| Risk-ready (vol/drawdown) | {coverage['risk']}% |",
        f"| Research-ready (1Y) | {coverage['research']}% |",
        f"| Institutional-ready (3Y) | {coverage['institutional']}% |",
        f"| Benchmark | {coverage['benchmark']}% |",
        f"| Metadata (factsheet) | {coverage['metadata']}% |",
        f"| Portfolio (holdings/sectors) | {coverage['portfolio']}% |",
        f"\n### **MF Pulse Coverage Score: {score}/100**\n",
        "## Phase 4 — Top gaps",
        "**Missing metadata — top AMCs (active Growth schemes without factsheet data):**",
        "| AMC | schemes |", "|---|---|",
    ]
    for a, c in top_missing_amcs:
        md_lines.append(f"| {a} | {c} |")
    md_lines += ["\n**Missing 1Y history — by category:**", "| Category | schemes |", "|---|---|"]
    for c, n in top_missing_cats:
        md_lines.append(f"| {c} | {n} |")
    md_lines += [
        "\n## Phase 5 — AMC integration ROI",
        "Ranked by active Growth schemes currently lacking metadata (largest coverage lift per integration):",
        ", ".join(f"{a} ({c})" for a, c in top_missing_amcs[:6]),
        "\n## Phase 6 — Remediation",
        "- **Automatable now:** activate the daily NAV cron → accrues history so 3Y/5Y coverage rises over time; factsheet pipeline (monthly cron) expands metadata as per-AMC parsers land.",
        "- **Blocked:** Tier-1 (HDFC/ICICI/Nippon) metadata needs positional PDF parsing on a Py3.13 worker (consolidated layouts) — see AMC_EXPANSION_PLAN.md. Real monthly flows remain SEBI-PDF-only.",
    ]
    open("docs/MARKET_UNIVERSE_AUDIT.md", "w").write("\n".join(md_lines))


if __name__ == "__main__":
    main()
