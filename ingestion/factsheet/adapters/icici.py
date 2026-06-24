"""ICICI Prudential Mutual Fund factsheet adapter.

Per-scheme "Fund Details" (inception, benchmark, fund managers, AUM month-end & average,
TER Direct/Other, exit load, min application) + Portfolio Holdings + Sector Allocation.
Extraction via the shared base parser.
"""

from __future__ import annotations

from ..base import FactsheetAdapter


class ICICIAdapter(FactsheetAdapter):
    amc_name = "ICICI Prudential Mutual Fund"
    implemented = True
    factsheet_page = "https://www.icicipruamc.com/news-and-update/factsheet"
    LABELS_BENCHMARK = ["benchmark", "benchmark index", "tier i benchmark"]
    LABELS_INCEPTION = ["inception/allotment date", "inception date", "allotment date"]

    def factsheet_url(self, as_of=None) -> str:
        return self.factsheet_page
