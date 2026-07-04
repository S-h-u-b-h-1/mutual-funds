"""
Phase 1 migration verification: compare row counts between Supabase and Neon for every table
sql/neon/001_neon_schema.sql mirrors. Read-only, side-effect-free.

A count match does NOT prove the two databases hold identical rows — only that dual-write
(where wired, see scripts/cloud_pipeline.py / ingest_news.py / archive_factsheets.py) is
producing comparable volumes. A count mismatch DOES prove something is wrong and is worth
investigating before treating Neon as a trustworthy read source for that table.

Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase) and DATABASE_URL (Neon). Exits 0
with a clear "Neon not configured" report if DATABASE_URL is unset — this is the expected state
until a Neon project actually exists (see docs/NEON_MIGRATION_AUDIT.md); it is not an error.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... python -m scripts.compare_supabase_neon_counts
"""
from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request

from ingestion import db as neon_db

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Every table sql/neon/001_neon_schema.sql mirrors, plus the two materialized views (a proxy for
# whether refresh_analytics() is keeping Neon's derived layer in step with Supabase's).
# market_quotes/market_quote_runs are Neon-only by design (confirmed live 2026-07-04: no such
# tables exist in Supabase yet — Market Terminal quotes were never persisted anywhere before this
# migration) — see supabase_count()'s "missing" handling below, not a mismatch to chase.
TABLES = [
    "dim_scheme", "fact_nav_daily", "fact_pipeline_runs", "fact_system_health",
    "news_sources", "news_articles", "news_entities", "news_market_links", "news_sentiment",
    "news_ingestion_runs", "market_quotes", "market_quote_runs",
    "factsheet_archive", "fund_history_events",
    "user_events", "alerts", "advisor_leads",
]
MATVIEWS = ["mv_asset_class_summary", "mv_amc_summary"]


def supabase_count(relation: str):
    # select=* (not a named column) since not every table has an `id` column (e.g.
    # dim_scheme/fact_nav_daily use natural-key primary keys) — PostgREST's exact count comes
    # from the Content-Range header regardless of which columns are actually selected.
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{relation}?select=*&limit=1",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Prefer": "count=exact"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rng = r.headers.get("Content-Range", "*/0")
            return int(rng.split("/")[-1] or 0)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "missing"  # relation doesn't exist in Supabase — expected for Neon-only additions
        print(f"  ! supabase count failed for {relation}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  ! supabase count failed for {relation}: {e}", file=sys.stderr)
        return None


def neon_counts(relations: list[str]) -> dict:
    counts = {}
    try:
        with neon_db.connect() as conn:
            for relation in relations:
                try:
                    with conn.cursor() as cur:
                        cur.execute(f"select count(*) from {relation}")
                        counts[relation] = cur.fetchone()[0]
                except Exception as e:
                    print(f"  ! neon count failed for {relation}: {e}", file=sys.stderr)
                    counts[relation] = None
    except Exception as e:
        print(f"! could not connect to Neon at all: {e}", file=sys.stderr)
        for relation in relations:
            counts.setdefault(relation, None)
    return counts


def report(relations: list[str], n_counts: dict) -> list[str]:
    mismatches = []
    for relation in relations:
        s = supabase_count(relation)
        n = n_counts.get(relation)
        if s == "missing":
            status = "not in Supabase (Neon-only by design)"
        elif s is None or n is None:
            status = "ERROR"
            mismatches.append(relation)
        elif s == n:
            status = "match"
        else:
            status = f"MISMATCH (supabase - neon = {s - n:+d})"
            mismatches.append(relation)
        print(f"{relation:<26} {str(s):>10} {str(n):>10}  {status}")
    return mismatches


def main() -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot compare.", file=sys.stderr)
        return 1
    if not neon_db.neon_enabled():
        print("DATABASE_URL not set — Neon not configured yet. Nothing to compare against.")
        print("This is expected until a Neon project exists (see docs/NEON_MIGRATION_AUDIT.md).")
        return 0

    print(f"{'relation':<26} {'supabase':>10} {'neon':>10}  status")
    print("-" * 62)
    table_mismatches = report(TABLES, neon_counts(TABLES))
    print("-" * 62)
    matview_mismatches = report(MATVIEWS, neon_counts(MATVIEWS))

    mismatches = table_mismatches + matview_mismatches
    print()
    if mismatches:
        print(f"{len(mismatches)}/{len(TABLES) + len(MATVIEWS)} relations mismatched or errored: {', '.join(mismatches)}")
        print("A mismatch is expected for any relation dual-write hasn't run against yet (e.g.")
        print("before the first post-cutover ingestion run) — investigate before treating Neon as")
        print("a trustworthy read source for that relation.")
        return 1
    print(f"All {len(TABLES) + len(MATVIEWS)} relations match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
