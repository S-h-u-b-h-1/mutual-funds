"""SBI Mutual Fund factsheet adapter — real per-scheme factsheet parser.

SBI per-scheme factsheet PDFs (sbimf.com/docs/.../scheme-factsheets/...) extract via pypdf
as a label column followed by a value column. This adapter extracts the high-confidence
fields with targeted patterns (benchmark, AUM, manager, allotment, riskometer, sectors,
holdings) — only storing a value when the pattern matches unambiguously, never guessing.
"""

from __future__ import annotations

import re

from ..base import FactsheetAdapter
from ..normalize import SchemeMetadata, Holding, SectorAllocation

BENCHMARK = re.compile(r"(S&P BSE [\w &.\-]+?TRI|NIFTY [\w &.\-]+?TRI|Nifty [\w &.\-]+?TRI|CRISIL [\w &.\-]+?Index[\w ]*|S&P BSE [\w &.\-]+?Index TRI)")
CRORES = re.compile(r"([\d,]+\.\d+)\s*Crores?", re.I)
MANAGER = re.compile(r"^\*?(?:Mr\.|Ms\.|Mrs\.)\s+[A-Z][\w. ]+(?:&\s*\*?(?:Mr\.|Ms\.|Mrs\.)[\w. ]+)?$")
DATE = re.compile(r"\b(\d{2}/\d{2}/\d{4})\b")
RISK = re.compile(r"at (Very High|Moderately High|Moderate|Low to Moderate|High|Low) risk", re.I)
SECTOR = re.compile(r"^([A-Za-z][A-Za-z ,&]+?)\s+(\d{1,2}\.\d{2})$")
HOLDING = re.compile(r"^(.+?(?:Ltd\.?|Limited|Corporation|Bank))\.?\s+(\d{1,2}\.\d{2})\s*-")


class SBIAdapter(FactsheetAdapter):
    amc_name = "SBI Mutual Fund"
    implemented = True
    factsheet_page = "https://www.sbimf.com/docs/default-source/scheme-factsheets/"

    def factsheet_url(self, as_of=None) -> str:
        return self.factsheet_page

    def parse_scheme_block(self, block: str) -> SchemeMetadata:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]

        bm = BENCHMARK.search(block)
        crores = CRORES.findall(block)
        dates = DATE.findall(block)
        risk = RISK.search(block)

        # Only accept the multi-manager "&" list line (reliably contains the lead manager).
        # A solo "Mr. X" line is ambiguous in SBI PDFs (the foreign-securities co-manager
        # appears across many funds) → not stored, to avoid mis-attribution.
        manager = None
        for ln in lines:
            if MANAGER.match(ln) and "&" in ln and not re.search(r"(19|20)\d{2}", ln):
                manager = re.sub(r"\*", "", ln).strip()
                break

        # SBI single-scheme PDFs often repeat a "Top 10" + full sector table; dedupe by name
        # and stop at one complete table (~100%) so allocations don't double-count.
        sectors, holdings, seen_sec, seen_hold, sec_sum = [], [], set(), set(), 0.0
        for ln in lines:
            h = HOLDING.match(ln)
            if h:
                hn, w = h.group(1).strip()[:80], float(h.group(2))
                if 0 < w <= 100 and hn not in seen_hold:
                    seen_hold.add(hn)
                    holdings.append(Holding(name=hn, weight=w, holding_type="equity"))
                continue
            s = SECTOR.match(ln)
            if s and "Ltd" not in s.group(1) and "Plan" not in s.group(1):
                name, a = s.group(1).strip(), float(s.group(2))
                if 0 < a <= 100 and len(name) <= 40 and name not in seen_sec and sec_sum + a <= 102:
                    seen_sec.add(name)
                    sec_sum += a
                    sectors.append(SectorAllocation(sector=name, allocation_pct=a))

        aum = float(crores[-1].replace(",", "")) if crores else None
        return SchemeMetadata(
            scheme_code=None, scheme_name="", amc=self.amc_name,
            benchmark=bm.group(1).strip() if bm else None,
            fund_manager=manager,
            aum_crores=aum if (aum is None or aum >= 0) else None,
            riskometer=risk.group(1).title() if risk else None,
            launch_date=_to_iso(dates[0]) if dates else None,
            source_date=_to_iso(dates[1]) if len(dates) > 1 else None,
            holdings=holdings[:10], sector_allocation=sectors[:15],
        )


def _to_iso(d: str):
    from datetime import datetime
    try:
        return datetime.strptime(d, "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None
