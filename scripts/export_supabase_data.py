"""
Phase 1 migration: export every Supabase table's current contents to local JSON files, for
backfilling a new Neon project (see docs/NEON_MIGRATION_AUDIT.md, Phase 2). Read-only,
paginated, safe to re-run any time a fresher snapshot is needed — this is a point-in-time
export, not a live sync (dual-write in scripts/cloud_pipeline.py etc. handles that going
forward, once DATABASE_URL exists).

market_quotes/market_quote_runs are deliberately excluded: they don't exist in Supabase yet
(Neon-only additions — see docs/NEON_MIGRATION_AUDIT.md's table inventory), so there's nothing
to export for them.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m scripts.export_supabase_data [outdir]
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PAGE = 5000

TABLES = [
    "dim_scheme", "fact_nav_daily", "fact_pipeline_runs", "fact_system_health",
    "news_sources", "news_articles", "news_entities", "news_market_links", "news_sentiment",
    "news_ingestion_runs", "factsheet_archive", "fund_history_events",
    "user_events", "alerts", "advisor_leads",
]


def fetch_all(table: str) -> list:
    rows = []
    offset = 0
    while True:
        req = urllib.request.Request(
            f"{URL}/rest/v1/{table}?select=*&limit={PAGE}&offset={offset}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            batch = json.loads(r.read())
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def main() -> int:
    if not URL or not KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.", file=sys.stderr)
        return 1
    outdir = sys.argv[1] if len(sys.argv) > 1 else "sql/neon/export"
    os.makedirs(outdir, exist_ok=True)
    total = 0
    for table in TABLES:
        rows = fetch_all(table)
        path = os.path.join(outdir, f"{table}.json")
        with open(path, "w") as f:
            json.dump(rows, f)
        total += len(rows)
        print(f"{table}: {len(rows)} rows -> {path}")
    print(f"-- exported {total} rows across {len(TABLES)} tables to {outdir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
