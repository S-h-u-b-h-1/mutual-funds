"""
Benchmark intelligence — SEBI category-standard (Tier-1) benchmark per category.

Deterministic, documented mapping from a fund's category to the standard benchmark SEBI
prescribes for that category (equity, debt and hybrid). Labelled as the *category-standard*
benchmark — the exact index an individual AMC names in its SID may be a Tier-2 variant, which
comes from the factsheet. A category with no single standard benchmark (sectoral/thematic,
index/ETF, FoF, solution, multi-asset) returns None rather than a guess.

TRI variants are used for equity (funds are TRI-benchmarked since 2018); CRISIL total-return
debt indices for debt categories.
"""

from __future__ import annotations

CATEGORY_BENCHMARK = {
    # ---- equity ----
    "Large Cap": "NIFTY 100 TRI",
    "Large & Mid Cap": "NIFTY LargeMidcap 250 TRI",
    "Large and Mid Cap": "NIFTY LargeMidcap 250 TRI",
    "Mid Cap": "NIFTY Midcap 150 TRI",
    "Small Cap": "NIFTY Smallcap 250 TRI",
    "Multi Cap": "NIFTY 500 Multicap 50:25:25 TRI",
    "Flexi Cap": "NIFTY 500 TRI",
    "ELSS": "NIFTY 500 TRI",
    "Focused": "NIFTY 500 TRI",
    "Value": "NIFTY 500 TRI",
    "Contra": "NIFTY 500 TRI",
    "Dividend Yield": "NIFTY 500 TRI",
    # ---- hybrid ----
    "Aggressive Hybrid": "CRISIL Hybrid 35+65 Aggressive Index",
    "Conservative Hybrid": "CRISIL Hybrid 85+15 Conservative Index",
    "Balanced Advantage": "NIFTY 50 Hybrid Composite Debt 50:50 Index",
    "Dynamic Asset Allocation": "NIFTY 50 Hybrid Composite Debt 50:50 Index",
    "Equity Savings": "NIFTY Equity Savings TRI",
    "Arbitrage": "Nifty 50 Arbitrage Index",
    # ---- debt (SEBI Tier-1 CRISIL standards) ----
    "Overnight": "CRISIL Overnight Index",
    "Liquid": "CRISIL Liquid Debt A-I Index",
    "Ultra Short Duration": "CRISIL Ultra Short Duration Debt A-I Index",
    "Low Duration": "CRISIL Low Duration Debt A-I Index",
    "Money Market": "CRISIL Money Market A-I Index",
    "Short Duration": "CRISIL Short Duration Debt A-II Index",
    "Medium Duration": "CRISIL Medium Duration Debt A-III Index",
    "Medium to Long Duration": "CRISIL Medium to Long Duration Debt A-III Index",
    "Long Duration": "CRISIL Long Duration Debt A-III Index",
    "Dynamic Bond": "CRISIL Dynamic Bond A-III Index",
    "Corporate Bond": "CRISIL Corporate Debt A-II Index",
    "Credit Risk": "CRISIL Credit Risk Debt B-II Index",
    "Banking and PSU": "CRISIL Banking and PSU Debt Index",
    "Gilt": "CRISIL Dynamic Gilt Index",
    "Floater": "CRISIL Short Duration Debt A-II Index",
    # ---- additional category standards (SEBI Tier-1 / widely-reported) ----
    "Dynamic Asset Allocation or Balanced Advantage": "NIFTY 50 Hybrid Composite Debt 50:50 Index",
    "Balanced Hybrid": "CRISIL Hybrid 50+50 Moderate Index",
    "Gilt with 10 year constant duration": "CRISIL 10 Year Gilt Index",
    "Income": "CRISIL Composite Bond Index",
}

EQUITY_DEFAULT = "NIFTY 500 TRI"
# categories where no single standard benchmark applies AND the name carries no index → None (honest)
VARIES_KEYS = ("fund of fund", "fof", "multi asset", "retirement", "children")

import re

# An index fund / ETF / sectoral fund names the index it tracks — that index IS its benchmark.
# Patterns are checked in order (specific first); \b after a number stops "50" matching "500".
INDEX_PATTERNS = [
    (r"nifty\s*next\s*50\b", "NIFTY Next 50 TRI"),
    (r"nifty\s*50\b|nifty50\b", "NIFTY 50 TRI"),
    (r"nifty\s*100\b", "NIFTY 100 TRI"),
    (r"nifty\s*200\b", "NIFTY 200 TRI"),
    (r"nifty\s*500\b", "NIFTY 500 TRI"),
    (r"midcap\s*150\b", "NIFTY Midcap 150 TRI"),
    (r"midcap\s*50\b", "NIFTY Midcap 50 TRI"),
    (r"midcap\s*select", "NIFTY Midcap Select TRI"),
    (r"smallcap\s*250\b", "NIFTY Smallcap 250 TRI"),
    (r"smallcap\s*50\b", "NIFTY Smallcap 50 TRI"),
    (r"smallcap\s*100\b", "NIFTY Smallcap 100 TRI"),
    (r"bank\s*nifty|nifty\s*bank", "NIFTY Bank TRI"),
    (r"nifty\s*it\b", "NIFTY IT TRI"),
    (r"nifty\s*pharma|healthcare", "NIFTY Pharma TRI"),
    (r"\bauto\b", "NIFTY Auto TRI"),
    (r"\bfmcg\b", "NIFTY FMCG TRI"),
    (r"\bmetal\b", "NIFTY Metal TRI"),
    (r"\brealty\b", "NIFTY Realty TRI"),
    (r"\benergy\b", "NIFTY Energy TRI"),
    (r"infra(structure)?\b", "NIFTY Infrastructure TRI"),
    (r"psu\s*bank", "NIFTY PSU Bank TRI"),
    (r"private\s*bank", "NIFTY Private Bank TRI"),
    (r"financial\s*services|fin\.?\s*services|\bbfsi\b", "NIFTY Financial Services TRI"),
    (r"consumption|\bconsumer\b", "NIFTY India Consumption TRI"),
    (r"\bcommodit", "NIFTY Commodities TRI"),
    (r"\bcpse\b", "NIFTY CPSE TRI"),
    (r"\bpse\b", "NIFTY PSE TRI"),
    (r"dividend\s*opportun", "NIFTY Dividend Opportunities 50 TRI"),
    (r"low\s*vol", "NIFTY 100 Low Volatility 30 TRI"),
    (r"\balpha\b", "NIFTY 200 Alpha 30 TRI"),
    (r"\bmomentum\b", "NIFTY 200 Momentum 30 TRI"),
    (r"\bquality\b", "NIFTY 200 Quality 30 TRI"),
    (r"equal\s*weight", "NIFTY 50 Equal Weight TRI"),
    (r"sensex", "S&P BSE SENSEX TRI"),
    (r"bse\s*500\b", "S&P BSE 500 TRI"),
    (r"bse\s*midcap", "S&P BSE Midcap TRI"),
    (r"bse\s*smallcap", "S&P BSE Smallcap TRI"),
    (r"\bgold\b", "Domestic Price of Gold"),
    (r"\bsilver\b", "Domestic Price of Silver"),
]
_INDEX_COMPILED = [(re.compile(p, re.I), b) for p, b in INDEX_PATTERNS]


def derive_index_benchmark(scheme_name: str):
    """For index/ETF/sectoral funds, return the tracked index named in the scheme. None if unclear."""
    n = scheme_name or ""
    for rx, bench in _INDEX_COMPILED:
        if rx.search(n):
            return bench
    return None


def resolve_benchmark(category: str, scheme_name: str = "", asset_class: str = "") -> tuple:
    """Return (benchmark|None, is_standard). None when no confident category benchmark exists."""
    cat = (category or "").strip()
    name = (scheme_name or "").lower()
    # An explicitly-named index/ETF fund tracks the index in its name — that is authoritative,
    # even over a category default (e.g. an ELSS *index* fund follows its index, not NIFTY 500).
    if any(k in name for k in ("index fund", "index scheme", "etf", "exchange traded")):
        nb = derive_index_benchmark(scheme_name)
        if nb:
            return nb, True
    if cat in CATEGORY_BENCHMARK:
        return CATEGORY_BENCHMARK[cat], True
    blob = f"{cat} {scheme_name}".lower()
    # index / ETF / sectoral / commodity funds name their tracked index — that IS the benchmark.
    # If no index is derivable from the name, return None (their benchmark genuinely varies) —
    # never the diversified-equity default, which would be wrong for a sector/theme fund.
    if any(k in blob for k in ("index", "etf", "sectoral", "thematic", "gold", "silver", "exchange traded")):
        nb = derive_index_benchmark(scheme_name)
        return (nb, True) if nb else (None, False)
    if any(k in blob for k in VARIES_KEYS):
        return None, False
    # diversified equity not explicitly listed → NIFTY 500 TRI (flagged non-standard)
    if asset_class == "Equity":
        return EQUITY_DEFAULT, False
    return None, False
