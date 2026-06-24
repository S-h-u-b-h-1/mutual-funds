"""HDFC Mutual Fund factsheet adapter.

Standard "Fund Snapshot" box (inception, benchmark, fund manager(s), AUM, TER Regular &
Direct, exit load, riskometer) + Portfolio (top holdings) + Industry Allocation tables.
One of the cleaner layouts. Extraction via the shared base parser.
"""

from __future__ import annotations

from ..base import FactsheetAdapter


class HDFCAdapter(FactsheetAdapter):
    amc_name = "HDFC Mutual Fund"
    implemented = True
    factsheet_page = "https://www.hdfcfund.com/information/downloads"
    LABELS_BENCHMARK = ["benchmark", "benchmark index"]
    LABELS_MANAGER = ["fund manager", "fund managers", "managed by"]

    def factsheet_url(self, as_of=None) -> str:
        return self.factsheet_page
