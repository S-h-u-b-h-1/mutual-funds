"""ICICI Prudential Mutual Fund factsheet adapter — real, tested against the June 2026 combined
factsheet.

Industry Coverage Expansion Mission 2 — third real AMC after SBI/HDFC. A third, distinct document
topology: ICICI publishes ONE combined PDF ("Complete.pdf", found via web search — the listing
page at icicipruamc.com is JS-driven per playwright_fetch.py's existing PORTALS entry, but this
specific file lives on an unprotected path and fetches fine with a plain request, same discovery
pattern as HDFC's PDF), but unlike HDFC, each scheme's data fits on exactly ONE page — no
continuation-page merging needed. The reliable per-page anchor is a distinctive sentence pattern
("Returns of {name} - Growth Option as on {date}"), not a labeled header line like SBI/HDFC use.

Real, verified field-by-field against the June 2026 document (75 real scheme pages found):
- benchmark, closing AUM, monthly average AUM, inception date, exit load, riskometer, top
  holdings, top sector holdings, minimum lumpsum: all extract cleanly and were spot-checked
  against several pages, not assumed from one sample.
- expense_ratio: genuinely NOT extractable as text on this layout (confirmed via full-page regex
  scan, not assumed) — the only reference is a footnote ("@@ Base Expense Ratio is as on the last
  day of the month.") with no adjacent numeric value; the actual figure appears to render as part
  of a graphic element pypdf's text extraction doesn't capture. Left unpopulated rather than
  guessed — this AMC's real limitation differs from SBI/HDFC's, which both do expose it as text.
- minimum_sip: not found as a distinct labeled figure separate from "Application Amount for fresh
  Subscription" (which is minimum_lumpsum). Same real, source-level gap already documented in
  docs/DATA_ACQUISITION_ROADMAP.md for SBI/HDFC.
- riskometer IS extractable here ("The risk of the scheme is {level}") — a real, positive
  difference from HDFC, which cross-references a separate un-linked glossary section instead.

Replaces a prior stub (implemented = True, but untested) that pointed at the WAF-blocked listing
page and relied on base.py's generic label extraction — the same false-positive pattern Data
Platform Mission 5 found and fixed for HDFC (see docs/FACTSHEET_PLATFORM_AUDIT.md).
"""

from __future__ import annotations

import re

from ..base import FactsheetAdapter
from ..extract import parse_date_string, parse_numeric_string
from ..normalize import SchemeMetadata, Holding, SectorAllocation

NAME = re.compile(r"Returns of (.+?) - (?:Growth Option|Regular Plan|Direct Plan) as on")
PORTFOLIO_AS_ON = re.compile(r"Portfolio as on ([A-Za-z]+ \d{1,2},?\s*\d{4})")
# Two real, distinct anchors for the same field, found by testing broadly rather than assuming
# one page's layout generalizes: schemes with the "Quantitative Indicators" sidebar carry a
# labeled "Benchmark\n{name}" header line; schemes without it (older/legacy-style pages, found
# empirically — see docs/FACTSHEET_PLATFORM_AUDIT.md's ICICI section) only reference the
# benchmark as a returns-table row label, "{name} (Benchmark)".
BENCHMARK_LABELED = re.compile(r"\bBenchmark\s*\n([A-Z][\w &.\-]+?(?:TRI|Index|Fund))\s*\n")
BENCHMARK_ROW = re.compile(r"([A-Z][\w &.\-]+?(?:TRI|Index))\s*\(Benchmark\)")
CLOSING_AUM = re.compile(r"Closing AUM as on [\d\-A-Za-z]+\s*:\s*Rs\.\s*([\d,]+\.\d+)\s*crores", re.I)
MONTHLY_AUM = re.compile(r"Monthly AAUM as on [\d\-A-Za-z]+\s*:\s*Rs\.\s*([\d,]+\.\d+)\s*crores", re.I)
INCEPTION = re.compile(r"Inception/Allotment date:\s*([\d]{1,2}-[A-Za-z]{3}-[\d]{2,4})")
MIN_LUMPSUM = re.compile(r"Application Amount for fresh Subscription\s*:\s*\n?\s*Rs\.?\s*([\d,]+)")
MANAGERS_BLOCK = re.compile(r"Fund Managers?\*{0,2}\s*:\s*\n(.+?)Indicative Investment Horizon", re.S)
MANAGER_NAME = re.compile(r"([A-Z][A-Za-z'.]+(?:\s+[A-Z][A-Za-z'.]+){0,3})\s*\*{0,2}\s*\(Managing")
EXIT_LOAD = re.compile(
    r"Exit load for Redemption\s*/\s*Switch\s*out\s*:-?\s*(.+?)(?:\n\s*\n|Average Dividend|Std Dev|\Z)",
    re.S,
)
RISK = re.compile(r"risk of the scheme is (Very High|Moderately High|Moderate|Low to Moderate|High|Low)", re.I)
TOP_STOCKS = re.compile(r"Top 5 Stock Holdings\s*\n(.+?)\nTop 5 Sector Holdings", re.S)
TOP_SECTORS = re.compile(r"Top 5 Sector Holdings\s*\n(.+?)(?:\n\s*\n|Exit load)", re.S)
HOLDING_LINE = re.compile(r"^(.+?)\s+(\d{1,3}\.\d{2})%$")


def _managers(text: str) -> str | None:
    """Each manager's name is immediately followed by '(Managing this fund since ...)' — on the
    same line for multi-manager schemes, on the next line for single-manager ones. Matching on
    that anchor (not on line breaks, which differ between the two cases) is what makes this work
    for both; an earlier version anchored on '\\n(Managing' and silently missed every
    multi-manager scheme, found by testing against all 75 real pages, not assumed from one."""
    block = MANAGERS_BLOCK.search(text)
    if not block:
        return None
    names, seen = [], set()
    for m in MANAGER_NAME.finditer(block.group(1)):
        name = re.sub(r"^(Mr\.|Ms\.|Mrs\.)\s+", "", re.sub(r"\s+", " ", m.group(1)).strip())
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return " & ".join(names) if names else None


def _holding_rows(block: str) -> list:
    out = []
    for ln in block.splitlines():
        m = HOLDING_LINE.match(ln.strip())
        if m:
            name, pct = m.group(1).strip(" .\t-–|"), float(m.group(2))
            if name and 0 < pct <= 100:
                out.append((name, pct))
    return out


class ICICIAdapter(FactsheetAdapter):
    amc_name = "ICICI Prudential Mutual Fund"
    implemented = True
    # Hand-verified 2026-07-19 (web search, then confirmed the file fetches directly with a
    # plain request — same discovery pattern HDFC's adapter documents). Combined factsheet for
    # every active scheme; needs manual refresh when ICICI publishes the next month's PDF.
    factsheet_page = "https://www.icicipruamc.com/blob/knowledgecentre/factsheet-complete/Complete.pdf"

    def factsheet_url(self, as_of=None) -> str:
        return self.factsheet_page

    def parse(self, pdf_bytes: bytes) -> list[SchemeMetadata]:
        """Override: unlike HDFC, no continuation-page merging is needed here — each real scheme
        fits on exactly one page, identified by the 'Returns of ... as on' anchor rather than a
        section header. Pages without that anchor (index/economic-overview/annexure pages) are
        skipped rather than mis-parsed."""
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        out = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if NAME.search(text):
                out.append(self.parse_scheme_block(text))
        return out

    def parse_scheme_block(self, block: str) -> SchemeMetadata:
        name = NAME.search(block)
        as_of = PORTFOLIO_AS_ON.search(block)
        bm = BENCHMARK_LABELED.search(block) or BENCHMARK_ROW.search(block)
        closing_aum = CLOSING_AUM.search(block)
        monthly_aum = MONTHLY_AUM.search(block)
        inc = INCEPTION.search(block)
        min_lump = MIN_LUMPSUM.search(block)
        exit_ = EXIT_LOAD.search(block)
        risk = RISK.search(block)

        stocks_block = TOP_STOCKS.search(block)
        holdings = [Holding(name=n[:80], weight=w, holding_type="equity")
                    for n, w in _holding_rows(stocks_block.group(1))][:10] if stocks_block else []
        sectors_block = TOP_SECTORS.search(block)
        sectors = [SectorAllocation(sector=n[:40], allocation_pct=w)
                   for n, w in _holding_rows(sectors_block.group(1))][:15] if sectors_block else []

        # Closing AUM (as-of-factsheet-date snapshot) is the same real-world quantity SBI/HDFC's
        # single AUM figure represents — used here so aum_crores means the same thing across
        # every AMC's data. Monthly average AUM is real too but a distinct SEBI-mandated figure,
        # not stored in SchemeMetadata (no second AUM slot exists) rather than overwriting one.
        aum = parse_numeric_string(closing_aum.group(1)) if closing_aum else (
            parse_numeric_string(monthly_aum.group(1)) if monthly_aum else None)

        return SchemeMetadata(
            scheme_code=None, scheme_name=(name.group(1).strip()[:120] if name else ""), amc=self.amc_name,
            benchmark=bm.group(1).strip() if bm else None,
            fund_manager=_managers(block),
            aum_crores=aum,
            riskometer=risk.group(1).title() if risk else None,
            launch_date=parse_date_string(inc.group(1)) if inc else None,
            minimum_lumpsum=parse_numeric_string(min_lump.group(1)) if min_lump else None,
            exit_load=re.sub(r"\s+", " ", exit_.group(1)).strip()[:300] if exit_ else None,
            holdings=holdings, sector_allocation=sectors,
            source_date=parse_date_string(as_of.group(1)) if as_of else None,
        )
