"""
Coverage reconciliation — make EVERY AMFI scheme routable/openable.

Problem this fixes (Search & Coverage audit, 2026-06-26):
  Search queries Supabase dim_scheme (14,224 schemes) but the fund detail route
  /fund/[code] resolves only from funds.json, which build_performance.py trimmed
  to schemes with a 1-month return OR a <=7d-fresh NAV (8,579). The other 5,645
  schemes were searchable but 404'd on click — a silent discoverability hole.

What this does (no network, deterministic, no fabricated numbers):
  - keeps every existing funds.json record verbatim (real returns/risk preserved)
  - adds an identity-only record for every remaining AMFI scheme so the route
    resolves: name, AMC, category, asset class, plan/option, last NAV + date,
    staleness, benchmark. ALL return/risk fields stay null (never invented).
  - tags each added record honestly: status = unpriced | dormant | stale.
  - recomputes coverage with the openable/searchable invariant recorded.

Run AFTER build_performance.py (it consumes that file + data/NAVAll.txt):
    .venv/bin/python -m scripts.reconcile_coverage
"""

from __future__ import annotations

import json
from datetime import date

from ingestion.amfi_parser import parse_file
from ingestion.benchmarks import resolve_benchmark

DATA = "frontend/app/data/funds.json"
SOURCE = "data/NAVAll.txt"
DORMANT_DAYS = 365  # > 1 year without a fresh NAV → treated as dormant/wound-up


def is_idcw(n: str) -> bool:
    n = n.lower()
    return any(b in n for b in ("idcw", "dividend", "bonus", "payout"))


def is_growth(n: str) -> bool:
    n = n.lower()
    return "growth" in n and not is_idcw(n)


def clean_category(cat: str) -> str:
    c = cat.split(" - ")[-1].strip() if " - " in cat else cat.strip()
    return c.replace(" Fund", "").replace("Scheme", "").strip() or "Other"


def structure_of(scheme_type: str) -> str:
    t = (scheme_type or "").lower()
    if "close" in t:
        return "Closed-Ended"
    if "interval" in t:
        return "Interval"
    if "open" in t:
        return "Open-Ended"
    return None


def isin_of(r) -> str:
    return r.isin_growth or r.isin_reinvest or None


def main() -> None:
    bundle = json.load(open(DATA))
    funds = bundle["funds"]
    asof = date.fromisoformat(bundle["asOf"])
    before = len(funds)

    dim = {r.scheme_code: r for r in parse_file(SOURCE)}

    added = {"unpriced": 0, "dormant": 0, "stale": 0}
    for code, r in dim.items():
        if code in funds:
            continue  # already routable with real metrics — leave untouched
        name = r.scheme_name.strip()
        idcw, grow, direct = is_idcw(name), is_growth(name), "direct" in name.lower()
        nav = round(r.nav_value, 4) if r.nav_value else None
        stale_days = (asof - r.nav_date).days if r.nav_date else None
        if nav is None:
            status = "unpriced"
        elif stale_days is not None and stale_days > DORMANT_DAYS:
            status = "dormant"
        else:
            status = "stale"
        added[status] += 1
        bm, std = resolve_benchmark(clean_category(r.category_raw or ""), name, r.asset_class)
        cat = clean_category(r.category_raw or "")
        funds[code] = {
            "code": code, "name": name, "amc": r.amc_name.replace(" Mutual Fund", ""),
            "category": cat, "assetClass": r.asset_class,
            "plan": "Direct" if direct else "Regular",
            "option": "Growth" if grow else ("IDCW" if idcw else "Other"),
            "isDirect": direct, "isGrowth": grow, "isIdcw": idcw, "active": False,
            "nav": nav, "navDate": r.nav_date.isoformat() if r.nav_date else None,
            "staleDays": stale_days if stale_days is not None else 9999,
            "r1d": None, "r1w": None, "r1m": None, "r3m": None, "r6m": None,
            "r1y": None, "r3y": None, "r5y": None,
            "benchmark": bm or None, "benchmarkStd": std if bm else None, "trend": None,
            "isin": isin_of(r), "structure": structure_of(r.scheme_type),
            "quality": {
                "status": status, "hasLatest": False, "has90d": False, "has1y": False,
                "staleDays": stale_days if stale_days is not None else 9999,
                "hasCategory": cat != "Other", "hasAmc": bool(r.amc_name), "obs": 0,
            },
        }

    # Universe-wide identity enrichment from AMFI (zero fabrication): ISIN + scheme structure.
    # Backfills every record — including the ones build_performance produced — idempotently.
    # Also re-resolves benchmark with the improved SEBI-standard + index-name resolver.
    enriched = 0
    bench_filled = 0
    for code, f in funds.items():
        r = dim.get(code)
        if not r:
            continue
        if f.get("isin") is None and isin_of(r):
            f["isin"] = isin_of(r); enriched += 1
        if f.get("structure") is None and structure_of(r.scheme_type):
            f["structure"] = structure_of(r.scheme_type)
        # Re-resolve benchmark for every fund so the corrected resolver applies uniformly
        # (fixes any earlier over-assignment; deterministic, same result for already-correct ones).
        bm, std = resolve_benchmark(f.get("category") or "", f.get("name") or "", f.get("assetClass") or "")
        had = bool(f.get("benchmark"))
        f["benchmark"], f["benchmarkStd"] = (bm or None), (std if bm else None)
        if bm and not had:
            bench_filled += 1
    print(f"reconcile: enriched ISIN/structure on {enriched} records; benchmark filled on {bench_filled}")

    vals = list(funds.values())
    cov = bundle.get("coverage", {})
    # Discoverability invariant: every searchable scheme (= AMFI source) is now routable.
    cov.update({
        "total": len(dim),
        "openable": len(funds),
        "searchable": len(dim),
        "routablePct": round(100 * len(funds) / max(1, len(dim))),
        "dormant": sum(1 for f in vals if f["quality"]["status"] == "dormant"),
        "staleListed": sum(1 for f in vals if f["quality"]["status"] == "stale"),
        "unpriced": sum(1 for f in vals if f["quality"]["status"] == "unpriced"),
        "active": sum(1 for f in vals if f["active"]),
        "isin": sum(1 for f in vals if f.get("isin")),
        "structure": sum(1 for f in vals if f.get("structure")),
    })
    bundle["coverage"] = cov

    with open(DATA, "w") as fh:
        json.dump(bundle, fh, separators=(",", ":"))

    print(f"reconcile: {before} -> {len(funds)} routable schemes "
          f"(source {len(dim)}; added unpriced={added['unpriced']} "
          f"dormant={added['dormant']} stale={added['stale']})")
    assert len(funds) == len(dim), "every AMFI scheme must be routable after reconcile"


if __name__ == "__main__":
    main()
