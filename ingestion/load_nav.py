"""
Download (or read) the AMFI NAVAll file, parse it, and load into Postgres.

Idempotent: re-running for the same day updates rather than duplicates, thanks
to the composite PK on fact_nav_daily and an upsert on dim_scheme.

Usage:
    python -m ingestion.load_nav                 # download today's file + load
    python -m ingestion.load_nav data/NAVAll.txt # load a local file
"""

from __future__ import annotations

import sys
import urllib.request
from datetime import date

import psycopg

from .amfi_parser import NavRecord, parse_file, parse_lines
from .db import connect

AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"


def download(timeout: int = 60) -> list[str]:
    req = urllib.request.Request(AMFI_URL, headers={"User-Agent": "mfpulse/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    return text.splitlines()


def _upsert_dim(cur: psycopg.Cursor, records: list[NavRecord], run_date: date) -> None:
    rows = [
        (
            r.scheme_code, r.scheme_name, r.amc_name, r.asset_class,
            r.scheme_type, r.category_raw, r.isin_growth, r.isin_reinvest,
            run_date, run_date,
        )
        for r in records
    ]
    cur.executemany(
        """
        INSERT INTO dim_scheme (scheme_code, scheme_name, amc_name, asset_class,
                                scheme_type, category_raw, isin_growth, isin_reinvest,
                                first_seen, last_seen)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (scheme_code) DO UPDATE SET
            scheme_name   = EXCLUDED.scheme_name,
            amc_name      = EXCLUDED.amc_name,
            asset_class   = EXCLUDED.asset_class,
            scheme_type   = EXCLUDED.scheme_type,
            category_raw  = EXCLUDED.category_raw,
            isin_growth   = EXCLUDED.isin_growth,
            isin_reinvest = EXCLUDED.isin_reinvest,
            last_seen     = EXCLUDED.last_seen,
            is_active     = TRUE
        """,
        rows,
    )


def _insert_nav(cur: psycopg.Cursor, records: list[NavRecord]) -> int:
    rows = [
        (r.scheme_code, r.nav_date, r.nav_value)
        for r in records
        if r.nav_date is not None and r.nav_value is not None
    ]
    cur.executemany(
        """
        INSERT INTO fact_nav_daily (scheme_code, nav_date, nav_value)
        VALUES (%s, %s, %s)
        ON CONFLICT (scheme_code, nav_date) DO UPDATE SET
            nav_value = EXCLUDED.nav_value
        """,
        rows,
    )
    return len(rows)


def run(path: str | None = None) -> dict:
    if path:
        records = list(parse_file(path))
    else:
        records = list(parse_lines(download()))

    if not records:
        raise RuntimeError("Parsed 0 records — AMFI file format may have changed.")

    run_date = max((r.nav_date for r in records if r.nav_date), default=date.today())

    with connect() as conn:
        with conn.cursor() as cur:
            _upsert_dim(cur, records, run_date)
            nav_rows = _insert_nav(cur, records)

    summary = {"schemes": len(records), "nav_rows_loaded": nav_rows, "run_date": run_date.isoformat()}
    print(f"Loaded: {summary}")
    return summary


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else None)
