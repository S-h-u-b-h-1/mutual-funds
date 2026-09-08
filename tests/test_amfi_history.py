from datetime import date
import pytest
from ingestion.amfi_history import parse_history, HistorySchemaError, trailing_return, months_before

CURRENT = "Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date\n100033;Fund;Regular;Growth;INF123;;964.51;05-Aug-2026"
LEGACY = "Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Repurchase Price;Sale Price;Date\n100033;INF123;;Fund;964.51;;;05-Aug-2026"

@pytest.mark.parametrize("body", [CURRENT, LEGACY])
def test_official_formats(body):
    assert parse_history(body) == {"100033": {date(2026, 8, 5): 964.51}}

@pytest.mark.parametrize("body", [CURRENT.split("\n")[1], CURRENT.replace("Net Asset Value", "Price"), CURRENT.replace("964.51", "nan"), CURRENT.replace("05-Aug-2026", "not-a-date"), CURRENT.replace("INF123;;", "INF123;")])
def test_schema_changes_fail_visibly(body):
    with pytest.raises(HistorySchemaError): parse_history(body)

def test_calendar_anchor_and_gap_limit():
    assert months_before(date(2024, 3, 31), 1) == date(2024, 2, 29)
    history = {date(2026, 8, 4): 964.51, date(2026, 7, 1): 900}
    assert trailing_return(history, 962.33, date(2026, 9, 4), months=1) == -0.23
    assert trailing_return({date(2026, 7, 1): 900}, 962.33, date(2026, 9, 4), months=1) is None

def test_partial_db_chunk_still_fetches_official_observations(monkeypatch):
    from scripts import build_performance as bp
    calls = []
    monkeypatch.setattr(bp, "fetch_series_db", lambda *_: {"100033": {date(2026, 8, 3): 100}})
    def fetch(start, end):
        calls.append((start, end)); return {"100033": {date(2026, 8, 4): 101}}
    monkeypatch.setattr(bp, "_fetch_window", fetch)
    result = bp.fetch_series(date(2026, 8, 5), 5)
    assert len(calls) == 1
    assert result["100033"][date(2026, 8, 4)] == 101
