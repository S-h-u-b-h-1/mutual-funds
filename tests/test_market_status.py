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


def _nav_line(as_of: date, today: date) -> str:
    d = stale_days(as_of, today)
    is_weekend = today.weekday() >= 5
    pretty = as_of.strftime("%-d %b %Y")
    if d == 0:
        return f"Latest NAV: today ({as_of.isoformat()})"
    if d == 1:
        return f"No fresh NAV has been published yet today. Latest available AMFI NAV date: {pretty}." + (" Market closed." if is_weekend else "")
    return f"Latest NAV: {as_of.isoformat()} ({d}d ago)"


def test_weekend_nav_line_uses_required_copy():
    # Weekend, 1 day behind (Fri's NAV, Sat today) — market genuinely closed, say so.
    as_of, today = date(2026, 6, 26), date(2026, 6, 27)  # Fri asOf, Sat today
    assert _nav_line(as_of, today) == "No fresh NAV has been published yet today. Latest available AMFI NAV date: 26 Jun 2026. Market closed."


def test_weekday_nav_line_uses_phase8_example_copy():
    # Phase 8 (2026-07-01 sprint) mandates this exact phrasing for the real production state:
    # a weekday still waiting for today's evening AMFI publish (not a weekend, no "market closed").
    as_of, today = date(2026, 6, 30), date(2026, 7, 1)  # Tue asOf, Wed today
    assert today.weekday() < 5
    assert _nav_line(as_of, today) == "No fresh NAV has been published yet today. Latest available AMFI NAV date: 30 Jun 2026."


def test_staleness_computed_from_real_dates_not_hardcoded():
    assert stale_days(date(2026, 6, 23), date(2026, 7, 1)) == 8
    assert stale_days(date(2026, 7, 1), date(2026, 7, 1)) == 0
