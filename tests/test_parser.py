"""Data-quality tests for the AMFI parser (run: .venv/bin/pytest)."""

from ingestion.amfi_parser import parse_lines, _derive_asset_class

SAMPLE = """\
Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Large Cap Fund)

Test AMC Mutual Fund

100001;INF000A01AB1;-;Test Large Cap Fund - Direct Growth;123.4567;19-Jun-2026
100002;-;-;Test Large Cap Fund - Regular IDCW;98.7600;19-Jun-2026

Open Ended Schemes(Debt Scheme - Liquid Fund)

Other AMC Mutual Fund

200001;INF000A02CD2;-;Other Liquid Fund - Growth;1500.0000;19-Jun-2026
200002;-;-;Stale Bonus Option;N.A.;14-Jun-2017
"""


def records():
    return list(parse_lines(SAMPLE.splitlines()))


def test_row_count():
    assert len(records()) == 4  # header, blanks, category & AMC lines all excluded


def test_amc_and_category_state_carry():
    recs = records()
    assert recs[0].amc_name == "Test AMC Mutual Fund"
    assert recs[0].asset_class == "Equity"
    assert recs[2].amc_name == "Other AMC Mutual Fund"
    assert recs[2].asset_class == "Debt"


def test_nav_and_isin_cleaning():
    recs = records()
    assert recs[0].nav_value == 123.4567
    assert recs[0].isin_growth == "INF000A01AB1"
    assert recs[1].isin_growth is None       # "-" -> None
    assert recs[3].nav_value is None         # "N.A." -> None


def test_legacy_classification():
    assert _derive_asset_class("Close Ended Schemes", "Income") == "Debt"
    assert _derive_asset_class("Close Ended Schemes", "Growth") == "Equity"
    assert _derive_asset_class("Open Ended Schemes", "ELSS") == "Equity"
    assert _derive_asset_class("Other Scheme", "Index Funds") == "Other"
