"""
Migration safety tooling (Backend Hardening Phase 3, H9). Applies pending sql/neon/*.sql files to
whatever DATABASE_URL points at, and maintains schema_migrations
(sql/neon/025_migration_ledger.sql) as the database-native record of what has actually been run
against THIS branch — replacing the previous process of "someone runs psql -f by hand, nothing
records that it happened." See docs/MIGRATION_RUNBOOK.md for the full account of why this exists:
005_research_profile.sql was once applied to production from a reconstructed-from-memory column
list rather than the real file, producing a live schema mismatch that 500'd an endpoint until
006_research_profile_column_fix.sql corrected it same day. A ledger with a checksum would have
made that drift checkable in one command instead of by hand.

DATABASE_URL selects the target, same convention as every other script/test in this repo — this
script never guesses which branch (test vs production) it's pointed at, and never picks one.

Modes:
    python -m scripts.apply_migrations                     # status: report pending, do nothing
    python -m scripts.apply_migrations --apply              # execute every pending file, in order
    python -m scripts.apply_migrations --verify              # checksum on-disk files vs the ledger
    python -m scripts.apply_migrations --backfill FILE...    # record already-applied files WITHOUT
                                                               # re-running them (bootstrap only —
                                                               # verify against the real schema
                                                               # first, never guess)

schema_migrations itself (025_migration_ledger.sql) is the one migration this script cannot apply
for itself — bootstrap it by hand first: psql "$DATABASE_URL" -f sql/neon/025_migration_ledger.sql
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from ingestion import db as neon_db

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "sql" / "neon"
LEDGER_MIGRATION = "025_migration_ledger.sql"


def _migration_files():
    return sorted(p for p in MIGRATIONS_DIR.glob("*.sql") if p.name[:3].isdigit())


def _checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _ledger_exists(conn):
    with conn.cursor() as cur:
        cur.execute("select to_regclass('public.schema_migrations')")
        return cur.fetchone()[0] is not None


def _applied(conn):
    with conn.cursor() as cur:
        cur.execute("select filename, checksum, applied_at, applied_by, note from schema_migrations order by filename")
        return {
            row[0]: {"checksum": row[1], "applied_at": row[2], "applied_by": row[3], "note": row[4]}
            for row in cur.fetchall()
        }


def _record(conn, path, note=None, applied_by=None):
    with conn.cursor() as cur:
        cur.execute(
            "insert into schema_migrations (filename, checksum, applied_by, note) values (%s, %s, %s, %s) "
            "on conflict (filename) do nothing",
            (path.name, _checksum(path), applied_by, note),
        )


def cmd_status():
    files = _migration_files()
    with neon_db.connect() as conn:
        if not _ledger_exists(conn):
            print(f"schema_migrations does not exist on this DATABASE_URL yet — bootstrap it first:\n  psql \"$DATABASE_URL\" -f sql/neon/{LEDGER_MIGRATION}")
            return 1
        applied = _applied(conn)
    pending = [f for f in files if f.name not in applied]
    print(f"{len(files)} migration file(s) on disk, {len(applied)} recorded as applied on this branch.")
    if pending:
        print("Pending (not yet recorded — review each file before applying to production):")
        for f in pending:
            print(f"  {f.name}")
    else:
        print("Nothing pending.")
    return 0


def cmd_apply():
    files = _migration_files()
    with neon_db.connect() as conn:
        if not _ledger_exists(conn):
            print(f"schema_migrations does not exist on this DATABASE_URL yet — bootstrap it first:\n  psql \"$DATABASE_URL\" -f sql/neon/{LEDGER_MIGRATION}")
            return 1
        applied = _applied(conn)
    pending = [f for f in files if f.name not in applied]
    if not pending:
        print("Nothing pending.")
        return 0
    print(f"About to apply {len(pending)} migration(s), in order:")
    for f in pending:
        print(f"  {f.name}")
    for f in pending:
        print(f"\nApplying {f.name} ...")
        sql = f.read_text()
        try:
            with neon_db.connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql)
                _record(conn, f, applied_by="scripts.apply_migrations")
        except Exception as e:
            print(f"FAILED on {f.name}: {e}")
            print(
                "Stopping — files after this one were NOT attempted. ingestion.db.connect() rolls "
                "back this file's own transaction on any exception, but a multi-statement file can "
                "still leave DDL partially applied if Postgres itself errors mid-statement-list — "
                "check the live schema by hand before retrying."
            )
            return 1
        print(f"Recorded {f.name} as applied.")
    print(f"\nDone — {len(pending)} migration(s) applied and recorded.")
    return 0


def cmd_verify():
    with neon_db.connect() as conn:
        if not _ledger_exists(conn):
            print(f"schema_migrations does not exist on this DATABASE_URL yet — bootstrap it first:\n  psql \"$DATABASE_URL\" -f sql/neon/{LEDGER_MIGRATION}")
            return 1
        applied = _applied(conn)
    mismatches = []
    for name, record in applied.items():
        path = MIGRATIONS_DIR / name
        if not path.exists():
            print(f"RECORDED BUT MISSING ON DISK: {name} (applied {record['applied_at']}, by {record['applied_by']}) — file was deleted or renamed after being applied.")
            mismatches.append(name)
            continue
        actual = _checksum(path)
        if actual != record["checksum"]:
            print(
                f"CHECKSUM MISMATCH: {name} — the on-disk file no longer matches what was recorded "
                f"as applied on {record['applied_at']}. Someone edited this file after it ran. Do "
                f"NOT re-run it blindly; diff against git history to see what changed, and write a "
                f"NEW corrective migration if production needs to change (the 006 pattern) rather "
                f"than mutating history."
            )
            mismatches.append(name)
    if not mismatches:
        print(f"Verified clean: all {len(applied)} recorded migration(s) match their on-disk file.")
        return 0
    print(f"\n{len(mismatches)} mismatch(es) found — see above.")
    return 1


def cmd_backfill(filenames):
    if not filenames:
        print("Usage: python -m scripts.apply_migrations --backfill FILE [FILE ...]")
        print(
            "Records the given files as already-applied WITHOUT executing their SQL. Only for "
            "migrations that are genuinely already live on this branch — verify against the real "
            "schema first (e.g. \\d table_name), never guess from a summary or from memory. "
            "Existing entries are left untouched (idempotent)."
        )
        return 1
    missing = [name for name in filenames if not (MIGRATIONS_DIR / name).exists()]
    if missing:
        print(f"Not found in {MIGRATIONS_DIR}: {', '.join(missing)}")
        return 1
    with neon_db.connect() as conn:
        if not _ledger_exists(conn):
            print(f"schema_migrations does not exist on this DATABASE_URL yet — bootstrap it first:\n  psql \"$DATABASE_URL\" -f sql/neon/{LEDGER_MIGRATION}")
            return 1
        for name in filenames:
            path = MIGRATIONS_DIR / name
            _record(
                conn,
                path,
                note="backfilled: pre-existing on this branch before schema_migrations was introduced; not re-executed by this tool",
                applied_by="scripts.apply_migrations --backfill",
            )
            print(f"Recorded {name} as applied (backfilled, not executed).")
    return 0


def main():
    if not neon_db.neon_enabled():
        print("DATABASE_URL is not set (or psycopg is missing) — nothing to do. Export DATABASE_URL for the branch you mean to inspect/change.")
        return 1
    args = sys.argv[1:]
    if not args or args[0] == "--status":
        return cmd_status()
    if args[0] == "--apply":
        return cmd_apply()
    if args[0] == "--verify":
        return cmd_verify()
    if args[0] == "--backfill":
        return cmd_backfill(args[1:])
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
