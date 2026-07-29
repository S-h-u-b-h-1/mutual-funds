-- MF Pulse — Suasion Securities system-of-record directive, Phase 1A (holdings) / Phase 6 (import
-- auditability). Per the directive: "If scheme resolution fails: persist it as unresolved. If
-- ambiguous: persist it as ambiguous. Never map to a random 'closest' fund merely to obtain NAV."
--
-- portfolio_holdings.scheme_code is `not null` by design (a holding IS a resolved position in a
-- specific fund) -- an unresolved/ambiguous row structurally cannot live there without inventing a
-- placeholder scheme_code, which is exactly the "closest fund" anti-pattern this directive forbids.
-- Before this migration, an unresolved/ambiguous holding existed only inside one upload's own
-- portfolio_uploads.errors JSON blob (casUpload.js's insertUploadRow) -- real at the moment of
-- upload, but not a queryable, standing fact about the investor once that response was gone. This
-- table makes it one: a real row, per investor, that survives until a later upload actually
-- resolves it (or an operator/advisor dismisses it) -- see casUpload.js for the write path and
-- resolution_status for the taxonomy (mirrors schemeResolver.js's own real status values, plus two
-- distinct non-resolution failure modes it can't express).
create table if not exists portfolio_unresolved_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  upload_id uuid references portfolio_uploads(id) on delete set null,
  raw_scheme_name text,
  isin text,
  folio_number text,
  units numeric,
  purchase_value numeric,
  market_value_reported numeric,
  -- 'unresolved' | 'needs_review' (ambiguous) | 'platform_gap' (resolved to a scheme_code funds.js
  -- doesn't recognize) | 'invalid_units' (resolution succeeded but the closing balance itself is
  -- unusable) -- see casNormalizer.js's normalizeCasImport() for exactly where each is produced.
  resolution_status text not null,
  resolution_reason text,
  ambiguity_candidates jsonb,
  source text not null default 'cas',
  -- 'open' until a later upload resolves the same folio/scheme text, or an operator dismisses it.
  -- Distinct from resolution_status: resolution_status explains WHY it's unresolved; status tracks
  -- whether this specific record is still the investor's current unresolved state.
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_unresolved_holdings_user_open on portfolio_unresolved_holdings (user_id) where status = 'open';

-- Run: psql "$DATABASE_URL" -f sql/neon/030_unresolved_holdings.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) -- see docs/TEST_DATABASE_AND_CI.md's schema-drift note. If production application is
-- blocked by this session's own tooling (same pattern as 022/024/028/029), apply to test only,
-- record that honestly in docs/MIGRATION_RUNBOOK.md's inventory, and leave production application
-- for someone with direct DB access.
