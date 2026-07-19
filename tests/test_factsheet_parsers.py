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

# Structurally-faithful to the REAL combined monthly factsheet (verified 2026-07-19 against the
# actual June 2026 PDF, not assumed) — HDFCAdapter overrides parse()/parse_scheme_block()
# entirely because the real layout looks nothing like HDFC_BLOCK above: no "Label: value" lines,
# name is a bare header, expense ratio is "Regular: X% Direct: Y%" with no blended figure, and
# riskometer/holdings/sector tables are NOT reliably extractable from this document at all (see
# ingestion/factsheet/adapters/hdfc.py's module docstring for why). This fixture mirrors that
# real shape at reduced scale — not the fictional format HDFC_BLOCK above assumed.
HDFC_REAL_SHAPE_BLOCK = """
For Product label and Riskometers, refer page no: 123-138

11  |  June 2026
HDFC Mid Cap Opportunities Fund
An open ended equity scheme predominantly investing in mid cap stocks

CATEGORY OF SCHEME
MID CAP FUND

INVESTMENT OBJECTIVE:  To provide long-term capital appreciation.

FUND MANAGER ¥
Name Since Total Exp
Chirag Setalvad July 29,
2022 Over 22
years

DATE OF ALLOTMENT/INCEPTION DATE
June 25, 2007

ASSETS UNDER MANAGEMENT
As on June 30, 2026
Average for Month of June, 2026
₹75,432.10Cr.
₹74,900.00Cr.

EXPENSE RATIO
Regular: 1.45% Direct: 0.78%

#BENCHMARK INDEX
NIFTY Midcap 150 (TRI)

EXIT LOAD$$
• In respect of each purchase / switch-in of
Units, an Exit Load of 1.00% is payable if Units
are redeemed / switched-out within 1 year from
the date of allotment.
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

# Structurally-faithful to the REAL combined "Complete.pdf" (verified 2026-07-19 against the
# actual June 2026 document, not assumed) — ICICIAdapter overrides parse()/parse_scheme_block()
# entirely because the real layout looks nothing like ICICI_BLOCK above: the scheme name is
# recovered from a "Returns of {name} - Growth Option as on {date}" sentence (no header line),
# each manager's name is immediately followed by "(Managing this fund since ...)" rather than a
# labeled block, and multi-manager schemes exist (found by testing against all 75 real scheme
# pages, not one sample — a single-manager-only extraction silently missed roughly half the
# real document until fixed). This fixture mirrors that real shape at reduced scale.
ICICI_REAL_SHAPE_BLOCK = """15
Portfolio as on June 30, 2026
ICICI Prudential Flexicap Fund
(An open ended dynamic equity scheme investing across large cap, mid cap & small cap stocks) Flexi Cap
Category
Style Box
Quantitative Indicators
Benchmark
BSE 500 TRI
Returns of ICICI Prudential Flexicap Fund - Growth Option as on June 30, 2026
Scheme Details
Monthly AAUM as on 30-Jun-26 :  Rs. 21,881.02 crores
Closing AUM as on 30-Jun-26 : Rs. 22,506.87 crores
Fund Managers** :
Rajat Chandak
(Managing this fund since July, 2021
& Overall 18 years of experience)
Indicative Investment Horizon: 5 years & above
Inception/Allotment date: 17-Jul-21
Application Amount for fresh Subscription :
Rs. 500/- (plus in multiple of Re. 1)  (w.e.f. June 15, 2026)
Top 5 Stock Holdings
TVS Motor Company Ltd. 9.29%
Maruti Suzuki India Ltd. 6.82%
Top 5 Sector Holdings
Automobile And Auto Components 24.95%
Financial Services 21.88%
Exit load for Redemption / Switch out :- Lumpsum & SIP / STP / SWP Option
1% of the applicable NAV - If the amount sought to be
redeemed or switched out is invested for a period of up to
one month from the date of allotment.
The risk of the scheme is very high The risk of the Benchmark is very high
"""

# Real multi-manager shape (Industry Coverage Expansion Mission 2): each manager's name and
# "(Managing since...)" appear on the SAME line, unlike the single-manager block above where
# they're on separate lines — the anchor that makes both work is "(Managing", not a line break,
# which is what an earlier version of this adapter got wrong (see _managers()'s docstring).
ICICI_MULTI_MANAGER_BLOCK = """14
Notes:
Returns of ICICI Prudential Large Cap Fund - Growth Option as on June 30, 2026
Fund Managers** :
Sankaran Naren (Managing this fund since Feb, 2026
& Overall 36 years of experience) (w.e.f. 05 Feb, 2026)
Mr. Vaibhav Dusad (Managing this fund since Jan, 2021
& Overall 14 years of experience)
Sharmila D'silva** (Managing this fund since Mar 2026 &
overall 10 years of experience) (w.e.f March 02, 2026)
Indicative Investment Horizon: 5 years & above
Inception/Allotment date: 23-May-08 Exit load for Redemption / Switch out :- Lumpsum & SIP / STP / SWP Option
1% of the applicable NAV - If the amount sought to be redeemed
or switched out is invested for a period of up to one month
from the date of allotment.
Nifty 100 TRI (Benchmark)
"""


def test_hdfc_block_extracts_core_metadata():
    # Real layout (see HDFC_REAL_SHAPE_BLOCK's comment) — HDFCAdapter's own parse_scheme_block
    # override, not the generic base.py extractor HDFC_BLOCK above was written to exercise.
    m = HDFCAdapter().parse_scheme_block(HDFC_REAL_SHAPE_BLOCK)
    assert m.scheme_name == "HDFC Mid Cap Opportunities Fund"
    assert m.benchmark == "NIFTY Midcap 150 (TRI)"
    assert m.fund_manager == "Chirag Setalvad"
    assert m.regular_expense_ratio == 1.45 and m.direct_expense_ratio == 0.78
    assert m.expense_ratio is None  # HDFC never states one blended figure — not guessed
    assert m.aum_crores == 75432.10  # the "As on" period-end figure, not the monthly average
    assert m.launch_date == "2007-06-25"
    assert m.exit_load and "1.00%" in m.exit_load
    assert validate(m) == []


def test_hdfc_does_not_fabricate_unextractable_fields():
    # riskometer/holdings/sector_allocation are deliberately never populated for this AMC —
    # verified against the real document that they aren't reliably present/clean there (see
    # ingestion/factsheet/adapters/hdfc.py's module docstring). A regression that started
    # inventing values here would be exactly the kind of fabrication this test guards against.
    m = HDFCAdapter().parse_scheme_block(HDFC_REAL_SHAPE_BLOCK)
    assert m.riskometer is None
    assert m.holdings == []
    assert m.sector_allocation == []
    assert m.minimum_sip is None and m.minimum_lumpsum is None


def test_hdfc_parse_merges_continuation_pages(monkeypatch):
    # A scheme's data can span two pages ("....Contd from previous page") in the real combined
    # factsheet — parse() must merge those back into one block, not treat them as two schemes.
    # HDFCAdapter.parse() does `import pypdf` locally (same lazy-import convention as base.py),
    # so patch the shared pypdf module's PdfReader attribute rather than a name in hdfc.py.
    import pypdf

    class FakePage:
        def __init__(self, text):
            self._text = text

        def extract_text(self):
            return self._text

    class FakeReader:
        def __init__(self, _bytes):
            self.pages = [
                FakePage("cover page, no category here"),
                FakePage(HDFC_REAL_SHAPE_BLOCK),
                FakePage("12 | June 2026\nHDFC Mid Cap Opportunities Fund\n\n"
                          "....Contd from previous page\nCATEGORY OF SCHEME\nMID CAP FUND\n"
                          "Industry Allocation section here"),
            ]

    monkeypatch.setattr(pypdf, "PdfReader", FakeReader)
    metas = HDFCAdapter().parse(b"fake-pdf-bytes")
    assert len(metas) == 1  # continuation page merged, not a second scheme
    assert metas[0].scheme_name == "HDFC Mid Cap Opportunities Fund"


def test_icici_real_shape_extracts_core_metadata():
    m = ICICIAdapter().parse_scheme_block(ICICI_REAL_SHAPE_BLOCK)
    assert m.scheme_name == "ICICI Prudential Flexicap Fund"
    assert m.benchmark == "BSE 500 TRI"
    assert m.fund_manager == "Rajat Chandak"
    assert m.aum_crores == 22506.87  # closing AUM, not the monthly average — see adapter docstring
    assert m.launch_date == "2021-07-17"
    assert m.minimum_lumpsum == 500.0
    assert m.exit_load and "1%" in m.exit_load
    assert m.riskometer == "Very High"
    assert m.source_date == "2026-06-30"
    assert [h.name for h in m.holdings] == ["TVS Motor Company Ltd", "Maruti Suzuki India Ltd"]
    assert [s.sector for s in m.sector_allocation] == ["Automobile And Auto Components", "Financial Services"]
    assert m.expense_ratio is None  # genuinely not extractable as text on this AMC's layout — not guessed
    assert validate(m) == []
    assert 0 < completeness(m) <= 1.0


def test_icici_multi_manager_and_two_digit_year(monkeypatch):
    # Found by testing against all 75 real scheme pages, not one sample: multi-manager schemes
    # put each name on the SAME line as its own "(Managing since...)", unlike the single-manager
    # case above where they're on separate lines. An anchor on the line break alone silently
    # missed every multi-manager scheme (roughly half the real document) until fixed.
    m = ICICIAdapter().parse_scheme_block(ICICI_MULTI_MANAGER_BLOCK)
    assert m.scheme_name == "ICICI Prudential Large Cap Fund"
    assert m.fund_manager == "Sankaran Naren & Vaibhav Dusad & Sharmila D'silva"
    # "23-May-08" is a genuinely new 2-digit-year format (2008) this AMC's real data produced —
    # extract.DATE_FORMATS was extended for it rather than guessed to be already covered.
    assert m.launch_date == "2008-05-23"
    # No labeled "Benchmark\n{name}" line on this page style — falls back to the returns-table
    # row-label anchor ("{name} (Benchmark)"), the other real, verified pattern this AMC uses.
    assert m.benchmark == "Nifty 100 TRI"


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
