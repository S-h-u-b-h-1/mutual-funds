"""Thin Postgres helper built on psycopg 3 (works with Python 3.13/3.14)."""

from __future__ import annotations

import os
import sys
from contextlib import contextmanager

# Optional at import time: psycopg is only actually needed when a Postgres connection is used
# (DATABASE_URL set, or the legacy local-Postgres path). A hard module-level import crashed
# scripts that merely import this module for dual_write() in environments without the driver —
# found live 2026-07-06: news_ingest.yml never installs requirements.txt, so every 3-hourly
# news run died on `import psycopg` before fetching a single feed. Neon being unavailable must
# never take down the Supabase-path pipeline (dual_write's own contract).
try:
    import psycopg
except ImportError:
    psycopg = None


def dsn() -> str:
    """Build a libpq connection string from env vars (with sensible local defaults)."""
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    return (
        f"host={os.getenv('PGHOST', 'localhost')} "
        f"port={os.getenv('PGPORT', '5432')} "
        f"dbname={os.getenv('PGDATABASE', 'mfpulse')} "
        f"user={os.getenv('PGUSER', 'mfpulse')} "
        f"password={os.getenv('PGPASSWORD', 'mfpulse')}"
    )


@contextmanager
def connect():
    if psycopg is None:
        raise RuntimeError("psycopg is not installed — cannot open a Postgres connection. Fix: pip install -r requirements.txt")
    conn = psycopg.connect(dsn())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def neon_enabled() -> bool:
    if not os.getenv("DATABASE_URL"):
        return False
    if psycopg is None:
        # Misconfiguration, not a normal disabled state: Neon is asked for but the driver is
        # missing. Say so loudly (once per call site is fine) instead of silently not mirroring.
        print("DATABASE_URL is set but psycopg is not installed — Neon dual-write disabled. "
              "Fix: pip install -r requirements.txt in this environment.", file=sys.stderr)
        return False
    return True


def dual_write(fn):
    """Best-effort Neon mirror for an existing Supabase write: no-ops if DATABASE_URL isn't
    set, and never raises on failure — a broken/absent Neon connection must never affect the
    Supabase-path pipeline status, since Supabase remains the source of truth in Phase 1.
    `fn` receives an open connection and should call upsert()/lookup_id()/execute as needed.
    Returns fn's return value (e.g. a Neon-native id a caller needs for a later dual_write in
    the same run), or None if Neon is disabled or the mirror failed."""
    if not neon_enabled():
        return None
    try:
        with connect() as conn:
            return fn(conn)
    except Exception as e:
        print(f"  (neon dual-write skipped: {e})", file=sys.stderr)
        return None


def upsert(conn, table: str, rows: list[dict], conflict_cols: list[str] | None = None, on_conflict: str = "update"):
    """Generic INSERT (optionally ON CONFLICT), built from each row's own keys — mirrors the
    on_conflict/Prefer semantics the Supabase _post() helpers already use in each ingestion
    script. All rows must share the same keys (the scripts already assume this for Supabase's
    bulk insert). on_conflict: "update" (merge-duplicates) or "nothing" (ignore-duplicates)."""
    if not rows:
        return
    cols = list(rows[0].keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join(f"%({c})s" for c in cols)
    sql = f"insert into {table} ({col_list}) values ({placeholders})"
    if conflict_cols:
        conflict_list = ", ".join(conflict_cols)
        update_cols = [c for c in cols if c not in conflict_cols]
        if on_conflict == "nothing" or not update_cols:
            sql += f" on conflict ({conflict_list}) do nothing"
        else:
            set_clause = ", ".join(f"{c} = excluded.{c}" for c in update_cols)
            sql += f" on conflict ({conflict_list}) do update set {set_clause}"
    with conn.cursor() as cur:
        cur.executemany(sql, rows)


def nav_coverage_by_date(conn, days: int = 12) -> dict:
    """{date: distinct_scheme_count} for fact_nav_daily over the last `days` calendar days,
    read from Neon (the authoritative warehouse) -- the raw material for coverage-aware
    freshness classification (see ingestion/freshness.py's classify_freshness/coverage_baseline).
    A single grouped query, not one row per scheme, so this stays cheap even at ~14k schemes."""
    with conn.cursor() as cur:
        cur.execute(
            """select nav_date, count(distinct scheme_code) as schemes
               from fact_nav_daily
               where nav_date >= (current_date - %s::int)
               group by nav_date""",
            (days,),
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def lookup_id(conn, table: str, where: dict):
    """SELECT id FROM table WHERE <natural key columns> — resolves a Neon-native id after an
    upsert. Deliberately independent from any id fetched from Supabase: the two databases run
    separate identity sequences, so a Supabase-generated id must never be reused as a Neon FK."""
    cols = list(where.keys())
    clause = " and ".join(f"{c} = %({c})s" for c in cols)
    with conn.cursor() as cur:
        cur.execute(f"select id from {table} where {clause}", where)
        row = cur.fetchone()
        return row[0] if row else None
