"""Conservative, deterministic company-name matching for stock-news linkage.

Only the official NIFTY 50 snapshot is used because it supplies both a stable NSE symbol and
an ISIN for every constituent. Matching is by a full legal name with suffixes removed or by a
small, reviewed alias list. Raw exchange tickers are never treated as article keywords: short
symbols such as ITC, BEL and LT create unacceptable false positives in normal prose.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

SNAPSHOT_PATH = Path(__file__).resolve().parents[1] / "frontend" / "app" / "data" / "stock_universe.json"

# Aliases are deliberately explicit and company-specific. Generic brand words such as "Eternal"
# and "Titan" are excluded unless the full company name appears.
VETTED_ALIASES = {
    "RELIANCE": ["reliance industries", "ril"],
    "TCS": ["tata consultancy services", "tcs"],
    "HDFCBANK": ["hdfc bank"],
    "ICICIBANK": ["icici bank"],
    "SBIN": ["state bank of india", "sbi"],
    "BHARTIARTL": ["bharti airtel"],
    "LT": ["larsen and toubro", "larsen & toubro", "l&t"],
    "MARUTI": ["maruti suzuki"],
    "M&M": ["mahindra and mahindra", "mahindra & mahindra"],
    "HINDUNILVR": ["hindustan unilever"],
    "BAJFINANCE": ["bajaj finance"],
    "BAJAJFINSV": ["bajaj finserv"],
    "KOTAKBANK": ["kotak mahindra bank"],
    "DRREDDY": ["dr reddy's laboratories", "dr reddys laboratories"],
}

LEGAL_SUFFIX = re.compile(r"\b(?:limited|ltd|corporation|corp)\.?\b", re.I)


def _clean_phrase(value: str) -> str:
    value = LEGAL_SUFFIX.sub(" ", value or "")
    value = re.sub(r"\s+", " ", value).strip(" .,-").lower()
    return value


def _phrase_pattern(phrase: str) -> re.Pattern[str]:
    # Alphanumeric boundaries keep RIL from matching "April" and TCS from matching a URL slug.
    return re.compile(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", re.I)


@lru_cache(maxsize=1)
def company_aliases() -> tuple[tuple[str, tuple[tuple[str, re.Pattern[str]], ...]], ...]:
    snapshot = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    companies = snapshot["indices"]["NIFTY50"]["constituents"]
    output = []
    for company in companies:
        symbol = company["nseSymbol"]
        legal_name = _clean_phrase(company["name"])
        phrases = {legal_name} if len(legal_name.split()) >= 2 else set()
        phrases.update(_clean_phrase(alias) for alias in VETTED_ALIASES.get(symbol, []))
        phrases.discard("")
        output.append((symbol, tuple((phrase, _phrase_pattern(phrase)) for phrase in sorted(phrases, key=len, reverse=True))))
    return tuple(output)


def detect_company_mentions(title: str, summary: str = "") -> list[dict[str, str]]:
    """Return traceable company links, at most one per company per article."""
    text = f"{title or ''} {summary or ''}"
    hits = []
    for symbol, aliases in company_aliases():
        matched = next((phrase for phrase, pattern in aliases if pattern.search(text)), None)
        if matched:
            hits.append({
                "entity_type": "company",
                "name": symbol,
                "relation": "mentions",
                "rule_id": "company_name_exact",
            })
    return hits
