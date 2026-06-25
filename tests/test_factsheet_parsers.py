"""Phase 8 — factsheet parser tests against realistic SYNTHETIC fixtures.

Fixtures mimic the documented factsheet snapshot/holdings/sector layout. They are test data
only and never reach the live product (metadata.json stays empty until a real PDF is
parsed). They prove the extraction logic is correct and conservative (no fabrication).
"""
from ingestion.factsheet import extract
from ingestion.factsheet.normalize import completeness, validate
from ingestion.factsheet.adapters.hdfc import HDFCAdapter
from ingestion.factsheet.adapters.icici import ICICIAdapter

HDFC_BLOCK = """Scheme Name: HDFC Mid-Cap Opportunities Fund
Benchmark: NIFTY Midcap 150 TRI
Fund Manager: Chirag Setalvad
Inception Date: 25-Jun-2007
Total Expense Ratio: 1.45%
Regular Plan: 1.45%
Direct Plan: 0.78%
AUM: Rs. 75,432.10 Cr
Riskometer: Very High
Exit Load: 1% if redeemed within 1 year
Minimum SIP: Rs. 100
Minimum Investment: Rs. 5,000
Top Holdings
Max Financial Services Limited 4.21%
Indian Hotels Company Limited 3.98%
Coforge Limited 3.55%
Sector Allocation
Financial Services 22.40%
Capital Goods 12.10%
Healthcare 9.80%
Disclaimer: past performance ...
"""

ICICI_BLOCK = """Scheme Name: ICICI Prudential Bluechip Fund
Benchmark: NIFTY 100 TRI
Fund Managers: Anish Tawakley
Inception Date: 23-May-2008
Total Expense Ratio: 1.02%
Direct Plan: 0.92%
Average AUM: Rs. 63,210.00 Cr
Riskometer: Very High
Exit Load: 1% within 1 year
Top Holdings
HDFC Bank Limited 9.10%
ICICI Bank Limited 7.85%
Sector Allocation
Financial Services 30.10%
Information Technology 9.40%
Total 100%
"""


def test_hdfc_block_extracts_core_metadata():
    m = HDFCAdapter().parse_scheme_block(HDFC_BLOCK)
    assert m.benchmark == "NIFTY Midcap 150 TRI"
    assert m.fund_manager == "Chirag Setalvad"
    assert m.expense_ratio == 1.45 and m.direct_expense_ratio == 0.78
    assert m.aum_crores == 75432.10
    assert m.riskometer.lower().startswith("very high")
    assert m.launch_date == "2007-06-25"
    assert m.minimum_sip == 100 and m.minimum_lumpsum == 5000
    assert validate(m) == []
    assert completeness(m) == 1.0


def test_hdfc_holdings_and_sectors():
    m = HDFCAdapter().parse_scheme_block(HDFC_BLOCK)
    names = [h.name for h in m.holdings]
    assert "Max Financial Services Limited" in names
    assert all(0 < h.weight <= 100 for h in m.holdings)
    secs = {s.sector: s.allocation_pct for s in m.sector_allocation}
    assert secs.get("Financial Services") == 22.40
    assert extract.concentration_score(m.sector_allocation) == 44.3  # 22.4+12.1+9.8


def test_icici_block_partial_is_not_fabricated():
    m = ICICIAdapter().parse_scheme_block(ICICI_BLOCK)
    assert m.benchmark == "NIFTY 100 TRI"
    assert m.aum_crores == 63210.0
    assert m.regular_expense_ratio is None        # not present -> stays None, not guessed
    assert m.direct_expense_ratio == 0.92
    assert 0 < completeness(m) <= 1.0


def test_expense_validation_rejects_impossible():
    bad = HDFCAdapter().parse_scheme_block("Scheme Name: X\nTotal Expense Ratio: 9.90%\nBenchmark: NIFTY 50 TRI")
    # 9.9% is out of the 0..4 sane range -> dropped, not stored
    assert bad.expense_ratio is None


def test_amount_and_pct_helpers():
    assert extract.parse_amount("Rs. 5,000") == 5000.0
    assert extract.parse_amount("n/a") is None
    assert extract.parse_pct("1.23%") == 1.23
    assert extract.parse_aum("AUM: Rs. 12,345.6 Cr") == 12345.6


def test_multi_scheme_split():
    text = HDFC_BLOCK + "\n" + ICICI_BLOCK
    metas = HDFCAdapter().parse_text(text)
    assert len(metas) >= 2


def test_sbi_sector_dedup_caps_at_one_table():
    """SBI PDFs repeat Top-10 + full sector tables; dedup must keep one table (<=102%)."""
    from ingestion.factsheet.adapters.sbi import SBIAdapter
    block = ("Sector Allocation\n" +
             "Financial Services 30.00\nCapital Goods 25.00\nHealthcare 20.00\n" +
             "Financial Services 30.00\nCapital Goods 25.00\nHealthcare 20.00\n")  # doubled
    m = SBIAdapter().parse_scheme_block(block)
    names = [s.sector for s in m.sector_allocation]
    assert len(names) == len(set(names))                          # no duplicates
    assert sum(s.allocation_pct for s in m.sector_allocation) <= 102


def test_sbi_parser_on_real_factsheet_text():
    """Extraction against a REAL SBI factsheet (text captured from the official PDF)."""
    import os
    from ingestion.factsheet.adapters.sbi import SBIAdapter
    path = os.path.join(os.path.dirname(__file__), "fixtures", "sbi_smallcap.txt")
    if not os.path.exists(path):
        return  # fixture only present in dev checkout
    m = SBIAdapter().parse_scheme_block(open(path).read())
    assert m.benchmark == "S&P BSE 250 Small Cap Index TRI"
    assert m.fund_manager and "Srinivasan" in m.fund_manager
    assert m.aum_crores and m.aum_crores > 1000
    assert m.riskometer == "Very High"
    assert m.launch_date == "2009-09-09"
    assert len(m.holdings) >= 5 and all(0 < h.weight <= 100 for h in m.holdings)
    assert len(m.sector_allocation) >= 5
    assert sum(s.allocation_pct for s in m.sector_allocation) <= 105  # validation invariant
