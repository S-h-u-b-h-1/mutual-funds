"""Round-trip test for the SEBI/AMFI monthly Excel parser."""

import tempfile
from pathlib import Path

import pytest

openpyxl = pytest.importorskip("openpyxl")

from ingestion.sebi_flows import derive_class, load_excel


def _make_workbook(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["AMFI Monthly Data — May 2026"])  # title row (ignored)
    ws.append(["AMC", "Scheme Category", "Gross Inflow", "Redemption", "Net Inflow/Outflow", "AUM"])
    ws.append(["SBI Mutual Fund", "Equity Schemes", "9,790", "4,660", "5,130", "239400"])
    ws.append(["HDFC Mutual Fund", "Debt Schemes", "2,560", "2,897", "-337", "243600"])
    ws.append([None, None, None, None, None, None])  # blank row
    wb.save(path)


def test_load_excel_round_trip():
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "monthly.xlsx"
        _make_workbook(p)
        rows = load_excel(str(p), month="2026-05-01")

    assert len(rows) == 2
    sbi = rows[0]
    assert sbi[0] == "SBI Mutual Fund"
    assert sbi[1] == "Equity"          # derived asset_class
    assert sbi[3] == "2026-05-01"      # month
    assert sbi[6] == 5130.0            # net flow (parsed from "5,130")
    hdfc = rows[1]
    assert hdfc[1] == "Debt" and hdfc[6] == -337.0


def test_derive_class():
    assert derive_class("Equity Schemes") == "Equity"
    assert derive_class("Income / Debt") == "Debt"
    assert derive_class("Hybrid") == "Hybrid"
    assert derive_class("Other ETFs") == "Other"
