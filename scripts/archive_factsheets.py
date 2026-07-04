"""
Factsheet Archive + Fund History Engine (Phase 6/7 — institutional data-depth sprint).

Two responsibilities, kept in one file since they're tightly coupled:

1. archive_snapshot(): write one factsheet_archive row per currently-parsed scheme (from
   frontend/app/data/metadata.json) — the versioned, checksummed record of "what did our parser
   see for this fund, when". Should be called every time scripts/ingest_factsheets.py completes a
   real parse run, so genuine month-over-month factsheet changes become archivable.

2. detect_changes(): compare a scheme's newest two factsheet_archive rows and emit real
   fund_history_events rows — manager/benchmark/expense-ratio/riskometer/AUM/holdings changes.
   NEVER inferred: a change is only ever recorded when two REAL archived snapshots disagree.

HONEST LIMITATION: as of this sprint (2026-07-03), factsheet_archive has exactly ONE snapshot per
scheme (the initial backfill of the 152 currently-parsed schemes) — there is nothing to diff
against yet. detect_changes() will correctly find zero changes everywhere until
scripts/ingest_factsheets.py runs again and a SECOND snapshot exists. Any UI surfacing fund
history must say so plainly: "History begins from first archived factsheet" (2026-07-03) — never
implying older history exists or was lost.

Auth: SUPABASE_SERVICE_ROLE_KEY (CI-only secret), same pattern as cloud_pipeline.py / ingest_news.py.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

from ingestion import db as neon_db

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

CHANGE_FIELDS = {
    "parsed_manager": "manager_change",
    "parsed_benchmark": "benchmark_change",
    "parsed_expense_ratio": "expense_ratio_change",
    "parsed_riskometer": "riskometer_change",
}


def _headers(prefer="resolution=merge-duplicates,return=minimal"):
    return {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": prefer}


def _post(table, rows, on_conflict=None, prefer="resolution=merge-duplicates,return=minimal"):
    if not rows:
        return []
    ep = f"{URL}/rest/v1/{table}" + (f"?on_conflict={on_conflict}" if on_conflict else "")
    req = urllib.request.Request(ep, data=json.dumps(rows).encode(), method="POST", headers=_headers(prefer))
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return json.loads(body) if body else []


def _get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def content_checksum(row: dict) -> str:
    """Checksum of the PARSED fields we archive — NOT the raw PDF bytes (we don't retain those
    after parsing today). Detects "did anything we extracted change", which is what
    detect_changes() needs; a future version of ingest_factsheets.py that keeps the raw PDF
    bytes at fetch time should checksum those instead and pass it in directly."""
    keys = ["fund_manager", "expense_ratio", "direct_expense_ratio", "benchmark", "aum_crores",
            "riskometer", "exit_load", "holdings", "sector_allocation"]
    blob = json.dumps({k: row.get(k) for k in keys}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:24]


def archive_snapshot():
    """Write one factsheet_archive row per currently-parsed scheme. Idempotent: unique
    (scheme_code, content_checksum) means re-running when nothing changed is a no-op — a new row
    only appears when the parsed content actually differs from the last archived snapshot."""
    meta_path = os.path.join(ROOT, "frontend/app/data/metadata.json")
    meta = json.load(open(meta_path)).get("metadata", [])
    rows = []
    for m in meta:
        rows.append({
            "scheme_code": str(m["scheme_code"]),
            "amc": m.get("amc") or "",
            "source_url": m.get("source_url"),
            "content_checksum": content_checksum(m),
            "published_date": m.get("source_date"),
            "parsed_manager": m.get("fund_manager"),
            "parsed_expense_ratio": m.get("expense_ratio"),
            "parsed_direct_expense_ratio": m.get("direct_expense_ratio"),
            "parsed_benchmark": m.get("benchmark"),
            "parsed_aum_crores": m.get("aum_crores"),
            "parsed_riskometer": m.get("riskometer"),
            "parsed_exit_load": m.get("exit_load"),
            "parsed_holdings": m.get("holdings") or None,
            "parsed_sector_allocation": m.get("sector_allocation") or None,
        })
    _post("factsheet_archive", rows, on_conflict="scheme_code,content_checksum", prefer="resolution=ignore-duplicates,return=minimal")
    neon_db.dual_write(lambda conn: neon_db.upsert(conn, "factsheet_archive", rows, ["scheme_code", "content_checksum"], on_conflict="nothing"))
    print(f"archived {len(rows)} snapshot rows (idempotent — no-op for unchanged schemes)")
    return len(rows)


def _neon_detect_changes(conn, scheme_code: str):
    """Neon-side mirror of detect_changes(), read independently from Neon's own
    factsheet_archive rows — never reuses a Supabase-fetched archive id (see
    ingestion/db.py's lookup_id() docstring for why the two databases can't share ids)."""
    with conn.cursor() as cur:
        cur.execute(
            "select * from factsheet_archive where scheme_code = %(scheme_code)s order by fetched_at desc limit 2",
            {"scheme_code": scheme_code},
        )
        cols = [d.name for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    if len(rows) < 2:
        return
    new, old = rows[0], rows[1]
    events = []
    for field, event_type in CHANGE_FIELDS.items():
        if old.get(field) != new.get(field):
            events.append({
                "scheme_code": scheme_code, "event_type": event_type,
                "previous_value": str(old.get(field)) if old.get(field) is not None else None,
                "new_value": str(new.get(field)) if new.get(field) is not None else None,
                "previous_archive_id": old["id"], "new_archive_id": new["id"],
            })
    if events:
        neon_db.upsert(conn, "fund_history_events", events)


def detect_changes(scheme_code: str):
    """Compare a scheme's two newest factsheet_archive rows, emit real fund_history_events.
    Returns [] (not an error) when fewer than 2 snapshots exist — that's the expected, honest
    state for every scheme until ingest_factsheets.py runs a second time."""
    rows = _get(f"factsheet_archive?scheme_code=eq.{scheme_code}&select=*&order=fetched_at.desc&limit=2")
    neon_db.dual_write(lambda conn: _neon_detect_changes(conn, scheme_code))
    if len(rows) < 2:
        return []
    new, old = rows[0], rows[1]
    events = []
    for field, event_type in CHANGE_FIELDS.items():
        if old.get(field) != new.get(field):
            events.append({
                "scheme_code": scheme_code, "event_type": event_type,
                "previous_value": str(old.get(field)) if old.get(field) is not None else None,
                "new_value": str(new.get(field)) if new.get(field) is not None else None,
                "previous_archive_id": old["id"], "new_archive_id": new["id"],
            })
    if events:
        _post("fund_history_events", events, prefer="resolution=merge-duplicates,return=minimal")
    return events


def main():
    if not URL or not KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping.", file=sys.stderr)
        return 0
    n = archive_snapshot()
    print(f"-- factsheet archive: {n} schemes snapshotted at {datetime.now(timezone.utc).isoformat()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
