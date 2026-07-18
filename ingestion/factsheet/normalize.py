"""Normalized factsheet schema + validation. Adapters emit these; the loader writes them
to dim_scheme_metadata / fact_scheme_portfolio / fact_scheme_sector_allocation with lineage.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from typing import Optional


def collapse(s: str) -> str:
    """Space/hyphen/apostrophe/case-insensitive key, '&'->'and' — so 'SBI Large & Midcap Fund'
    matches 'SBI Large and Midcap Fund - Regular Plan - Growth', and factsheet text's
    "HDFC Children's Fund" matches AMFI's registered "HDFC Childrens Fund" (real divergence
    found matching Data Platform Mission 5's HDFC integration — AMFI's short registered name
    just drops the apostrophe, it isn't a typo to guess around). Shared by
    scripts/ingest_factsheets.py (fund-name -> AMFI scheme_name matching) and
    ingestion/factsheet/provenance.py (metadata row -> source_documents.scheme_hint matching)
    — must stay one implementation; a second copy is what silently broke provenance matching
    (0/152 rows) the first time."""
    return (
        s.lower().replace("&", "and").replace("  ", " ").strip()
        .replace(" ", "").replace("-", "").replace("'", "").replace("’", "")
    )


@dataclass(slots=True)
class Holding:
    name: str
    weight: Optional[float] = None      # %
    holding_type: Optional[str] = None  # equity | debt | cash | other
    sector: Optional[str] = None
    issuer: Optional[str] = None


@dataclass(slots=True)
class SectorAllocation:
    sector: str
    allocation_pct: Optional[float] = None


@dataclass(slots=True)
class SchemeMetadata:
    """One scheme's factsheet-sourced metadata. Unknown fields stay None — never guessed."""
    scheme_code: Optional[str]            # AMFI code (resolved by name-match if absent in PDF)
    scheme_name: str
    amc: str
    benchmark: Optional[str] = None
    fund_manager: Optional[str] = None
    launch_date: Optional[date] = None
    expense_ratio: Optional[float] = None
    direct_expense_ratio: Optional[float] = None
    regular_expense_ratio: Optional[float] = None
    aum_crores: Optional[float] = None
    riskometer: Optional[str] = None
    exit_load: Optional[str] = None
    minimum_sip: Optional[float] = None
    minimum_lumpsum: Optional[float] = None
    holdings: list = field(default_factory=list)            # list[Holding]
    sector_allocation: list = field(default_factory=list)   # list[SectorAllocation]
    # lineage
    source: str = ""                       # e.g. "HDFC factsheet PDF"
    source_url: str = ""
    source_date: Optional[date] = None     # factsheet as-of date
    version: int = 1

    def to_metadata_row(self) -> dict:
        d = asdict(self)
        d.pop("holdings"); d.pop("sector_allocation")
        for k in ("launch_date", "source_date"):
            if isinstance(d[k], date):
                d[k] = d[k].isoformat()
        return d


# Required for a row to be considered usefully populated (else it is logged as empty).
META_FIELDS = ("benchmark", "fund_manager", "expense_ratio", "aum_crores", "riskometer")


def completeness(m: SchemeMetadata) -> float:
    present = sum(1 for f in META_FIELDS if getattr(m, f) is not None)
    return round(present / len(META_FIELDS), 2)


def validate(m: SchemeMetadata) -> list[str]:
    """Cheap sanity checks; returns a list of problems (empty == ok)."""
    problems = []
    if not m.scheme_name or not m.amc:
        problems.append("missing scheme_name/amc")
    if m.expense_ratio is not None and not (0 <= m.expense_ratio <= 4):
        problems.append(f"expense_ratio out of range: {m.expense_ratio}")
    if m.aum_crores is not None and m.aum_crores < 0:
        problems.append("negative aum")
    tot = sum(s.allocation_pct or 0 for s in m.sector_allocation)
    if m.sector_allocation and tot > 105:
        problems.append(f"sector allocation sums to {tot:.0f}%")
    return problems
