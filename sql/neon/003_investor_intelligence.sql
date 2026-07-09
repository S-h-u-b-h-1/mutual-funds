-- MF Pulse — Investor Intelligence Engine schema (Mission B, 2026-07-09).
-- Extends 002_auth_and_user_data.sql's portfolio tables (portfolio_holdings,
-- portfolio_transactions, portfolio_sips, portfolio_corporate_actions already exist and are
-- UNCHANGED here — this file only adds what's missing for deterministic portfolio analytics,
-- investor profiling, and Gemini-explained insights on top of them).
--
-- DELIBERATE CHOICES, consistent with 002_auth_and_user_data.sql (read that file's header first):
--
-- 1. Same conventions: uuid primary keys (gen_random_uuid()), timestamptz + now() defaults,
--    `user_id uuid not null references users(id) on delete cascade` on every user-owned table,
--    `idx_<table>_<col>` index naming, no RLS — authorization is app-code-only via an explicit
--    `where user_id = $1` from the session in every route handler, never a client-supplied id.
--
-- 2. Soft enums (source/status/theme/report_type text columns) are comment-documented, not
--    CHECK-constrained — matching 002's alert_rules.alert_type / portfolio_holdings.source, not
--    001's stricter news tables. Keeps new source types (e.g. a future ET Money variant) a
--    zero-migration change.
--
-- 3. `portfolio` is a lightweight 1:1 cache row per user (same shape as user_preferences),
--    holding the latest known totals so dashboard reads don't have to recompute/join
--    portfolio_holdings + portfolio_metrics on every page load. It is NOT a second source of
--    truth — portfolio_holdings (already user_id-scoped, one implicit portfolio per user) stays
--    authoritative; this row is refreshed whenever the analytics engine recomputes.
--
-- 4. portfolio_metrics is append-only (one row per computation, not an upsert) so it doubles as
--    the historical time series Phase 8 (Portfolio Timeline) needs — same reasoning for
--    portfolio_snapshots, which captures allocation composition rather than scores. Together they
--    form the drift/timeline data without a separate "history" table.
--
-- 5. portfolio_events.news_article_id is nullable: exposure can be computed generically for a
--    theme (e.g. a scheduled recompute) or in direct response to one specific article — both are
--    valid, so the FK doesn't force every row to have one.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/003_investor_intelligence.sql

-- ============================================================================
-- Investor profile (Phase 2) — 1:1 with users, same PK-is-user_id pattern as user_preferences.
-- ============================================================================
create table if not exists investor_profile (
  user_id uuid primary key references users(id) on delete cascade,
  name text,
  age int,
  gender text,
  occupation text,
  monthly_salary numeric,
  annual_income numeric,
  emergency_fund numeric,
  current_savings numeric,
  existing_investments numeric,
  risk_appetite text,                    -- 'low' | 'moderate' | 'high'
  investment_goal text,
  investment_horizon_years int,
  expected_retirement_age int,
  dependents int,
  tax_slab text,
  investment_experience text,            -- 'beginner' | 'intermediate' | 'advanced'
  preferred_categories jsonb,            -- array of category strings
  preferred_amcs jsonb,                  -- array of AMC names
  preferred_risk text,
  investment_frequency text,             -- 'sip' | 'lumpsum' | 'both'
  sip_budget numeric,
  lumpsum_budget numeric,
  -- Explicit consent timestamp for storing sensitive financial profile data — this table holds
  -- salary/income/dependents, so unlike the research-only sync tables, writes here should be
  -- gated on the user having actively opted in, not just being logged in.
  consent_given_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Portfolio header (cache row) + import tracking (Phase 1)
-- ============================================================================
create table if not exists portfolio (
  user_id uuid primary key references users(id) on delete cascade,
  total_value numeric,
  holdings_count int not null default 0,
  last_upload_at timestamptz,
  last_computed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portfolio_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source text not null,                  -- 'groww' | 'coin' | 'kuvera' | 'etmoney' | 'manual'
  filename text,
  status text not null default 'pending', -- 'pending' | 'success' | 'partial' | 'failed'
  rows_parsed int not null default 0,
  rows_imported int not null default 0,
  rows_skipped int not null default 0,
  errors jsonb,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_uploads_user on portfolio_uploads (user_id, uploaded_at desc);

-- ============================================================================
-- Deterministic analytics output (Phase 3 metrics, Phase 8 timeline)
-- ============================================================================
create table if not exists portfolio_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  computed_at timestamptz not null default now(),
  total_value numeric,
  beta numeric,
  alpha numeric,
  sharpe numeric,
  sortino numeric,
  volatility numeric,
  max_drawdown numeric,
  risk_score numeric,
  expected_return numeric,
  expected_volatility numeric,
  diversification_score numeric,
  concentration_score numeric,
  quality_score numeric,
  health_score numeric,
  overlap_pct numeric,
  details jsonb                          -- full breakdown: top holdings, sector/category/AMC allocation, etc.
);
create index if not exists idx_metrics_user_time on portfolio_metrics (user_id, computed_at desc);

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  snapshot_date date not null,
  total_value numeric not null,
  allocation jsonb not null,             -- { byAmc, byCategory, byAssetClass, bySector }
  holdings_count int not null,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);
create index if not exists idx_snapshots_user_date on portfolio_snapshots (user_id, snapshot_date desc);

-- ============================================================================
-- Event exposure (Phase 7) — links a computed exposure figure to the news article that
-- triggered it, when there is one. Reuses 001_neon_schema.sql's news_articles (bigint identity
-- PK), not a duplicate news table.
-- ============================================================================
create table if not exists portfolio_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  news_article_id bigint references news_articles(id) on delete set null,
  theme text not null,                   -- 'RBI Policy' | 'Banking' | 'IT' | 'Auto' | 'Energy' | ...
  exposure_pct numeric not null,
  reasoning jsonb,                       -- which holdings contributed and their weights
  computed_at timestamptz not null default now()
);
create index if not exists idx_events_user_time on portfolio_events (user_id, computed_at desc);
create index if not exists idx_events_article on portfolio_events (news_article_id);

-- ============================================================================
-- Advisor Report output (Phase 9), with a slot for the Phase 10 Gemini explanation once that
-- layer exists — nullable so a report can be generated before/without it.
-- ============================================================================
create table if not exists portfolio_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  report_type text not null default 'advisor_review',
  summary jsonb not null,                -- structured: snapshot, risk, diversification, strengths, weaknesses, research opportunities
  gemini_explanation text,
  generated_at timestamptz not null default now()
);
create index if not exists idx_reports_user_time on portfolio_reports (user_id, generated_at desc);
