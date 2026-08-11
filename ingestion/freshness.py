"""Pure freshness helpers (no DB, no network) — easy to unit-test."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

GREEN_MAX = 2   # days
AMBER_MAX = 7
COVERAGE_MIN = 0.85  # below this fraction of the baseline scheme count, a date that technically
# exists in fact_nav_daily is still treated as an incomplete/PARTIAL ingestion, not CURRENT.
# Chosen from real production data (2026-08-10 incident): a genuine late-evening straggler tail
# still clears 90%+; the actual incident (AMFI's file caught before most AMCs had uploaded) was
# 5/8109 ~= 0.06%. 0.85 sits well below normal noise and well above a real near-total miss.


def staleness_days(latest: Optional[date], today: Optional[date] = None) -> Optional[int]:
    if latest is None:
        return None
    return ((today or date.today()) - latest).days


def freshness_status(latest: Optional[date], today: Optional[date] = None,
                     green: int = GREEN_MAX, amber: int = AMBER_MAX) -> str:
    s = staleness_days(latest, today)
    if s is None:
        return "red"
    if s <= green:
        return "green"
    if s <= amber:
        return "amber"
    return "red"


def is_stale(latest: Optional[date], today: Optional[date] = None, max_days: int = GREEN_MAX) -> bool:
    s = staleness_days(latest, today)
    return s is None or s > max_days


def build_health(latest: Optional[date], total_schemes=None, total_nav_rows=None,
                 total_events=None, flow_latest_month=None, today: Optional[date] = None) -> dict:
    """Construct a fact_system_health snapshot row (status derived from freshness)."""
    return {
        "nav_latest_date": latest.isoformat() if latest else None,
        "nav_staleness_days": staleness_days(latest, today),
        "total_schemes": total_schemes,
        "total_nav_rows": total_nav_rows,
        "total_events": total_events,
        "flow_latest_month": flow_latest_month,
        "status": freshness_status(latest, today),
    }


# ---------------------------------------------------------------------------
# Coverage-aware, business-day-aware freshness (2026-08-11 incident fix).
#
# Root cause of the incident this was built for: fact_nav_daily genuinely contained a row dated
# 2026-08-10 (a real trading day) with nav_date = the max in the table, so every existing check
# above (freshness_status / is_stale / alert_for_run) reported "green" / "0 days stale" — but
# only 5 of the ~8,500 normally-active schemes actually had that date; the other ~8,469 were
# still sitting on 2026-08-07. MAX(nav_date) alone cannot distinguish "the newest date exists for
# everyone" from "the newest date exists for almost no one" — both look identical to a
# single-date check. These functions add the missing dimension: what FRACTION of the normal
# scheme universe actually has the date being judged.
# ---------------------------------------------------------------------------

def expected_trading_day(today: Optional[date] = None) -> date:
    """The most recent business day whose NAV should already be in the warehouse by `today`.

    AMFI publishes day T's NAV during the evening of T, so by any time on T+1 it should have
    landed. Walks back from today-1 to the nearest Mon-Fri. Deliberately weekday-only — this
    does NOT know the NSE/BSE trading-holiday calendar (a real, documented limitation; a genuine
    exchange holiday will be misreported as one extra day of expected staleness until a holiday
    calendar is wired in — see docs/DATA_FRESHNESS_ARCHITECTURE.md)."""
    d = (today or date.today()) - timedelta(days=1)
    while d.weekday() >= 5:  # 5=Saturday, 6=Sunday
        d -= timedelta(days=1)
    return d


def coverage_ratio(schemes_at_date: Optional[int], baseline: Optional[int]) -> Optional[float]:
    """Fraction of the baseline scheme universe present at a given date. None if no baseline."""
    if not baseline:
        return None
    return (schemes_at_date or 0) / baseline


def coverage_baseline(date_counts: dict, exclude: Optional[date] = None, lookback_weekdays: int = 5) -> Optional[int]:
    """Baseline scheme count = the max distinct-scheme count across the most recent
    `lookback_weekdays` WEEKDAY dates present in `date_counts` (a {date: count} mapping),
    excluding `exclude` (typically the date being judged) and excluding weekends outright —
    Saturday/Sunday NAV counts are naturally near-zero (only a handful of liquid/overnight funds
    report) and would silently corrupt an average-based baseline. Max, not average or latest
    single day, so one unusually-light prior weekday can't itself lower the bar being judged
    against. Returns None if no qualifying weekday data exists yet (e.g. a brand-new warehouse)."""
    candidates = sorted((d for d in date_counts if d != exclude and d.weekday() < 5), reverse=True)[:lookback_weekdays]
    if not candidates:
        return None
    return max(date_counts[d] for d in candidates)


def classify_freshness(latest_date: Optional[date], schemes_at_latest: Optional[int],
                       baseline_schemes: Optional[int], today: Optional[date] = None,
                       coverage_min: float = COVERAGE_MIN) -> str:
    """Coverage- and business-day-aware freshness state for the warehouse's current latest date.

    STALE:   the max date itself is older than the expected trading day (a multi-day outage, or
             the whole pipeline hasn't run) -- the OLD max-date-only checks still catch this case.
    PARTIAL: the right date is present, but too few schemes have it yet -- the case the old
             checks missed entirely (this incident's actual root cause).
    CURRENT: the right date is present for a healthy fraction of the normal scheme universe.
    UNKNOWN: not enough information to judge (no date, or no baseline to compare coverage against).
    """
    if latest_date is None:
        return "UNKNOWN"
    expected = expected_trading_day(today)
    if latest_date < expected:
        return "STALE"
    if not baseline_schemes:
        return "UNKNOWN"
    coverage = coverage_ratio(schemes_at_latest, baseline_schemes)
    if coverage is not None and coverage < coverage_min:
        return "PARTIAL"
    return "CURRENT"
