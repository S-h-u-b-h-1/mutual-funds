-- Persistent CAS Portfolio and Daily Valuation Mission — Phase 2 domain model.
--
-- Additive only: every change here is either a brand-new table or a nullable column added to
-- an existing table. Nothing is dropped, renamed, or narrowed, and no existing unique
-- constraint, default, or NOT NULL is touched — every current reader/writer (the CSV/manual
-- import path, the existing CAS upload path, /api/v1/portfolio/holdings and /intelligence)
-- keeps working unchanged until the new code paths (Phase 3+) are wired in to use these.
--
-- Design rationale (see docs/PERSISTENT_PORTFOLIO_AUDIT.md for the full evidence):
--
-- 1. portfolio_holdings (plural, existing) is left completely untouched. Its
--    unique(user_id, scheme_code, source, folio_number) + upsert-in-place contract is exactly
--    right for the CSV/manual path (Groww/Coin/Kuvera/ET Money/manual), which this mission does
--    not touch and which has no review/history requirement. Retrofitting history onto that
--    contract would change behavior for every existing writer, not just CAS.
-- 2. portfolio_holding (new, singular) is the CAS-specific, historical replacement: each import
--    creates NEW rows rather than overwriting old ones, with first_seen_at/last_seen_at/active
--    tracking status over time — this is what makes Phase 6 diffing possible at all, which the
--    audit confirmed is impossible against the old table (the "before" state is destroyed on
--    every re-import there).
-- 3. portfolio_transactions (plural, existing) is reused as-is, just extended with nullable
--    portfolio_import_id/folio_id — it was already append-only with no overwrite problem.
-- 4. portfolio_snapshots (existing) is extended with the new valuation columns rather than
--    building a parallel portfolio_valuation table — its existing unique(user_id, snapshot_date)
--    is already exactly the "one daily valuation per day" behavior Phase 5 needs.
-- 5. portfolio gets an added `id` (surrogate key for the URL-addressable :portfolioId the new
--    API surface needs) without changing its existing user_id primary key, so the existing
--    `on conflict (user_id) do update` upserts in casUpload.js and the intelligence route keep
--    working unchanged.

-- ============================================================================
-- 1. portfolio: add a URL-addressable surrogate id without disturbing the existing PK
-- ============================================================================
alter table portfolio add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists ux_portfolio_id on portfolio (id);

-- ============================================================================
-- 2. portfolio_folio — folio as its own entity, with the folio number encrypted at rest.
-- Encryption is application-level (Node crypto, AES-256-GCM, key from
-- process.env.PORTFOLIO_FIELD_KEY — see app/lib/portfolioImport/fieldCrypto.js, Phase 13),
-- not pgcrypto, so the same code path can also validate/compare tokens without a DB round
-- trip. folio_number_token is a keyed HMAC of the plaintext folio number — stable and
-- comparable for dedup/lookup without ever storing or logging the plaintext. folio_last4 is
-- the only plaintext fragment kept, purely for display ("Folio •••1234"), matching how card
-- numbers are conventionally shown.
-- ============================================================================
create table if not exists portfolio_folio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  registrar text,                          -- 'CAMS' | 'KFINTECH' | 'MFCENTRAL' | null if unknown
  amc text,
  folio_number_encrypted bytea not null,
  folio_number_iv bytea not null,
  folio_number_token text not null,        -- HMAC-SHA256(folio_number), hex — for equality lookups
  folio_last4 text,
  status text not null default 'active',   -- 'active' | 'closed'
  created_at timestamptz not null default now(),
  unique (user_id, folio_number_token, registrar)
);
create index if not exists idx_folio_user on portfolio_folio (user_id);
create index if not exists idx_folio_portfolio on portfolio_folio (portfolio_id);

-- ============================================================================
-- 3. portfolio_import — the review-draft / approval unit (Phase 3). One row per CAS statement
-- a user has parsed, whether or not they go on to approve it. Distinct from portfolio_uploads
-- (existing, kept as-is): portfolio_uploads is the low-level "did this file process" log this
-- session's earlier work already built and tested; portfolio_import is the higher-level
-- "did the user accept these holdings" decision, one layer up, linked via upload_id.
--
-- Draft holdings/transactions live as jsonb on this row until approval — not a separate
-- staging table. They're inherently short-lived (seconds to minutes, between parse and
-- approve/cancel) and nothing else ever references them, so a parallel table with its own
-- cleanup/orphan-row lifecycle would add real operational surface for no benefit over jsonb.
-- ============================================================================
create table if not exists portfolio_import (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  portfolio_id uuid references portfolio(id) on delete set null, -- null until approval creates/identifies the portfolio
  upload_id uuid references portfolio_uploads(id) on delete set null,
  source_type text not null,               -- 'cams_cas_pdf' | 'kfin_cas_pdf' | 'mfcentral_summary'
  checksum text not null,
  statement_date date,
  provider text,
  parse_version text not null default 'v1',
  status text not null default 'draft',    -- 'draft' | 'approved' | 'cancelled' | 'superseded'
  -- Two independent reconciliation dimensions (see reconciliation.js): cost and market value can
  -- each pass/fail separately, since a Summary-format statement may declare only one of the two.
  -- declared_*_total is the statement's OWN grand total, kept for audit even though it's also
  -- re-derivable from casParser.js's parse output, so a later re-parse can't silently change what
  -- was actually reconciled against at approval time.
  reconciliation_status text,              -- 'matched' | 'rounding' | 'discrepancy' | 'not_applicable' | 'unresolved' — see overallReconciliationStatus()
  reconciliation_cost_status text,
  reconciliation_cost_delta numeric,
  reconciliation_market_value_status text,
  reconciliation_market_value_delta numeric,
  declared_cost_value_total numeric,
  declared_market_value_total numeric,
  warning_count int not null default 0,
  original_file_retention_status text not null default 'not_retained', -- Phase 13: never retained by default
  draft_holdings jsonb,
  draft_transactions jsonb,
  draft_warnings jsonb,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists idx_import_user on portfolio_import (user_id, created_at desc);
create index if not exists idx_import_checksum on portfolio_import (user_id, checksum);
create index if not exists idx_import_portfolio on portfolio_import (portfolio_id);

-- ============================================================================
-- 4. portfolio_holding (singular) — the persistent, historical CAS holding record. Each
-- approved import creates new rows for what changed rather than overwriting prior rows, so
-- Phase 6 diffing has a real "before" state to compare against. active + last_seen_at
-- together answer "is this currently held" without deleting the row that proves it once was.
-- ============================================================================
create table if not exists portfolio_holding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  folio_id uuid references portfolio_folio(id) on delete set null,
  import_id uuid references portfolio_import(id) on delete set null,
  canonical_scheme_code text not null,
  isin text,
  source_scheme_name text,
  plan text,                               -- 'Direct' | 'Regular' — from derivePlanOption(), never merged with the other
  option text,                             -- 'Growth' | 'IDCW' — likewise never merged
  demat boolean,                           -- null = not stated in the source statement, not "false"
  unit_balance numeric not null,
  invested_value numeric,
  average_cost numeric,
  statement_nav numeric,
  statement_nav_date date,
  statement_market_value numeric,
  -- Per-holding reconciliation (units x statement_nav vs statement_market_value) — only ever
  -- populated for the ledger CAS sub-format, which reports a per-row market value; the Summary
  -- sub-format has none, so this stays 'not_applicable' there rather than a fabricated comparison.
  reconciliation_status text,
  reconciliation_delta numeric,
  match_method text,                       -- e.g. 'isin_exact' | 'scheme_code' | 'normalized_name' — see schemeResolver.js
  match_confidence text,                   -- 'confirmed' | 'high_confidence' (only acceptable statuses reach here)
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_holding_user_active on portfolio_holding (user_id, active);
create index if not exists idx_holding_portfolio on portfolio_holding (portfolio_id, active);
create index if not exists idx_holding_folio on portfolio_holding (folio_id);

-- ============================================================================
-- 5. portfolio_transactions (existing, plural) — extend, don't duplicate. Already append-only
-- with no overwrite problem, so the only gap is linking a transaction back to the import that
-- produced it and, once folios are first-class, to its folio_id.
-- ============================================================================
alter table portfolio_transactions add column if not exists portfolio_import_id uuid references portfolio_import(id) on delete set null;
alter table portfolio_transactions add column if not exists folio_id uuid references portfolio_folio(id) on delete set null;

-- ============================================================================
-- 6. portfolio_snapshots (existing) — extend with daily valuation columns. Its existing
-- unique(user_id, snapshot_date) is already the exact "one valuation per day" shape Phase 5
-- needs; no new table required. computed_by distinguishes an upload-triggered snapshot from a
-- production-refresh-triggered revaluation, since both now write here.
-- ============================================================================
alter table portfolio_snapshots add column if not exists total_invested_value numeric;
alter table portfolio_snapshots add column if not exists absolute_gain numeric;
alter table portfolio_snapshots add column if not exists absolute_return_pct numeric;
alter table portfolio_snapshots add column if not exists xirr numeric;
alter table portfolio_snapshots add column if not exists latest_nav_coverage_pct numeric;
alter table portfolio_snapshots add column if not exists stale_holding_count int;
alter table portfolio_snapshots add column if not exists methodology_version text not null default 'v1';
alter table portfolio_snapshots add column if not exists computed_by text not null default 'upload'; -- 'upload' | 'daily_refresh' | 'manual'

-- ============================================================================
-- 7. portfolio_holding_valuation — per-holding daily value, the one genuinely new concept with
-- no existing analog (today a holding's value is computed live on every read, never stored
-- historically). One row per holding per valuation date.
-- ============================================================================
create table if not exists portfolio_holding_valuation (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references portfolio_holding(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  nav_date date not null,
  nav numeric,
  unit_balance numeric not null,
  market_value numeric,
  gain_loss numeric,
  source text not null default 'daily_refresh', -- 'daily_refresh' | 'import'
  computed_at timestamptz not null default now(),
  unique (holding_id, nav_date)
);
create index if not exists idx_holding_valuation_user_date on portfolio_holding_valuation (user_id, nav_date desc);
create index if not exists idx_holding_valuation_holding on portfolio_holding_valuation (holding_id, nav_date desc);
