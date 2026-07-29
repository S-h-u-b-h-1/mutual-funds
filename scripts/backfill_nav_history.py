"""
One-time historical NAV depth backfill for fact_nav_daily.

Why this exists (2026-07-29 P0 incident): production-refresh.yml failed on every run for 4+ days
because scripts.build_performance's dense 90-day series and long-window anchors depend on AMFI's
DownloadNAVHistoryReport_Po.aspx endpoint, which is reliably reachable from outside GitHub Actions
but was timing out / returning fixed-size unparseable responses to every GH Actions runner in that
window -- the signature of a network-path/IP-range block, not a genuine AMFI outage (confirmed:
the same endpoint returns real multi-MB data in seconds when called from this environment). See
build_performance.fetch_series()'s own docstring for the full incident account and the DB-first
fix that reduces (but does not eliminate) the pipeline's dependency on that endpoint.

fetch_series() now trusts the DB (fact_nav_daily, populated daily by cloud_pipeline, which kept
succeeding throughout this incident) for any date range it already covers, but daily-forward
accumulation alone only reached ~21-26 days of depth for most schemes as of this incident -- short
of the 30 days scripts.build_performance needs for r1m, the metric assert_returns_usable gates on.
This script closes that gap in one run, using the exact same HTTP endpoint (confirmed reachable
from here) and the exact same idempotent (scheme_code, nav_date) upsert cloud_pipeline.py already
uses for its own daily writes -- so this is additive/idempotent, not a new write path, and safe to
re-run (a re-run just re-upserts identical historical rows, a no-op).

    DATABASE_URL=... [SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...] \\
        python -m scripts.backfill_nav_history --days 120

DATABASE_URL (Neon) is required -- that's what build_performance.py's own DB fallback reads.
SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are optional; omit them to write Neon-only (e.g. from a
local environment without Supabase credentials) and re-run later with both set to backfill
Supabase too and keep the two stores in sync.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.error
from datetime import date, datetime, timezone

from ingestion import db as neon_db
from ingestion.db import connect
from scripts.build_performance import _fetch_window

SUPABASE_AVAILABLE = bool(os.environ.get("SUPABASE_URL")) and bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
if SUPABASE_AVAILABLE:
    from scripts.cloud_pipeline import _post


def _post_with_diagnostics(table, rows, on_conflict=None):
    # cloud_pipeline._post() doesn't surface the response body on a non-2xx status (urlopen raises
    # before its own assert can run) -- this wrapper exists ONLY to print that body for diagnosis;
    # it does not change the write itself, still delegates to the exact same shared function.
    try:
        _post(table, rows, on_conflict)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:2000]
        print(f"::error::Supabase _post({table}) failed: HTTP {e.code} {e.reason}. Body: {body}", file=sys.stderr)
        raise


def _known_scheme_codes() -> set[str]:
    # fact_nav_daily.scheme_code has a foreign key into dim_scheme (found live: a 100-day backfill
    # 409'd with "Key (scheme_code)=(150562) is not present in table dim_scheme" -- historical AMFI
    # data includes codes for schemes since merged/renamed/delisted that no longer exist in
    # dim_scheme, which cloud_pipeline.py only ever populates from the CURRENT day's NAVAll.txt).
    # Filtering to what's currently known is correct, not just constraint-satisfying:
    # build_performance.py's own main() only ever processes scheme codes present in TODAY's dim
    # (`if code not in now_nav: continue`), so historical facts for long-gone codes would be dead
    # weight even if the write succeeded.
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("select scheme_code from dim_scheme")
            return {row[0] for row in cur.fetchall()}


def backfill(asof: date, days: int, chunk_days: int = 44) -> dict:
    if not SUPABASE_AVAILABLE:
        print("::warning::SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set -- writing to Neon "
              "(DATABASE_URL) only this run. build_performance.py's own DB fallback (fetch_series_db) "
              "reads exclusively from DATABASE_URL, so this still fixes the active pipeline "
              "incident; re-run with Supabase credentials later to keep both stores in sync.",
              file=sys.stderr)
    known_codes = _known_scheme_codes()
    print(f"-- {len(known_codes)} scheme codes currently in dim_scheme", file=sys.stderr)
    started = datetime.now(timezone.utc).isoformat()
    start = date.fromordinal(asof.toordinal() - days)
    total_rows = 0
    cur = start
    while cur <= asof:
        chunk_to = min(date.fromordinal(cur.toordinal() + chunk_days), asof)
        print(f"-- fetching {cur} to {chunk_to}...", file=sys.stderr)
        window = _fetch_window(cur, chunk_to)
        skipped = sum(1 for code in window if code not in known_codes)
        navs = [
            {"scheme_code": code, "nav_date": d.isoformat(), "nav_value": nav,
             "source": "AMFI:DownloadNAVHistoryReport_Po", "ingested_at": started}
            for code, series in window.items() if code in known_codes
            for d, nav in series.items()
        ]
        if skipped:
            print(f"   skipping {skipped} scheme(s) not in dim_scheme (merged/renamed/delisted since this historical window)", file=sys.stderr)
        if navs:
            if SUPABASE_AVAILABLE:
                _post_with_diagnostics("fact_nav_daily", navs, "scheme_code,nav_date")
            neon_db.dual_write(lambda conn, rows=navs: neon_db.upsert(conn, "fact_nav_daily", rows, ["scheme_code", "nav_date"]))
            print(f"   upserted {len(navs)} rows ({len(window)} schemes) for {cur}..{chunk_to}", file=sys.stderr)
            total_rows += len(navs)
        else:
            print(f"   ::warning::no data for {cur}..{chunk_to} -- endpoint returned nothing usable for this window", file=sys.stderr)
        cur = date.fromordinal(chunk_to.toordinal() + 1)
    return {"start": start.isoformat(), "end": asof.isoformat(), "rows_upserted": total_rows, "supabase_written": SUPABASE_AVAILABLE}


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--days", type=int, default=120, help="How many days of history to backfill (default 120)")
    p.add_argument("--asof", type=str, default=None, help="End date YYYY-MM-DD (default: today)")
    args = p.parse_args()
    asof = date.fromisoformat(args.asof) if args.asof else date.today()
    result = backfill(asof, args.days)
    print(f"backfill_nav_history: {result}")
