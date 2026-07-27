-- MF Pulse — Backend Hardening Phase 3, H9 (migration safety process).
-- Applied-migration ledger: a database-native source of truth for "has migration NNN actually
-- been applied to THIS branch" — the exact thing that didn't exist when 005_research_profile.sql
-- was applied to production from a reconstructed-from-memory column list rather than the real
-- file, producing a live schema mismatch that 500'd every research-profile API call until
-- 006_research_profile_column_fix.sql corrected it same day (see docs/MIGRATION_RUNBOOK.md for
-- the full account). A ledger doesn't prevent a bad file from being written, but it does two
-- things that would have caught this faster: (1) records a checksum of the file as applied, so a
-- later `--verify` run can detect the on-disk file no longer matches what was actually run
-- against this branch, and (2) gives any future operator/agent a single query to answer "is this
-- migration live here" instead of eyeballing `information_schema` table-by-table or trusting a
-- doc that could itself be stale.
--
-- Populated and read by scripts/apply_migrations.py — see that script and
-- docs/MIGRATION_RUNBOOK.md for the full process. Not consulted by the application at runtime.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/025_migration_ledger.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) — see docs/TEST_DATABASE_AND_CI.md's schema-drift note. This table's own rows are
-- branch-local by design: production and test are expected to diverge in exactly which
-- migrations are live at any given moment (see H6/C1's parked-branch status), and each branch's
-- ledger should reflect only its own real history, never be copied wholesale from the other.

create table if not exists schema_migrations (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now(),
  applied_by text,
  note text
);
