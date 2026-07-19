"""
Factsheet text-extraction helpers — real parsing primitives shared by AMC adapters.

These operate on text extracted from a factsheet PDF (via pypdf). They extract labeled
metadata fields, holdings rows, and sector allocations using conservative patterns:
a value is returned ONLY when confidently matched, otherwise None — never guessed.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from .normalize import Holding, SectorAllocation

PCT = re.compile(r"(-?\d{1,3}(?:\.\d{1,2})?)\s*%")
MONEY = re.compile(r"(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)\s*(cr|crore|crores)?", re.I)


def _line_value(text: str, labels: list[str]) -> Optional[str]:
    """Find 'Label : value' or 'Label value' for the first matching label."""
    for ln in text.splitlines():
        low = ln.lower()
        for lab in labels:
            i = low.find(lab)
            if i != -1:
                rest = ln[i + len(lab):].lstrip(" :\t-–").strip()
                if rest:
                    return rest
    return None


def labeled(text: str, labels: list[str]) -> Optional[str]:
    return _line_value(text, labels)


def parse_pct(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    m = PCT.search(s)
    return float(m.group(1)) if m else None


def parse_expense(text: str) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Return (overall, regular, direct) expense ratios when present and in 0..4 range."""
    reg = parse_pct(labeled(text, ["regular plan", "regular:"]) or "") if "regular" in text.lower() else None
    dir_ = parse_pct(labeled(text, ["direct plan", "direct:"]) or "") if "direct" in text.lower() else None
    overall = parse_pct(labeled(text, ["total expense ratio", "expense ratio", "ter"]) or "")
    sane = lambda v: v if (v is not None and 0 <= v <= 4) else None
    return sane(overall), sane(reg), sane(dir_)


def parse_aum(text: str) -> Optional[float]:
    raw = labeled(text, ["monthly average aum", "average aum", "month end aum", "aum", "net assets"])
    if not raw:
        return None
    m = MONEY.search(raw.replace(",", ""))
    if not m:
        return None
    val = float(m.group(1).replace(",", ""))
    return round(val, 2) if val >= 0 else None


def parse_amount(s: Optional[str]) -> Optional[float]:
    """First rupee amount in a string (e.g. 'Rs. 5,000' -> 5000.0). None if absent."""
    if not s:
        return None
    m = re.search(r"([\d,]{2,})", s.replace(" ", ""))
    if not m:
        return None
    try:
        v = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    return v if v > 0 else None


DATE_FORMATS = (
    "%d-%b-%Y", "%d %b %Y", "%d/%m/%Y", "%B %d, %Y", "%d-%m-%Y", "%b %d, %Y",
    # AMC-specific formats consolidated here (Universal Factsheet Platform Mission 2) from
    # sbi.py's and hdfc.py's own previously-separate _to_iso() functions — every format either
    # adapter's real, verified data has actually produced, union'd rather than narrowed, so this
    # consolidation cannot silently drop a date either adapter already extracts correctly.
    "%B %d,%Y", "%B %d %Y",
    # ICICI (Industry Coverage Expansion Mission 2) uses a 2-digit year for inception dates
    # ("23-May-08" = 2008) — a genuinely new format a third real AMC's data produced, not seen
    # in SBI/HDFC. %y's default century inference (00-68 -> 2000s, 69-99 -> 1900s) matches real
    # mutual fund inception dates correctly across the industry's actual founding years.
    "%d-%b-%y",
)


def parse_date_string(raw: Optional[str]) -> Optional[str]:
    """Convert an already-isolated date substring (e.g. a regex capture group) to ISO, trying
    every format either real adapter needs. Safe to call on a string that's already clean —
    the substring search below matches the whole thing as-is when there's nothing to trim."""
    if not raw:
        return None
    m = re.search(r"[A-Za-z0-9/,\- ]{8,18}", raw)
    if not m:
        return None
    candidate = m.group(0).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(candidate, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_date(text: str, labels: list[str]) -> Optional[str]:
    return parse_date_string(labeled(text, labels))


def parse_numeric_string(raw: Optional[str]) -> Optional[float]:
    """Comma-stripped float from an already-matched numeric capture group (e.g. AUM crores,
    an expense-ratio percentage's digits). Not a search — the caller's own anchor regex already
    found and isolated the number; this only does the strip-commas-and-parse-float conversion
    both adapters previously duplicated inline."""
    if not raw:
        return None
    try:
        return float(raw.replace(",", "").strip())
    except ValueError:
        return None


def parse_holdings(text: str, limit: int = 10) -> list:
    """Rows of '<name> ... <weight>%' under a holdings section. Conservative."""
    out, in_section = [], False
    for ln in text.splitlines():
        low = ln.lower()
        if any(k in low for k in ("top holdings", "portfolio holdings", "top 10", "holdings")):
            in_section = True
            continue
        if in_section and any(k in low for k in ("sector", "industry allocation", "asset allocation", "total")):
            break
        if in_section:
            m = PCT.search(ln)
            name = PCT.sub("", ln).strip(" .\t-–|")
            if m and len(name) >= 3 and not name.replace(" ", "").isdigit():
                w = float(m.group(1))
                if 0 < w <= 100:
                    out.append(Holding(name=name[:80], weight=w))
        if len(out) >= limit:
            break
    return out


def parse_sectors(text: str, limit: int = 15) -> list:
    out, in_section = [], False
    for ln in text.splitlines():
        low = ln.lower()
        if any(k in low for k in ("sector allocation", "industry allocation", "sectoral allocation")):
            in_section = True
            continue
        if in_section and any(k in low for k in ("holdings", "disclaimer", "total", "asset allocation")):
            break
        if in_section:
            m = PCT.search(ln)
            name = PCT.sub("", ln).strip(" .\t-–|")
            if m and 2 <= len(name) <= 40:
                a = float(m.group(1))
                if 0 < a <= 100:
                    out.append(SectorAllocation(sector=name, allocation_pct=a))
        if len(out) >= limit:
            break
    return out


def concentration_score(sectors: list) -> Optional[float]:
    """Top-3 sector concentration % (higher = more concentrated). None if no sectors."""
    if not sectors:
        return None
    weights = sorted((s.allocation_pct or 0 for s in sectors), reverse=True)
    return round(sum(weights[:3]), 1)
