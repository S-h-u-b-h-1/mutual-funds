import json
from pathlib import Path

from scripts.collect_stock_universe import build_snapshot, parse_bse, parse_nifty


def test_nifty_parser_requires_50_unique_isins():
    header = "Company Name,Industry,Symbol,Series,ISIN Code\n"
    rows = "".join(f"Company {i},Industry {i % 4},SYM{i},EQ,INE{i:09d}\n" for i in range(50))
    parsed = parse_nifty((header + rows).encode())
    assert len(parsed) == 50
    assert len({row["isin"] for row in parsed}) == 50


def test_bse_parser_preserves_source_effective_date_and_codes():
    raw = json.dumps({"Table": [
        {"TransDate": "2026-07-31T00:00:00", "SCRIP_CODE": str(500000 + i), "SCRIPNAME": f"BSE COMPANY {i}", "Industry_name": "Industrials"}
        for i in range(100)
    ]}).encode()
    parsed, effective_date = parse_bse(raw)
    assert len(parsed) == 100
    assert effective_date == "2026-07-31"
    assert len({row["bseCode"] for row in parsed}) == 100


def test_committed_snapshot_contract():
    path = Path(__file__).resolve().parents[1] / "frontend" / "app" / "data" / "stock_universe.json"
    snapshot = json.loads(path.read_text())
    assert snapshot["schemaVersion"] in (1, 2)
    assert snapshot["indices"]["NIFTY50"]["constituentCount"] == 50
    assert snapshot["indices"]["BSE100"]["constituentCount"] == 100
    assert snapshot["indices"]["NIFTY50"]["identifierCoverage"]["isin"] == 50
    assert snapshot["indices"]["BSE100"]["identifierCoverage"]["bseCode"] == 100

