"""
Production daily NAV pipeline → Supabase (service-role, idempotent, audited).

Steps (Phase 3): download AMFI NAVAll → parse → validate → upsert (dim_scheme +
fact_nav_daily) → record fact_pipeline_runs → write fact_system_health snapshot.

Never overwrites history destructively: fact_nav_daily is keyed (scheme_code,
nav_date), so each day adds new rows; re-running the same day is a no-op merge.
Every run is logged to fact_pipeline_runs with source, timing, rows, and status.

Auth: uses the Supabase SERVICE ROLE key (bypasses RLS) — set as a CI secret,
never committed. Activates the moment SUPABASE_SERVICE_ROLE_KEY is present.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m scripts.cloud_pipeline
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timezone

from ingestion.amfi_parser import parse_lines
from ingestion.alerting import alert_for_run, send_alert
from ingestion.freshness import build_health
from ingestion import db as neon_db

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
BATCH = 1000
ACCEPTED = {"Equity", "Debt", "Hybrid", "Solution", "Other"}


def _headers():
    return {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def _post(table: str, rows: list[dict], on_conflict: str | None = None):
    ep = f"{URL}/rest/v1/{table}" + (f"?on_conflict={on_conflict}" if on_conflict else "")
    for i in range(0, len(rows), BATCH):
        req = urllib.request.Request(ep, data=json.dumps(rows[i : i + BATCH]).encode(), method="POST", headers=_headers())
        with urllib.request.urlopen(req, timeout=120) as r:
            assert r.status in (200, 201, 204), r.status


def _count(table: str) -> int:
    # select=* (not a named column) since not every table has an `id` column (e.g.
    # fact_nav_daily's PK is scheme_code+nav_date) — PostgREST's exact count comes from the
    # Content-Range header regardless of which columns are actually selected.
    req = urllib.request.Request(f"{URL}/rest/v1/{table}?select=*&limit=1", headers={**_headers(), "Prefer": "count=exact"})
    with urllib.request.urlopen(req, timeout=30) as r:
        rng = r.headers.get("Content-Range", "*/0")
        return int(rng.split("/")[-1] or 0)


def _download() -> list[str]:
    req = urllib.request.Request(AMFI_URL, headers={"User-Agent": "mfpulse-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read().decode("utf-8", errors="replace").splitlines()


def run() -> int:
    started = datetime.now(timezone.utc)
    t0 = time.time()
    status, rows_ingested, err, src_date = "failed", 0, None, None
    try:
        records = list(parse_lines(_download()))
        # ---- validate ----
        if len(records) < 8000:
            raise ValueError(f"too few rows parsed ({len(records)}) — source may be malformed")
        bad = [r for r in records if r.asset_class not in ACCEPTED]
        if bad:
            raise ValueError(f"{len(bad)} rows with unexpected asset_class")
        # Latest real trading date — NOT the raw max nav_date (which forward-dates on weekends)
        eq_dates = [r.nav_date for r in records if r.nav_date and r.asset_class == "Equity"]
        src_date = max(eq_dates) if eq_dates else max((r.nav_date for r in records if r.nav_date), default=date.today())

        # ---- upsert dim_scheme ----
        dim = {
            r.scheme_code: {
                "scheme_code": r.scheme_code, "scheme_name": r.scheme_name, "amc_name": r.amc_name,
                "asset_class": r.asset_class, "scheme_type": r.scheme_type, "category_raw": r.category_raw,
                "isin_growth": r.isin_growth, "isin_reinvest": r.isin_reinvest,
                "first_seen": src_date.isoformat(), "last_seen": src_date.isoformat(),
            }
            for r in records
        }
        _post("dim_scheme", list(dim.values()), "scheme_code")
        neon_db.dual_write(lambda conn: neon_db.upsert(conn, "dim_scheme", list(dim.values()), ["scheme_code"]))

        # ---- append fact_nav_daily (idempotent on scheme_code+nav_date) ----
        navs = [
            {"scheme_code": r.scheme_code, "nav_date": r.nav_date.isoformat(), "nav_value": r.nav_value,
             "source": "AMFI:NAVAll", "ingested_at": started.isoformat()}
            for r in records if r.nav_date and r.nav_value is not None
        ]
        _post("fact_nav_daily", navs, "scheme_code,nav_date")
        neon_db.dual_write(lambda conn: neon_db.upsert(conn, "fact_nav_daily", navs, ["scheme_code", "nav_date"]))
        rows_ingested, status = len(navs), "success"

        # refresh the materialized analytics layer (fast reads)
        try:
            req = urllib.request.Request(f"{URL}/rest/v1/rpc/refresh_analytics", data=b"{}", method="POST", headers=_headers())
            urllib.request.urlopen(req, timeout=120)
        except Exception as e:
            print(f"matview refresh skipped: {e}", file=sys.stderr)
        neon_db.dual_write(lambda conn: conn.execute("select refresh_analytics()"))
    except Exception as e:  # failure logging, never crash silently
        err = str(e)[:500]
        print(f"PIPELINE FAILED: {err}", file=sys.stderr)

    duration_ms = int((time.time() - t0) * 1000)

    # ---- audit: record the run ----
    try:
        run_row = {
            "pipeline": "nav_daily", "status": status, "source": "AMFI:NAVAll",
            "source_date": src_date.isoformat() if src_date else None,
            "rows_ingested": rows_ingested, "duration_ms": duration_ms,
            "error": err, "started_at": started.isoformat(),
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        _post("fact_pipeline_runs", [run_row])
        neon_db.dual_write(lambda conn: neon_db.upsert(conn, "fact_pipeline_runs", [run_row]))
    except Exception as e:
        print(f"could not record run: {e}", file=sys.stderr)

    # ---- freshness snapshot ----
    try:
        if src_date:
            snap = build_health(
                src_date,
                total_schemes=len({r.scheme_code for r in records}) if status == "success" else None,
                total_nav_rows=_count("fact_nav_daily"),
                total_events=_count("user_events"),
            )
            _post("fact_system_health", [snap])
            neon_db.dual_write(lambda conn: neon_db.upsert(conn, "fact_system_health", [snap]))
    except Exception as e:
        print(f"could not snapshot health: {e}", file=sys.stderr)

    # ---- alerting: failure, missing, or stale-data detection ----
    decision = alert_for_run(status, src_date)
    if decision:
        subject, message, severity = decision
        if status != "success" and err:
            message = err  # surface the real error in the alert
        send_alert(subject, message, severity)

    print(f"cloud_pipeline: status={status} rows={rows_ingested} dur={duration_ms}ms")
    return 0 if status == "success" else 1


if __name__ == "__main__":
    sys.exit(run())
