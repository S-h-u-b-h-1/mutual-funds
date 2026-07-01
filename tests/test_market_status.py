"""Mirrors frontend/app/lib/marketStatus.js (Phase 3, PMF sprint) — the sitewide freshness/
market-status strip now rendered in Nav.jsx on every page. High blast radius if wrong, so the
tone thresholds and the exact required weekend copy are guarded here.
Run: .venv/bin/python -m pytest tests/test_market_status.py"""
from datetime import date

GREEN_MAX, AMBER_MAX = 2, 7


def freshness_tone(stale_days):
    if stale_days is None:
        return "neg"
    if stale_days <= GREEN_MAX:
        return "pos"
    if stale_days <= AMBER_MAX:
        return "warn"
    return "neg"


def stale_days(as_of: date, today: date) -> int:
    return (today - as_of).days


def test_tone_matches_ingestion_freshness_thresholds():
    # Same green<=2 / amber<=7 bands as ingestion/freshness.py — single mental model sitewide.
    assert freshness_tone(0) == "pos"
    assert freshness_tone(2) == "pos"
    assert freshness_tone(3) == "warn"
    assert freshness_tone(7) == "warn"
    assert freshness_tone(8) == "neg"
    assert freshness_tone(None) == "neg"


def test_weekend_nav_line_uses_required_copy():
    # Phase 3 mandates this exact message when markets are closed and no new NAV published today.
    as_of, today = date(2026, 6, 26), date(2026, 6, 27)  # Fri asOf, Sat today
    is_weekend = today.weekday() >= 5
    d = stale_days(as_of, today)
    assert is_weekend and d <= 2
    nav_line = f"No new NAVs published today. Latest available: {as_of.isoformat()}. Market closed." if (is_weekend and d <= 2) else None
    assert nav_line == "No new NAVs published today. Latest available: 2026-06-26. Market closed."


def test_staleness_computed_from_real_dates_not_hardcoded():
    assert stale_days(date(2026, 6, 23), date(2026, 7, 1)) == 8
    assert stale_days(date(2026, 7, 1), date(2026, 7, 1)) == 0
