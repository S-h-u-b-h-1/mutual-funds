"""SBI Mutual Fund factsheet adapter.

Consolidated monthly factsheet ("Fundsheet"). Per-scheme snapshot box: benchmark, fund
manager, inception, TER, AUM, riskometer, exit load, min investment; plus holdings and
sector tables. Extraction handled by the shared base (`parse_text` → `parse_scheme_block`).
"""

from __future__ import annotations

from ..base import FactsheetAdapter


class SBIAdapter(FactsheetAdapter):
    amc_name = "SBI Mutual Fund"
    implemented = True
    factsheet_page = "https://www.sbimf.com/en-us/all-forms-and-downloads"
    LABELS_BENCHMARK = ["benchmark index", "benchmark", "scheme benchmark"]
    LABELS_INCEPTION = ["inception date", "date of allotment", "allotment date"]

    def factsheet_url(self, as_of=None) -> str:
        return self.factsheet_page
