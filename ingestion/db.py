"""Thin Postgres helper built on psycopg 3 (works with Python 3.13/3.14)."""

from __future__ import annotations

import os
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
