"""Freshness + health-snapshot logic (pure, no DB)."""

from datetime import date

from ingestion.freshness import (
    build_health, freshness_status, is_stale, staleness_days,
    expected_trading_day, coverage_ratio, coverage_baseline, classify_freshness,
)

T = date(2026, 6, 24)  # fixed "today" for determinism


def test_status_thresholds():
    assert freshness_status(date(2026, 6, 24), T) == "green"  # 0d
    assert freshness_status(date(2026, 6, 22), T) == "green"  # 2d
    assert freshness_status(date(2026, 6, 21), T) == "amber"  # 3d
    assert freshness_status(date(2026, 6, 17), T) == "amber"  # 7d
    assert freshness_status(date(2026, 6, 16), T) == "red"    # 8d
    assert freshness_status(None, T) == "red"


def test_staleness_and_is_stale():
    assert staleness_days(date(2026, 6, 21), T) == 3
    assert is_stale(date(2026, 6, 21), T) is True   # > 2 days
    assert is_stale(date(2026, 6, 23), T) is False  # 1 day
    assert is_stale(None, T) is True


def test_build_health_snapshot():
    h = build_health(date(2026, 6, 21), total_schemes=14219, total_nav_rows=15438, total_events=22, today=T)
    assert h["status"] == "amber"
    assert h["nav_staleness_days"] == 3
    assert h["total_schemes"] == 14219
    assert h["nav_latest_date"] == "2026-06-21"


# ---------------------------------------------------------------------------
# Coverage-aware, business-day-aware freshness (2026-08-11 incident fix).
# ---------------------------------------------------------------------------

def test_expected_trading_day_weekday():
    # Wednesday -> the Tuesday before it.
    assert expected_trading_day(date(2026, 6, 24)) == date(2026, 6, 23)


def test_expected_trading_day_monday_skips_weekend():
    # Monday -> Friday (skip Sun 21, Sat 20), not Sunday.
    assert expected_trading_day(date(2026, 6, 22)) == date(2026, 6, 19)


def test_expected_trading_day_weekend_both_land_on_friday():
    assert expected_trading_day(date(2026, 6, 20)) == date(2026, 6, 19)  # Saturday
    assert expected_trading_day(date(2026, 6, 21)) == date(2026, 6, 19)  # Sunday


def test_coverage_ratio():
    assert coverage_ratio(5, 8109) == 5 / 8109
    assert coverage_ratio(8109, 8109) == 1.0
    assert coverage_ratio(100, 0) is None    # no baseline -> can't judge
    assert coverage_ratio(100, None) is None
    assert coverage_ratio(None, 100) == 0.0  # missing count treated as zero, not unknown


def test_coverage_baseline_excludes_weekends_and_target_uses_max_not_average():
    date_counts = {
        date(2026, 8, 10): 5,       # Monday, the target being judged -- must be excluded
        date(2026, 8, 9): 691,      # Sunday -- must be excluded (weekend noise)
        date(2026, 8, 8): 54,       # Saturday -- must be excluded (weekend noise)
        date(2026, 8, 7): 8474,     # Friday
        date(2026, 8, 6): 8631,     # Thursday -- the real max
        date(2026, 8, 5): 8619,     # Wednesday
    }
    baseline = coverage_baseline(date_counts, exclude=date(2026, 8, 10))
    assert baseline == 8631  # max of the weekday counts, not an average (which would be ~8575)


def test_coverage_baseline_no_weekday_data_yet():
    assert coverage_baseline({date(2026, 8, 9): 691, date(2026, 8, 8): 54}, exclude=None) is None


def test_classify_freshness_incident_replay():
    # The real 2026-08-10 incident: fact_nav_daily's MAX(nav_date) was already "today's" expected
    # trading day (Monday 08-10, checked the morning of Tuesday 08-11) -- every check that only
    # looks at the max date would call this CURRENT -- but only 5 of the ~8,600 normally-active
    # schemes actually had that date.
    today = date(2026, 8, 11)
    date_counts = {
        date(2026, 8, 10): 5, date(2026, 8, 9): 691, date(2026, 8, 8): 54,
        date(2026, 8, 7): 8474, date(2026, 8, 6): 8631, date(2026, 8, 5): 8619,
    }
    baseline = coverage_baseline(date_counts, exclude=date(2026, 8, 10))
    state = classify_freshness(date(2026, 8, 10), date_counts[date(2026, 8, 10)], baseline, today=today)
    assert state == "PARTIAL"


def test_classify_freshness_after_the_fix_runs():
    # Same day, after a later run actually caught AMFI's now-complete file (real production
    # numbers from the 2026-08-11 re-run: 8,109 of the baseline 8,631 schemes).
    state = classify_freshness(date(2026, 8, 10), 8109, 8631, today=date(2026, 8, 11))
    assert state == "CURRENT"


def test_classify_freshness_stale_ignores_coverage():
    # The max date itself is behind the expected trading day -- a multi-day outage. STALE
    # regardless of how good coverage looked on that old date.
    state = classify_freshness(date(2026, 6, 17), 8600, 8600, today=T)
    assert state == "STALE"


def test_classify_freshness_weekend_not_marked_stale():
    # Mission spec: "If today is Sunday and Friday is the latest expected NAV, do not mark it
    # stale." Friday's NAV, fully covered, checked on Saturday and Sunday -- both CURRENT.
    assert classify_freshness(date(2026, 6, 19), 8600, 8600, today=date(2026, 6, 20)) == "CURRENT"  # Sat
    assert classify_freshness(date(2026, 6, 19), 8600, 8600, today=date(2026, 6, 21)) == "CURRENT"  # Sun


def test_classify_freshness_unknown_without_enough_information():
    assert classify_freshness(None, None, None) == "UNKNOWN"
    assert classify_freshness(date(2026, 8, 10), 100, None, today=date(2026, 8, 11)) == "UNKNOWN"
