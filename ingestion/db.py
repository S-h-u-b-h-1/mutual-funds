"""Thin Postgres helper built on psycopg 3 (works with Python 3.13/3.14)."""

from __future__ import annotations

import os
import sys
from contextlib import contextmanager

import psycopg


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
    return bool(os.getenv("DATABASE_URL"))


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
