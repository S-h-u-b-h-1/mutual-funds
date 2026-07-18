"""HDFC Mutual Fund factsheet adapter — real, tested against the June 2026 combined factsheet.

Data Platform Mission 5 (generalize the factsheet pipeline beyond SBI). Unlike SBI, HDFC
publishes ONE combined PDF covering every active scheme (not one PDF per scheme) — this
adapter overrides `parse()` (not just `parse_text()`) because a single scheme's data can span
two pages ("....Contd from previous page"/"....Contd on next page"), which the generic
page-join-then-regex-split flow in base.py has no way to detect; this walks pypdf's pages
directly and merges continuation pages back into the scheme that started them.

Two real things discovered empirically before writing this (not assumed):
- The listing page (hdfcfund.com/mutual-funds/factsheets) is behind a WAF that 403s every
  User-Agent tried via plain urllib — same constraint ingestion/factsheet/playwright_fetch.py
  already documents for HDFC/ICICI/Nippon/Axis. The PDF itself, once you have its URL, is on a
  different, unprotected domain (files.hdfcfund.com) and fetches fine with a plain request.
  `factsheet_url()` below is hand-verified as of 2026-07-19, same accepted pattern as
  scripts/ingest_factsheets.py's curated SBI URLs — it will go stale when HDFC publishes next
  month's factsheet and needs a human (or a browser-driving tool) to re-check the listing page.
- Field-by-field verification against the real PDF's extracted text (140 pages, 53 real
  schemes after continuation-page merging) found some sections extract perfectly (scheme name,
  category, benchmark, inception date, AUM, expense ratio, exit load, fund manager — all
  53/53 or 52/53) and some don't: the "Industry Allocation" and per-scheme holdings tables
  extract with mangled leading letters ("an s" instead of "Banks") — a font/encoding issue in
  that specific table style, not a regex problem. Riskometer is NOT per-scheme in this document
  either; every scheme page just cross-references a separate glossary section (pages 123-138)
  that would need its own scheme-name matching logic to resolve — not attempted here rather
  than guess. sector_allocation, holdings, and riskometer are deliberately left unpopulated
  for this AMC until that's solved properly, instead of storing corrupted or guessed values.
"""

from __future__ import annotations

import re

from ..base import FactsheetAdapter
from ..extract import parse_date_string, parse_numeric_string
from ..normalize import SchemeMetadata

_MONTHS = r"January|February|March|April|May|June|July|August|September|October|November|December"
NAME = re.compile(r"\d+\s*\|\s*\w+ \d{4}\s*\n(.+?)\s*\n")
BENCHMARK = re.compile(r"#?BENCHMARK INDEX\s*\n(.+?)\s*\n")
INCEPTION = re.compile(r"DATE OF ALLOTMENT/INCEPTION DATE\s*\n(.+?)\s*\n")
AUM = re.compile(r"ASSETS UNDER MANAGEMENT.*?\n(?:As on[^\n]*\n)?(?:Average[^\n]*\n)?\s*(?:As on[^\n]*\n)?"
                  r"₹\s*([\d,]+\.\d+)\s*Cr", re.S)
AS_ON = re.compile(rf"As on ({_MONTHS})\s+(\d{{1,2}}),?\s*(\d{{4}})")
EXPENSE = re.compile(r"Regular:\s*([\d.]+)%\s*Direct:\s*([\d.]+)%")
EXIT_LOAD = re.compile(r"EXIT LOAD\S*\s*\n(.+?)(?:\n\s*\n|\Z)", re.S)
MANAGER_BLOCK = re.compile(r"FUND MANAGER.*?\n(.+?)\n\s*\nDATE OF ALLOTMENT", re.S)
MANAGER_ENTRY = re.compile(
    rf"([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+)*)\s*(?:\n?\s*\([^)]*\))?\s*\n?\s*"
    rf"(?:{_MONTHS})\s+\d{{1,2}},?\s*\n?\s*\d{{4}}"
)


def _managers(text: str) -> str | None:
    m = MANAGER_BLOCK.search(text)
    if not m:
        return None
    block = re.sub(r"^\s*Name\s+Since\s+Total\s*\n?\s*Exp\s*", "", m.group(1), flags=re.I)
    names, seen = [], set()
    for mm in MANAGER_ENTRY.finditer(block):
        name = re.sub(r"\s+", " ", mm.group(1)).strip()
        if name.lower() in ("name", "since", "total", "exp") or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return " & ".join(names) if names else None


class HDFCAdapter(FactsheetAdapter):
    amc_name = "HDFC Mutual Fund"
    implemented = True
    # Hand-verified 2026-07-19 — see module docstring. Combined factsheet for ALL active
    # schemes; needs manual refresh when HDFC publishes the next month's PDF.
    factsheet_page = "https://files.hdfcfund.com/s3fs-public/2026-07/HDFC%20MF%20Factsheet%20-%20June%202026_0.pdf"

    def factsheet_url(self, as_of=None) -> str:
        return self.factsheet_page

    def parse(self, pdf_bytes: bytes) -> list[SchemeMetadata]:
        """Override (not parse_text/SCHEME_SPLIT): a scheme's data can span 2+ pages, so
        splitting has to happen at the page level, keyed on the 'Contd from previous page'
        marker — a single joined-text regex split can't tell where one scheme ends and the
        next begins without that per-page signal."""
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        blocks: list[str] = []
        current: str | None = None
        for page in reader.pages:
            text = page.extract_text() or ""
            if "CATEGORY OF SCHEME" not in text:
                continue  # cover/glossary/riskometer-legend/disclaimer pages — not scheme data
            if "Contd from previous page" in text and current is not None:
                current += "\n" + text
            else:
                if current is not None:
                    blocks.append(current)
                current = text
        if current is not None:
            blocks.append(current)
        return [self.parse_scheme_block(b) for b in blocks]

    def parse_scheme_block(self, block: str) -> SchemeMetadata:
        name = NAME.search(block)
        bm = BENCHMARK.search(block)
        inc = INCEPTION.search(block)
        aum = AUM.search(block)
        exp = EXPENSE.search(block)
        exit_ = EXIT_LOAD.search(block)
        as_on = AS_ON.search(block)
        return SchemeMetadata(
            scheme_code=None, scheme_name=(name.group(1).strip()[:120] if name else ""), amc=self.amc_name,
            benchmark=bm.group(1).strip() if bm else None,
            fund_manager=_managers(block),
            expense_ratio=None,  # HDFC never states one blended figure — always Regular/Direct split
            regular_expense_ratio=parse_numeric_string(exp.group(1)) if exp else None,
            direct_expense_ratio=parse_numeric_string(exp.group(2)) if exp else None,
            aum_crores=parse_numeric_string(aum.group(1)) if aum else None,
            launch_date=parse_date_string(inc.group(1)) if inc else None,
            exit_load=re.sub(r"\s+", " ", exit_.group(1)).strip()[:300] if exit_ else None,
            source_date=parse_date_string(f"{as_on.group(1)} {as_on.group(2)}, {as_on.group(3)}") if as_on else None,
        )
