"""Dated official fixtures: independently fetched/compared by verify_financial_samples."""
import json
from datetime import date, timedelta
from pathlib import Path

import pytest
from ingestion.amfi_history import trailing_return
from scripts.build_performance import risk_from_series

FIXTURE = json.loads((Path(__file__).parent / "fixtures/financial/amfi_golden.json").read_text())


@pytest.mark.parametrize("sample", FIXTURE["samples"], ids=lambda row: row["code"])
def test_official_golden(sample):
    asof = date.fromisoformat(FIXTURE["asOf"])
    history = {date.fromisoformat(day): float(nav) for day, nav in sample["observations"].items()}
    expected = sample["expected"]
    for key, months in [("r1m", 1), ("r3m", 3), ("r6m", 6), ("r1y", 12), ("r3y", 36), ("r5y", 60)]:
        actual = trailing_return(history, expected["nav"], asof, months=months, annualized=months > 12)
        assert actual == expected[key]
    risk = risk_from_series({day: nav for day, nav in history.items() if asof - timedelta(days=90) <= day <= asof})
    assert risk["vol90"] == expected["vol90"]
    assert risk["maxdd90"] == expected["maxdd90"]
