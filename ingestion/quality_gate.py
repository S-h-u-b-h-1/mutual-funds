"""
Data-quality gate (Day 7).

Runs business-rule checks against the warehouse and exits non-zero if any fail,
so the Airflow DAG can halt/alert before serving bad data. Checks:

  1. No NEGATIVE NAVs (zero is allowed — AMFI reports 0 for some wound-up pools).
  2. Every scheme's asset_class is in the accepted set.
  3. Freshness: the latest nav_date is within MAX_STALE_DAYS of today.
  4. Coverage floor: dim_scheme holds at least MIN_SCHEMES rows (catches a broken
     load that wiped most of the universe). NAVAll's date column is per-scheme, so
     a per-nav_date delta is the wrong metric — an absolute floor is correct here.

    python -m ingestion.quality_gate           # exits 1 on any failure
"""

from __future__ import annotations

import sys
from datetime import date, timedelta

from .db import connect

ACCEPTED_CLASSES = {"Equity", "Debt", "Hybrid", "Solution", "Other"}
MAX_STALE_DAYS = 5
MIN_SCHEMES = 8000


def _scalar(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()[0]


def run_checks() -> list[str]:
    failures: list[str] = []
    with connect() as conn:
        with conn.cursor() as cur:
            bad_nav = _scalar(cur, "SELECT count(*) FROM fact_nav_daily WHERE nav_value < 0")
            if bad_nav:
                failures.append(f"{bad_nav} NAV rows with NEGATIVE value")

            cur.execute("SELECT DISTINCT asset_class FROM dim_scheme")
            classes = {r[0] for r in cur.fetchall()}
            unexpected = classes - ACCEPTED_CLASSES
            if unexpected:
                failures.append(f"unexpected asset_class values: {sorted(unexpected)}")

            latest = _scalar(cur, "SELECT max(nav_date) FROM fact_nav_daily")
            if latest is None:
                failures.append("no NAV data at all")
            elif (date.today() - latest) > timedelta(days=MAX_STALE_DAYS):
                failures.append(f"stale data: latest nav_date {latest} is > {MAX_STALE_DAYS} days old")

            scheme_count = _scalar(cur, "SELECT count(*) FROM dim_scheme")
            if scheme_count < MIN_SCHEMES:
                failures.append(f"only {scheme_count} schemes (< floor {MIN_SCHEMES}) — load may be broken")
    return failures


def main() -> int:
    failures = run_checks()
    if failures:
        print("QUALITY GATE FAILED:")
        for f in failures:
            print(f"  ✗ {f}")
        return 1
    print("Quality gate passed ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
