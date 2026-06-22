"""
Seed a Supabase project via its PostgREST REST API (no DB password needed).

Uses the publishable/anon key + RLS insert policies. Runs locally and batches
rows, so it loads the full dataset without going through any MCP tool. Idempotent
via PostgREST upsert (Prefer: resolution=merge-duplicates).

    SUPABASE_URL=... SUPABASE_ANON_KEY=... \
      .venv/bin/python -m scripts.seed_supabase data/NAVAll.txt
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request

from ingestion.amfi_parser import parse_file

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_ANON_KEY"]
BATCH = 1000


def post(table: str, rows: list[dict], on_conflict: str) -> None:
    endpoint = f"{URL}/rest/v1/{table}?on_conflict={on_conflict}"
    total = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(chunk).encode(),
            method="POST",
            headers={
                "apikey": KEY,
                "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            assert resp.status in (200, 201, 204), resp.status
        total += len(chunk)
        print(f"  {table}: {total}/{len(rows)}")


def main(path: str) -> None:
    records = list(parse_file(path))
    run_date = max((r.nav_date for r in records if r.nav_date)).isoformat()

    # dim_scheme — dedupe by scheme_code (PK)
    dim_by_code: dict[str, dict] = {}
    for r in records:
        dim_by_code[r.scheme_code] = {
            "scheme_code": r.scheme_code,
            "scheme_name": r.scheme_name,
            "amc_name": r.amc_name,
            "asset_class": r.asset_class,
            "scheme_type": r.scheme_type,
            "category_raw": r.category_raw,
            "isin_growth": r.isin_growth,
            "isin_reinvest": r.isin_reinvest,
            "first_seen": run_date,
            "last_seen": run_date,
        }
    dim_rows = list(dim_by_code.values())

    nav_rows = [
        {
            "scheme_code": r.scheme_code,
            "nav_date": r.nav_date.isoformat(),
            "nav_value": r.nav_value,
        }
        for r in records
        if r.nav_date and r.nav_value is not None
    ]

    print(f"Seeding {len(dim_rows)} schemes, {len(nav_rows)} NAV rows -> {URL}")
    post("dim_scheme", dim_rows, "scheme_code")
    post("fact_nav_daily", nav_rows, "scheme_code,nav_date")
    print("Done.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/NAVAll.txt")
