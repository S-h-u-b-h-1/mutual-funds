"""Phase 8 — data-quality gate. Runs on the committed bundles; fails CI if quality drops.
Every assertion defends a number that MF Pulse displays."""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, ROOT)
from scripts.build_performance import FRESH_MAX_DAYS  # noqa: E402 — single source of truth


def _load(name):
    p = os.path.join(ROOT, "frontend/app/data", name)
    if not os.path.exists(p):
        pytest.skip(f"{name} not present")
    return json.load(open(p))


FUNDS = _load("funds.json")["funds"] if os.path.exists(os.path.join(ROOT, "frontend/app/data/funds.json")) else {}
META = _load("metadata.json")["metadata"] if os.path.exists(os.path.join(ROOT, "frontend/app/data/metadata.json")) else []


def test_no_duplicate_scheme_codes():
    codes = [f["code"] for f in FUNDS.values()]
    assert len(codes) == len(set(codes))


def test_no_impossible_returns():
    bad = [(c, f["r1m"]) for c, f in FUNDS.items() if f.get("r1m") is not None and not (-60 <= f["r1m"] <= 150)]
    assert bad == [], f"impossible 1M returns (IDCW distortion?): {bad[:5]}"


def test_no_impossible_volatility():
    bad = [c for c, f in FUNDS.items() if f.get("vol90") is not None and not (0 <= f["vol90"] <= 250)]
    assert bad == []


def test_idcw_returns_suppressed():
    # IDCW NAV returns are distorted by payouts -> must not be displayed
    leaks = [c for c, f in FUNDS.items() if f.get("isIdcw") and f.get("r1m") is not None]
    assert leaks == [], f"IDCW funds still carry NAV returns: {leaks[:5]}"


def test_active_funds_have_nav():
    missing = [c for c, f in FUNDS.items() if f.get("active") and f.get("nav") is None]
    assert missing == []


def test_returns_window_monotonic_presence():
    # a fund with 1Y history must also have 90D and 30D (no holes in the window ladder)
    holes = [c for c, f in FUNDS.items()
             if f.get("r1y") is not None and (f.get("r3m") is None or f.get("r1m") is None)]
    assert holes == []


def test_long_window_returns_imply_current_nav():
    # 2026-06-26 bug: a dormant fund's LAST published NAV was used as "now" for r6m/r1y/r3y/r5y,
    # silently mislabeling a shorter stale window as "1 year return". Any long-window return must
    # come from a fund whose reference NAV was actually current (<=7d) at build time.
    bad = [c for c, f in FUNDS.items()
           if any(f.get(k) is not None for k in ("r6m", "r1y", "r3y", "r5y")) and f.get("staleDays", 9999) > FRESH_MAX_DAYS]
    assert bad == [], f"long-window return computed against a stale NAV: {bad[:5]}"


def test_metadata_no_impossible_values():
    for r in META:
        er = r.get("expense_ratio")
        assert er is None or 0 <= er <= 4, f"{r['scheme_code']} expense {er}"
        aum = r.get("aum_crores")
        assert aum is None or aum >= 0, f"{r['scheme_code']} aum {aum}"
        secs = r.get("sector_allocation") or []
        tot = sum(s.get("allocation_pct") or 0 for s in secs)
        assert tot <= 105, f"{r['scheme_code']} sectors sum {tot:.0f}%"


def test_metadata_has_lineage():
    # every ingested metadata row must carry source provenance (URL always; date when the PDF exposes it)
    assert all(r.get("source_url") for r in META)


def test_benchmark_no_equity_benchmark_on_debt():
    # debt funds must never carry an equity (NIFTY/BSE) benchmark
    bad = [c for c, f in FUNDS.items()
           if f.get("assetClass") == "Debt" and (f.get("benchmark") or "").upper().startswith(("NIFTY", "S&P BSE"))]
    assert bad == [], f"debt funds with equity benchmark: {bad[:5]}"
