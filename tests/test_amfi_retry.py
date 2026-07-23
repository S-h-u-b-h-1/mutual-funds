"""Regression test for the 2026-07-10 production incident: AMFI's NAV history endpoint
returned 200 OK — no error banner, no exception — but zero parseable data rows, for all 3
requests in one Production Refresh run, while the same endpoint/parser succeeded seconds
later for a different window in the same run (and a manual replay afterwards returned full
valid data). _fetch_window only retried on exceptions or AMFI's "Please Select Date Range"
banner, so this silently produced null r1m/r3m for every fund — the data-quality gate
correctly caught it (test_scores.py::test_health_in_range_on_real_data), but the pipeline
should not have needed that gate to survive a transient response in the first place.
Fix: scripts/build_performance.py's _fetch_window now retries a 200-with-zero-rows response
the same way it already retried exceptions and rate-limit banners.
"""
import time
import urllib.request
from datetime import date

import pytest

from scripts.build_performance import _fetch_window, assert_returns_usable

VALID_ROW = "100033;INF209K01165;-;Test Fund;123.45;-;-;01-Jul-2026"
EMPTY_BODY = "Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Repurchase Price;Sale Price;Date\n"


class FakeResponse:
    def __init__(self, body: str):
        self._body = body.encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_fetch_window_retries_on_200_with_zero_parsed_rows(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout=120):
        calls.append(req.full_url)
        # First 2 calls: a 200 OK with a valid-looking header but zero data rows (the exact
        # observed bug). 3rd call: the same request finally returns real data.
        return FakeResponse(EMPTY_BODY if len(calls) <= 2 else EMPTY_BODY + VALID_ROW + "\n")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(time, "sleep", lambda s: None)  # don't actually wait in tests

    result = _fetch_window(date(2026, 6, 1), date(2026, 7, 1))

    assert len(calls) == 3, f"expected exactly 3 attempts (2 empty + 1 valid), got {len(calls)}"
    assert result == {"100033": {date(2026, 7, 1): 123.45}}, "must return the data from the retry, not give up on the first empty parse"


def test_fetch_window_gives_up_after_4_consecutive_empty_responses(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout=120):
        calls.append(req.full_url)
        return FakeResponse(EMPTY_BODY)

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(time, "sleep", lambda s: None)

    result = _fetch_window(date(2026, 6, 1), date(2026, 7, 1))

    assert len(calls) == 4, f"must cap at 4 attempts, not retry forever (got {len(calls)})"
    assert result == {}, "a genuinely persistent empty result must still surface as {} — the data-quality gate is what should catch this, not an infinite retry"


def test_fetch_window_still_retries_on_rate_limit_banner(monkeypatch):
    """Confirms the new empty-rows retry didn't regress the existing rate-limit retry path."""
    calls = []

    def fake_urlopen(req, timeout=120):
        calls.append(req.full_url)
        if len(calls) == 1:
            return FakeResponse("Please Select Date Range")
        return FakeResponse(EMPTY_BODY + VALID_ROW + "\n")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(time, "sleep", lambda s: None)

    result = _fetch_window(date(2026, 6, 1), date(2026, 7, 1))

    assert len(calls) == 2
    assert result == {"100033": {date(2026, 7, 1): 123.45}}


def test_build_aborts_when_returns_pipeline_comes_back_empty():
    """2026-07-2x: a sustained gap (multiple consecutive chunks each giving up after 4 attempts,
    per this file's docstring incident class) left r1m null for every fund in one production-
    refresh run. That should be caught here, at the source, not several steps later as a bare
    `assert ([])` in test_scores.py."""
    with pytest.raises(SystemExit):
        assert_returns_usable({"priced": 14000, "with30d": 0})


def test_build_proceeds_on_normal_returns_coverage():
    """~99% r1m coverage (the documented normal case) must never trip the guard."""
    assert_returns_usable({"priced": 14000, "with30d": 13900}) is None
