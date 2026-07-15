-- MF Pulse — Institutional Portfolio Import Engine mission: CAS PDF upload support.
--
-- Extends portfolio_uploads (003_investor_intelligence.sql) with what a PDF upload needs that a
-- CSV upload didn't: a content checksum for duplicate-upload detection ("never duplicate
-- uploads" — no such detection existed for any source before this), the detected registrar, and
-- a same-account identity cross-check result.
--
-- Deliberately does NOT store the investor's raw name/email/mobile/PAN extracted from the CAS
-- text: those are already the authenticated user's own PII, and persisting a second, less-guarded
-- copy of them outside investor_profile's existing consent-gated boundary (003_investor_intelligence.sql)
-- would work against that boundary rather than respect it. identity_check_note carries only a
-- short, non-sensitive human-readable result ("PAN matches account" / "no PAN found on statement"
-- / etc.), never the values themselves.
--
-- portfolio_transactions and portfolio_snapshots (002/003) already have every column this mission
-- needs — no changes to either; this migration only touches portfolio_uploads.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/007_cas_import.sql

alter table portfolio_uploads add column if not exists content_sha256 text;
alter table portfolio_uploads add column if not exists file_size_bytes int;
alter table portfolio_uploads add column if not exists provider text; -- 'cams' | 'kfin' | 'mfcentral' | null (only meaningful for source='cas')
alter table portfolio_uploads add column if not exists identity_check_note text;

-- Not a hard UNIQUE constraint (a user may legitimately re-upload the same statement, e.g. after
-- a failed prior attempt, or intentionally to re-verify against current NAV) — duplicate detection
-- is an app-code "have I successfully imported this exact checksum before" check, surfaced as a
-- clear message, not a silent DB-level rejection.
create index if not exists idx_uploads_user_checksum on portfolio_uploads (user_id, content_sha256) where content_sha256 is not null;
