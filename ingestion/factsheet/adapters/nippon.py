"""Nippon India Mutual Fund factsheet adapter.

Monthly factsheet with per-scheme detail: benchmark, fund manager, inception, TER, AUM,
riskometer, exit load, min investment, holdings and sector allocation. Extraction via the
shared base parser.
"""

from __future__ import annotations

from ..base import FactsheetAdapter


class NipponAdapter(FactsheetAdapter):
    amc_name = "Nippon India Mutual Fund"
    implemented = True
    factsheet_page = "https://mf.nipponindiaim.com/investor-service/downloads/factsheet"
    LABELS_BENCHMARK = ["benchmark", "benchmark index"]
    LABELS_INCEPTION = ["inception date", "date of allotment"]

    def factsheet_url(self, as_of=None) -> str:
        return self.factsheet_page
