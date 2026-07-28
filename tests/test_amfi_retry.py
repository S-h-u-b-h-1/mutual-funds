"""Regression tests for two production incidents on AMFI's NAV history endpoint.

2026-07-10: returned 200 OK — no error banner, no exception — but zero parseable data rows,
for all 3 requests in one Production Refresh run, while the same endpoint/parser succeeded
seconds later for a different window in the same run (and a manual replay afterwards returned
full valid data). _fetch_window only retried on exceptions or AMFI's "Please Select Date
Range" banner, so this silently produced null r1m/r3m for every fund — the data-quality gate
correctly caught it (test_scores.py::test_health_in_range_on_real_data), but the pipeline
should not have needed that gate to survive a transient response in the first place.
Fix: scripts/build_performance.py's _fetch_window now retries a 200-with-zero-rows response
the same way it already retried exceptions and rate-limit banners.

2026-07-23 through at least 2026-07-28: production-refresh failed assert_returns_usable on
every single run for 5+ days straight, always at ~28-30% coverage — not the noisy,
self-heals-within-24h pattern a real AMFI outage produces, and not the near-0% signature of
the 2026-07-10 incident either. Root cause, confirmed 2026-07-28 by instrumenting a live run:
the gate compared with30d against coverage['priced'] — every scheme with a current NAV,
including IDCW-option schemes (~53% of 'priced' that day), which main() unconditionally nulls
r1m out for regardless of whether the AMFI fetch succeeded. So with30d could never
structurally clear a 50%-of-priced floor. The AMFI pipeline itself was never broken: the same
instrumented run measured 99.1% coverage once scoped to active, non-IDCW schemes (the
"investable" cohort docs/DATA_COVERAGE_MATRIX.md separately documents at ~99.6%). Fix:
assert_returns_usable now gates on coverage['activeEligible'] / coverage['activeEligibleWith30d']
(active AND not IDCW) instead of priced/with30d.
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
    """2026-07-10-class incident: a sustained gap (multiple consecutive chunks each giving up
    after 4 attempts) left r1m null for every fund in one production-refresh run. That should
    be caught here, at the source, not several steps later as a bare `assert ([])` in
    test_scores.py."""
    with pytest.raises(SystemExit):
        assert_returns_usable({"activeEligible": 4000, "activeEligibleWith30d": 0})


def test_build_aborts_on_the_2026_07_23_incident_signature():
    """Reproduces the 2026-07-23..07-28 incident's actual coverage shape: with30d/priced
    (unscoped) sat at ~28-30% every run purely because IDCW schemes were counted in the
    denominator — but once scoped to activeEligible (active, non-IDCW) the same run's real
    coverage was 99.1%, comfortably healthy. This test asserts the *scoped* gate still
    correctly aborts on a genuine shortfall within that population, so the fix isn't just
    "always pass"."""
    with pytest.raises(SystemExit):
        assert_returns_usable({"activeEligible": 4000, "activeEligibleWith30d": 1200})


def test_build_proceeds_on_normal_returns_coverage():
    """A healthy fetch measures ~99% r1m coverage among active, non-IDCW schemes (verified
    2026-07-28 by instrumenting a live run: 3956/3991 = 99.1%; see assert_returns_usable's
    docstring) — comfortably above the 50% floor."""
    assert_returns_usable({"activeEligible": 3991, "activeEligibleWith30d": 3956}) is None
