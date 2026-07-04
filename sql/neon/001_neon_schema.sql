-- MF Pulse — Neon Postgres schema (Phase 1 migration foundation, 2026-07-04).
-- Translated from the live Supabase schema (fffxwcpptpyjuifknayj) — every column/type/constraint
-- below was read directly from information_schema.columns and pg_indexes against production,
-- not reconstructed from memory.
--
-- DELIBERATE CHANGE FROM SUPABASE: no RLS anywhere. Neon has no anon-key/service-role split — the
-- new architecture is "only server-only code (Next.js API routes, Python ingestion scripts) ever
-- holds DATABASE_URL; nothing is reachable from the browser directly." This is a strictly more
-- restrictive default than Supabase's RLS-gated public REST API, not a security downgrade — see
-- docs/NEON_MIGRATION_AUDIT.md for what has to move into API routes as a result (advisor_leads,
-- alerts, user_events — the three tables that previously accepted anonymous client-side inserts).
--
-- Run: psql "$DATABASE_URL" -f sql/neon/001_neon_schema.sql
--   or: .venv/bin/python -m scripts.neon_migrate   (wraps this file, see that script)

create extension if not exists pgcrypto;

-- ============================================================================
-- Core NAV warehouse
-- ============================================================================
create table if not exists dim_scheme (
  scheme_code text primary key,
  scheme_name text not null,
  amc_name text not null,
  asset_class text not null,
  scheme_type text,
  category_raw text,
  isin_growth text,
  isin_reinvest text,
  is_active boolean not null default true,
  first_seen date not null,
  last_seen date not null
);
create index if not exists idx_dim_scheme_amc on dim_scheme (amc_name);
create index if not exists idx_dim_scheme_class on dim_scheme (asset_class);

create table if not exists fact_nav_daily (
  scheme_code text not null,
  nav_date date not null,
  nav_value numeric,
  source text default 'AMFI:NAVAll',
  ingested_at timestamptz default now(),
  created_at timestamptz not null default now(),
  primary key (scheme_code, nav_date)
);
create index if not exists idx_nav_date on fact_nav_daily (nav_date);

create table if not exists fact_pipeline_runs (
  id bigint generated always as identity primary key,
  pipeline text not null,
  status text not null,
  source text,
  source_date date,
  rows_ingested integer,
  duration_ms integer,
  error text,
  started_at timestamptz,
  finished_at timestamptz not null default now()
);
create index if not exists ix_fact_pipeline_runs_pipeline on fact_pipeline_runs (pipeline, finished_at desc);

create table if not exists fact_system_health (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  nav_latest_date date,
  nav_staleness_days integer,
  total_schemes integer,
  total_amcs integer,
  total_nav_rows bigint,
  total_events bigint,
  flow_latest_month date,
  status text
);

-- ============================================================================
-- News intelligence (mirrors sql/010_news_intelligence.sql, RLS dropped)
-- ============================================================================
create table if not exists news_sources (
  id bigint generated always as identity primary key,
  name text not null unique,
  source_type text not null check (source_type in ('rss', 'api', 'regulatory')),
  url text not null,
  credibility text not null check (credibility in ('official', 'tier1_business', 'tier2_business')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists news_articles (
  id bigint generated always as identity primary key,
  source_id bigint references news_sources(id),
  title text not null,
  url text not null unique,
  title_hash text not null,
  summary text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  category text,
  importance_score int check (importance_score between 0 and 100),
  market_relevance_score int check (market_relevance_score between 0 and 100),
  sentiment_label text check (sentiment_label in ('positive', 'negative', 'neutral', 'mixed')),
  created_at timestamptz not null default now()
);
create index if not exists ix_news_articles_published on news_articles (published_at desc);
create index if not exists ix_news_articles_category on news_articles (category);
create index if not exists ix_news_articles_title_hash on news_articles (title_hash);
create index if not exists ix_news_articles_importance on news_articles (importance_score desc);

create table if not exists news_entities (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('sector', 'amc', 'category', 'benchmark', 'index')),
  name text not null,
  unique (entity_type, name)
);

create table if not exists news_market_links (
  id bigint generated always as identity primary key,
  article_id bigint not null references news_articles(id) on delete cascade,
  entity_id bigint not null references news_entities(id) on delete cascade,
  relation text not null,
  rule_id text not null,
  created_at timestamptz not null default now(),
  unique (article_id, entity_id)
);
create index if not exists ix_news_market_links_entity on news_market_links (entity_id);
create index if not exists ix_news_market_links_rule_id on news_market_links (rule_id, created_at desc);

create table if not exists news_sentiment (
  id bigint generated always as identity primary key,
  article_id bigint not null references news_articles(id) on delete cascade,
  label text not null check (label in ('positive', 'negative', 'neutral', 'mixed')),
  method text not null default 'keyword_lexicon_v1',
  matched_keywords text[],
  created_at timestamptz not null default now()
);

create table if not exists news_ingestion_runs (
  id bigint generated always as identity primary key,
  source_id bigint references news_sources(id),
  status text not null,
  articles_fetched int not null default 0,
  articles_new int not null default 0,
  articles_duplicate int not null default 0,
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

-- ============================================================================
-- Market quotes (new — Phase 1 of the terminal sprint fetched these live from
-- Yahoo Finance per-request; this gives the ingestion side somewhere real to persist them so
-- market-quote freshness can be tracked the same way NAV/news freshness already is)
-- ============================================================================
create table if not exists market_quotes (
  id bigint generated always as identity primary key,
  symbol text not null,
  name text not null,
  group_name text not null,
  price numeric not null,
  change numeric,
  change_pct numeric,
  currency text,
  quote_time timestamptz,
  fetched_at timestamptz not null default now(),
  source text not null default 'yahoo_finance'
);
create index if not exists ix_market_quotes_symbol on market_quotes (symbol, fetched_at desc);

create table if not exists market_quote_runs (
  id bigint generated always as identity primary key,
  status text not null,
  requested int not null default 0,
  received int not null default 0,
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

-- ============================================================================
-- Factsheet archive + fund history (mirrors sql/011_factsheet_archive_history.sql, RLS dropped)
-- ============================================================================
create table if not exists factsheet_archive (
  id bigint generated always as identity primary key,
  scheme_code text not null,
  amc text not null,
  source_url text,
  content_checksum text not null,
  published_date date,
  fetched_at timestamptz not null default now(),
  parsed_manager text,
  parsed_expense_ratio numeric,
  parsed_direct_expense_ratio numeric,
  parsed_benchmark text,
  parsed_aum_crores numeric,
  parsed_riskometer text,
  parsed_exit_load text,
  parsed_holdings jsonb,
  parsed_sector_allocation jsonb,
  parser_version text not null default 'backfill_2026_07_03',
  created_at timestamptz not null default now(),
  unique (scheme_code, content_checksum)
);
create index if not exists ix_factsheet_archive_scheme on factsheet_archive (scheme_code, fetched_at desc);

create table if not exists fund_history_events (
  id bigint generated always as identity primary key,
  scheme_code text not null,
  event_type text not null check (event_type in (
    'manager_change', 'benchmark_change', 'expense_ratio_change', 'riskometer_change',
    'aum_milestone', 'category_change', 'objective_change', 'holdings_change'
  )),
  detected_at timestamptz not null default now(),
  previous_value text,
  new_value text,
  previous_archive_id bigint references factsheet_archive(id),
  new_archive_id bigint references factsheet_archive(id) not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_fund_history_events_scheme on fund_history_events (scheme_code, detected_at desc);

-- ============================================================================
-- User events, alerts, advisor leads — NO client-side insert path under Neon.
-- These are now written ONLY by Next.js API routes (server-side), which is exactly what removes
-- the "no rate limiting" gap that existed even under Supabase's RLS-gated public insert (see
-- docs/NEON_MIGRATION_AUDIT.md) — the API route is the natural place to add it.
--
-- user_events gains real top-level columns (page_path, referrer, user_agent, device_type)
-- instead of the current Supabase table's pattern of burying most of these inside the `payload`
-- JSONB blob — a genuine improvement in queryability, not just a straight port.
-- ============================================================================
create table if not exists user_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  session_id text not null,
  user_id uuid,
  event_type text not null check (length(event_type) between 1 and 100),
  entity_type text,
  entity_id text,
  page_path text,
  referrer text,
  user_agent text,
  device_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_user_events_session on user_events (session_id, created_at desc);
create index if not exists ix_user_events_type on user_events (event_type, created_at desc);

create table if not exists alerts (
  id bigint generated always as identity primary key,
  email text not null check (length(email) > 0 and position('@' in email) > 0),
  alert_type text not null default 'daily_summary' check (length(alert_type) > 0),
  entity_type text,
  entity_value text not null default '*',
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

create table if not exists advisor_leads (
  id bigint generated always as identity primary key,
  name text not null check (length(name) > 0),
  email text not null check (length(email) > 0),
  phone text,
  investor_type text,
  interest_area text,
  message text,
  source_page text,
  consent boolean not null default false,
  -- server-enforced at the API-route layer (see frontend/app/api/advisor-lead/route.js): a
  -- request without consent=true is rejected before it ever reaches this insert, same guarantee
  -- Supabase's RLS WITH CHECK gave, just enforced in application code instead of the database.
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Materialized views + refresh function (mirrors the Supabase RPC refresh_analytics())
-- ============================================================================
create materialized view if not exists mv_asset_class_summary as
select
  amc_name,
  asset_class,
  count(*) as schemes,
  max(d.last_seen) as latest_scheme_seen,
  (select max(nav_date) from fact_nav_daily f where f.scheme_code = any(array_agg(d.scheme_code))) as latest_nav_date
from dim_scheme d
group by amc_name, asset_class;

create materialized view if not exists mv_amc_summary as
select amc_name, asset_class, count(*) as schemes
from dim_scheme
group by amc_name, asset_class;

create or replace function refresh_analytics() returns void as $$
begin
  refresh materialized view concurrently mv_asset_class_summary;
  refresh materialized view concurrently mv_amc_summary;
end;
$$ language plpgsql;

-- Unique indexes required for CONCURRENTLY refresh to work on either matview.
create unique index if not exists ix_mv_asset_class_summary_pk on mv_asset_class_summary (amc_name, asset_class);
create unique index if not exists ix_mv_amc_summary_pk on mv_amc_summary (amc_name, asset_class);
