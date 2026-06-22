"""
AMFI NAVAll parser.

The AMFI daily file (https://portal.amfiindia.com/spages/NAVAll.txt) is NOT a flat
CSV. It is a stateful, hierarchical text file:

    Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date   <- header
    <blank>
    Open Ended Schemes(Debt Scheme - Banking and PSU Fund)     <- scheme-type + category header
    <blank>
    Aditya Birla Sun Life Mutual Fund                          <- AMC name header
    <blank>
    119551;INF209KA12Z1;INF209KA13Z9;ABSL ... - DIRECT - IDCW;105.9219;19-Jun-2026   <- data row
    ...

So as we walk the file top-to-bottom we must remember the *current* category and the
*current* AMC, and stamp every data row with them. This module is pure-Python with no
DB dependency so it can be unit-tested against a saved file offline.

Fields are SEMICOLON-separated (not pipe). NAVAll contains NAV only — there is no AUM
column; AUM/flow data comes from SEBI monthly reports in a separate pipeline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from datetime import date, datetime
from typing import Iterable, Iterator, Optional

# A scheme-type/category header looks like "Open Ended Schemes(Debt Scheme - ...)"
# or "Close Ended Schemes(...)" or "Interval Fund Schemes(...)".
_CATEGORY_RE = re.compile(
    r"^(Open Ended|Close Ended|Interval Fund|Interval)\s+.*\(.*\)\s*$",
    re.IGNORECASE,
)
_HEADER_PREFIX = "Scheme Code"


@dataclass(slots=True)
class NavRecord:
    scheme_code: str
    isin_growth: Optional[str]
    isin_reinvest: Optional[str]
    scheme_name: str
    nav_value: Optional[float]
    nav_date: Optional[date]
    amc_name: str
    scheme_type: str          # "Open Ended Schemes", "Close Ended Schemes", ...
    category_raw: str         # text inside the parentheses, e.g. "Debt Scheme - Banking and PSU Fund"
    asset_class: str          # derived: Equity / Debt / Hybrid / Solution / Other

    def as_dict(self) -> dict:
        d = asdict(self)
        if self.nav_date is not None:
            d["nav_date"] = self.nav_date.isoformat()
        return d


def _clean(value: str) -> Optional[str]:
    """Normalise a raw field: strip, turn '-' / '' / 'N.A.' into None."""
    v = (value or "").strip()
    if v in ("", "-", "N.A.", "NA", "N/A"):
        return None
    return v


def _parse_nav(value: str) -> Optional[float]:
    v = _clean(value)
    if v is None:
        return None
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None


def _parse_date(value: str) -> Optional[date]:
    v = _clean(value)
    if v is None:
        return None
    try:
        return datetime.strptime(v, "%d-%b-%Y").date()
    except ValueError:
        return None


def _derive_asset_class(scheme_type: str, category_raw: str) -> str:
    """Map a scheme's type+category to a SEBI asset class.

    Handles both the modern SEBI taxonomy ("Equity Scheme - Large Cap Fund")
    and the legacy close-ended labels still present in the file: bare "Income"
    is a debt bucket, bare "Growth" and "ELSS" are equity buckets.
    """
    blob = f"{scheme_type} {category_raw}".lower()
    if "equity" in blob or "elss" in blob:
        return "Equity"
    if "debt" in blob or "gilt" in blob or "liquid" in blob or "money market" in blob or "income" in blob:
        return "Debt"
    if "hybrid" in blob or "balanced" in blob:
        return "Hybrid"
    if "solution" in blob or "retirement" in blob or "children" in blob:
        return "Solution"
    # Legacy close-ended bucket: a bare "Growth" category is equity-oriented.
    if "growth" in blob:
        return "Equity"
    return "Other"


def _split_category(line: str) -> tuple[str, str]:
    """'Open Ended Schemes(Debt Scheme - Banking and PSU Fund)' ->
    ('Open Ended Schemes', 'Debt Scheme - Banking and PSU Fund')."""
    paren = line.find("(")
    if paren == -1:
        return line.strip(), ""
    scheme_type = line[:paren].strip()
    category_raw = line[paren + 1: line.rfind(")")].strip()
    return scheme_type, category_raw


def parse_lines(lines: Iterable[str]) -> Iterator[NavRecord]:
    """Stream NavRecords from an iterable of raw lines."""
    current_amc = ""
    current_type = ""
    current_category = ""

    for raw in lines:
        line = raw.rstrip("\n").rstrip("\r")
        stripped = line.strip()

        if not stripped:
            continue
        if stripped.startswith(_HEADER_PREFIX):
            continue

        # Data rows have semicolons and a numeric scheme code as the first field.
        if ";" in stripped:
            parts = stripped.split(";")
            if len(parts) >= 6 and parts[0].strip().isdigit():
                yield NavRecord(
                    scheme_code=parts[0].strip(),
                    isin_growth=_clean(parts[1]),
                    isin_reinvest=_clean(parts[2]),
                    scheme_name=parts[3].strip(),
                    nav_value=_parse_nav(parts[4]),
                    nav_date=_parse_date(parts[5]),
                    amc_name=current_amc,
                    scheme_type=current_type,
                    category_raw=current_category,
                    asset_class=_derive_asset_class(current_type, current_category),
                )
                continue
            # Semicolon line that isn't a valid data row — skip defensively.
            continue

        # Non-data, non-blank line: either a category header or an AMC name.
        if _CATEGORY_RE.match(stripped):
            current_type, current_category = _split_category(stripped)
        else:
            current_amc = stripped


def parse_file(path: str) -> Iterator[NavRecord]:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        yield from parse_lines(fh)


if __name__ == "__main__":
    import sys
    from collections import Counter

    src = sys.argv[1] if len(sys.argv) > 1 else "data/NAVAll.txt"
    records = list(parse_file(src))
    print(f"Parsed {len(records):,} NAV rows")

    by_class = Counter(r.asset_class for r in records)
    by_amc = Counter(r.amc_name for r in records)
    stale = sum(1 for r in records if r.nav_value is None)
    print("By asset class:", dict(by_class))
    print(f"Distinct AMCs: {len(by_amc)}")
    print(f"Rows with no NAV value: {stale}")
    print("Top 5 AMCs by scheme count:", by_amc.most_common(5))
    if records:
        print("Sample:", records[0].as_dict())
