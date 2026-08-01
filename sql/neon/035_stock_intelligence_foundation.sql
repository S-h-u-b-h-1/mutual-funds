-- MF Pulse — Stock Research & Investor Intelligence: foundation schema.
--
-- A new, deliberately SEPARATE domain from the mutual-fund business (portfolio_holdings,
-- portfolio_transactions, user_watchlist, investment_orders, ...). No table here is shared with
-- or reused from the MF schema — a stock is not a scheme, a stock holding is not a folio, a
-- stock watchlist is not user_watchlist. Where the SAME PATTERN already proved itself on the MF
-- side (fund_history_events -> company_events; the Invest platform's provider-interface idiom
-- for the mock/real seam), that pattern is deliberately mirrored, but no row, foreign key, or
-- shared table crosses the boundary. See docs/STOCK_INTELLIGENCE_COMPETITIVE_STUDY.md for the
-- product research behind this shape and docs/STOCK_DATA_SOURCE_MATRIX.md for what's licensed
-- vs. not.
--
-- Convention: uuid PKs for entity-shaped tables referenced pervasively as foreign keys
-- (companies, sectors, watchlists, ...), matching users/investment_accounts. bigint identity PKs
-- for append-only/high-volume log-shaped tables (history, line items, events, prices), matching
-- fund_history_events/user_events. No RLS — same reasoning as 002/003/004: authorization is
-- app-code-only via lib/db.js, nothing queries Neon directly from a browser.
--
-- Provenance is inline per table (source/source_url/source_document_ref/as_of columns) rather
-- than routed through 004_metadata_provenance.sql's source_documents/source_document_versions —
-- that schema's shape (amc, scheme_hint, document_type enum) is purpose-built for the MF
-- factsheet pipeline and doesn't fit a company/filing/commodity shape without distortion.
-- fund_history_events/factsheet_archive don't reference it either; this follows that same
-- established inline-provenance precedent instead of forcing a cross-domain fit.
--
-- SCOPE (see docs/STOCK_INTELLIGENCE_COMPETITIVE_STUDY.md and the roadmap section of
-- docs/STOCK_INTELLIGENCE_STATUS.md for the full reasoning): this migration builds schema for
-- Stock Master, Company Profile, Financial Statements, Valuation, Timeline, Results Calendar,
-- Operational Metrics + Sector Templates, Commodities + Company Exposure, Stock Portfolio,
-- Watchlist, Alerts, and Research Notes. It deliberately does NOT build Market Monitor (index
-- price feeds), Macro Intelligence series, or Document ingestion/indexing tables this pass —
-- those are either licensing-gated (live price/index feeds) or content-indexing concerns better
-- scoped once a real document source is confirmed; see the status doc for what's next.
--
-- No row in this migration is populated with live data. This is schema only — every table starts
-- empty. Populating companies/financials/commodities with real data is separate, licensing-gated
-- work tracked in docs/STOCK_DATA_SOURCE_MATRIX.md, not something this migration does.
--
-- Run: python3 scripts/apply_migrations.py --apply (or, if the auto-classifier declines the DDL
-- the way it has for every migration since 022, apply via the Neon MCP run_sql tool one statement
-- at a time against the target branch, then hand-insert the schema_migrations row — see
-- docs/MIGRATION_RUNBOOK.md for the exact procedure this repo has used since).

-- ============================================================================
-- Sector / industry taxonomy — company classification, defined once so screener/sector-page
-- filters and sector_operating_metric_templates all reference the same canonical set instead of
-- free-text sector strings drifting into near-duplicates the way the MF category taxonomy did
-- (see docs/SUASION_PLATFORM_STATUS.md and the still-open Scheme Matching Sprint Phase 5 category
-- taxonomy repair item) — designed to not repeat that mistake from day one.
-- ============================================================================
create table if not exists company_sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists company_industries (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references company_sectors(id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  unique (sector_id, name)
);
create index if not exists ix_company_industries_sector on company_industries (sector_id);

-- ============================================================================
-- Stock Master — canonical company/security identity. ISIN and the current NSE/BSE identifiers
-- live directly on `companies` for fast lookup; company_identifier_history is the append-only
-- audit trail that makes renames/corporate-actions non-destructive: a rename UPDATEs the current
-- value on `companies` and INSERTs a history row, it never INSERTs a new companies row. Any
-- ingestion path that would otherwise create a second company for a renamed entity is a bug in
-- that path, not a valid use of this table.
-- ============================================================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  isin text unique,
  nse_symbol text unique,
  bse_code text unique,
  sector_id uuid references company_sectors(id) on delete set null,
  industry_id uuid references company_industries(id) on delete set null,
  listing_status text not null default 'listed' check (listing_status in ('listed', 'delisted', 'suspended', 'pre_ipo')),
  incorporation_country text not null default 'IN',
  website text,
  registered_office text,
  description text,
  description_source text,
  description_as_of date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_companies_sector on companies (sector_id);
create index if not exists ix_companies_industry on companies (industry_id);
create index if not exists ix_companies_display_name on companies (display_name);
create index if not exists ix_companies_listing_status on companies (listing_status);

comment on column companies.isin is
  'The most durable cross-exchange identifier available; nullable only for pre_ipo rows not yet assigned one.';
comment on table companies is
  'Canonical company identity. A corporate rename or ticker change updates this row and appends to '
  'company_identifier_history — it must never result in a second row for the same legal entity.';

create table if not exists company_identifier_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('isin', 'nse_symbol', 'bse_code', 'legal_name', 'display_name', 'sector', 'industry')),
  old_value text,
  new_value text not null,
  effective_date date not null default current_date,
  reason text,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists ix_company_identifier_history_company on company_identifier_history (company_id, effective_date desc);

-- A company can be listed on NSE, BSE, or both, with a DIFFERENT symbol/code per exchange and
-- independent listing/delisting dates on each — this cannot be modeled as one pair of columns on
-- `companies` (that's exactly what nse_symbol/bse_code already do for the common case; this table
-- is what makes "listed on BSE only" or "delisted from NSE, still trades on BSE" representable).
create table if not exists company_exchange_listings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  exchange text not null check (exchange in ('NSE', 'BSE')),
  symbol_or_code text not null,
  listed_at date,
  delisted_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exchange, symbol_or_code)
);
create index if not exists ix_company_exchange_listings_company on company_exchange_listings (company_id);

-- ============================================================================
-- Company Profile — ownership/management/subsidiaries/segments are naturally list-shaped (a
-- company has many promoters, many subsidiaries), so each gets its own row-per-fact table with
-- its own as_of_date/source rather than a single JSON blob on `companies` that can't carry
-- per-fact provenance or history.
-- ============================================================================
create table if not exists company_ownership (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  holder_type text not null check (holder_type in ('promoter', 'institutional', 'public', 'other')),
  holder_name text,
  holding_percent numeric,
  as_of_date date not null,
  source text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_company_ownership_company on company_ownership (company_id, as_of_date desc);

create table if not exists company_management (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  person_name text not null,
  role text not null,
  since_date date,
  until_date date,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists ix_company_management_company on company_management (company_id);

create table if not exists company_subsidiaries (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  subsidiary_name text not null,
  relationship text not null default 'subsidiary' check (relationship in ('subsidiary', 'associate', 'joint_venture', 'brand')),
  ownership_percent numeric,
  source text,
  as_of_date date,
  created_at timestamptz not null default now()
);
create index if not exists ix_company_subsidiaries_company on company_subsidiaries (company_id);

create table if not exists company_business_segments (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  segment_name text not null,
  description text,
  revenue_share_percent numeric,
  as_of_period text,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists ix_company_business_segments_company on company_business_segments (company_id);

-- ============================================================================
-- Financial Statements — normalized but provenance-preserving. `company_financial_line_items` is
-- deliberately entity-attribute-value shaped, not one wide table of ~150 columns: different
-- statement types (and different sectors — a bank's P&L has no "revenue" line the way an FMCG
-- company's does) need different fields, and a wide table can't carry a per-field raw_label
-- (the line's original wording in the source document) without doubling every column. The
-- canonical vocabulary of line_item_key values is centralized in
-- frontend/app/lib/stocks/financialStatements.js (LINE_ITEM_KEYS), not redefined per caller —
-- same "frontend never independently defines fundamentals" requirement Section 5 states for
-- derived metrics, applied one layer earlier to the raw fields metrics are computed from.
-- ============================================================================
create table if not exists company_financial_statements (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  statement_type text not null check (statement_type in ('pnl', 'balance_sheet', 'cash_flow')),
  period_type text not null check (period_type in ('annual', 'quarterly')),
  period_end_date date not null,
  fiscal_year integer not null,
  fiscal_quarter integer check (fiscal_quarter between 1 and 4),
  is_restated boolean not null default false,
  restated_from_id bigint references company_financial_statements(id),
  source text not null,
  source_document_ref text,
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, statement_type, period_type, period_end_date, is_restated)
);
create index if not exists ix_company_financial_statements_company on company_financial_statements (company_id, period_end_date desc);

create table if not exists company_financial_line_items (
  id bigint generated always as identity primary key,
  statement_id bigint not null references company_financial_statements(id) on delete cascade,
  line_item_key text not null,
  value numeric,
  unit text not null default 'INR_CRORE' check (unit in ('INR_CRORE', 'INR_LAKH', 'INR', 'PERCENT', 'RATIO', 'COUNT')),
  raw_label text,
  created_at timestamptz not null default now(),
  unique (statement_id, line_item_key)
);
create index if not exists ix_company_financial_line_items_statement on company_financial_line_items (statement_id);
create index if not exists ix_company_financial_line_items_key on company_financial_line_items (line_item_key);

-- ============================================================================
-- Valuation — periodic snapshots, not a live-recomputed column on `companies` (price-dependent
-- fields would go stale on every row the instant the underlying price feed is disconnected).
-- Sector/peer medians are deliberately NOT stored here: they're computed at query time by
-- aggregating this same table over a transparently-defined peer/sector set (see
-- frontend/app/lib/stocks/valuation.js), so they can never drift out of sync with the underlying
-- snapshots the way a separately-maintained median column could.
-- ============================================================================
create table if not exists company_valuation_snapshots (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  as_of_date date not null,
  price numeric,
  shares_outstanding numeric,
  market_cap numeric,
  pe numeric,
  pb numeric,
  ev_ebitda numeric,
  ev_sales numeric,
  peg numeric,
  dividend_yield numeric,
  fcf_yield numeric,
  source text not null,
  computed_at timestamptz not null default now(),
  unique (company_id, as_of_date)
);
create index if not exists ix_company_valuation_snapshots_company on company_valuation_snapshots (company_id, as_of_date desc);

-- ============================================================================
-- Company Timeline — directly mirrors fund_history_events' shape and role (same team's own
-- established idiom for "a dated, sourced, typed event tied to one entity"), as a new sibling
-- table rather than a shared one, since a company event and a fund metadata-change event are
-- different things with different type vocabularies.
-- ============================================================================
create table if not exists company_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  event_type text not null check (event_type in (
    'results', 'filing', 'annual_report', 'investor_presentation', 'concall',
    'dividend', 'buyback', 'bonus', 'split', 'rights_issue', 'fundraising', 'ma',
    'promoter_activity', 'management_change', 'credit_rating', 'capacity_expansion',
    'order', 'regulatory'
  )),
  event_date date not null,
  headline text not null,
  summary text,
  source text not null,
  source_url text,
  raw_document_ref text,
  created_at timestamptz not null default now()
);
create index if not exists ix_company_events_company on company_events (company_id, event_date desc);
create index if not exists ix_company_events_type on company_events (event_type, event_date desc);

-- Results Tracker — forward-looking (expected/board-meeting/concall dates), which company_events
-- alone doesn't represent well since events are recorded after the fact. One row per
-- company+period, updated in place as expected -> published/delayed, rather than one row per
-- event_type='results' company_events entry per status change.
create table if not exists company_results_calendar (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  period_end_date date not null,
  period_type text not null check (period_type in ('annual', 'quarterly')),
  expected_date date,
  board_meeting_date date,
  concall_date date,
  actual_publication_date date,
  status text not null default 'expected' check (status in ('expected', 'published', 'delayed', 'cancelled')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_end_date, period_type)
);
create index if not exists ix_company_results_calendar_company on company_results_calendar (company_id, period_end_date desc);
create index if not exists ix_company_results_calendar_status on company_results_calendar (status, expected_date);

-- ============================================================================
-- Operational Metrics — Tijori-style non-financial operating data (production, capacity,
-- utilization, ARPU, ...). Storage is one generic EAV table for every sector (a metric is just
-- metric_key/value/unit/period tied to a company); WHICH metrics are meaningful for a given
-- sector is a separate, per-sector template registry, so a bank's page can ask for NIM/GNPA/NNPA/
-- CASA and a cement page can ask for capacity/utilization/realization without either sector's
-- template polluting the other's — one generic metric template for every industry is explicitly
-- what Section 11 rules out.
-- ============================================================================
create table if not exists sector_operating_metric_templates (
  id bigint generated always as identity primary key,
  sector_id uuid not null references company_sectors(id) on delete cascade,
  metric_key text not null,
  label text not null,
  unit text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (sector_id, metric_key)
);

create table if not exists company_operational_metrics (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  metric_key text not null,
  value numeric not null,
  unit text not null,
  period_type text not null check (period_type in ('annual', 'quarterly', 'monthly', 'point_in_time')),
  period_end_date date not null,
  source text not null,
  source_date date,
  created_at timestamptz not null default now(),
  unique (company_id, metric_key, period_end_date)
);
create index if not exists ix_company_operational_metrics_company on company_operational_metrics (company_id, period_end_date desc);
create index if not exists ix_company_operational_metrics_key on company_operational_metrics (metric_key);

-- ============================================================================
-- Commodity / raw-material intelligence. Schema only — no row here is ever populated by scraping
-- a paywalled source (BigMint's actual price data is subscription-gated; see
-- docs/BIGMINT_DATA_INTEGRATION.md). company_commodity_exposures is deliberately qualitative
-- (significance: primary/significant/minor, not a numeric cost-share percent) — no verified
-- source exists yet for exact input-cost-structure percentages, and Section 15 explicitly
-- requires explaining exposure direction without claiming an unsupported profit impact.
-- ============================================================================
create table if not exists commodities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  default_unit text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists commodity_prices (
  id bigint generated always as identity primary key,
  commodity_id uuid not null references commodities(id) on delete cascade,
  grade text,
  location text,
  unit text not null,
  currency text not null default 'INR',
  price numeric not null,
  assessment_date date not null,
  source text not null,
  methodology_ref text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ix_commodity_prices_commodity on commodity_prices (commodity_id, assessment_date desc);

create table if not exists company_commodity_exposures (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id) on delete cascade,
  commodity_id uuid not null references commodities(id) on delete cascade,
  exposure_type text not null check (exposure_type in ('input', 'output')),
  significance text check (significance in ('primary', 'significant', 'minor')),
  description text,
  source text,
  created_at timestamptz not null default now(),
  unique (company_id, commodity_id, exposure_type)
);
create index if not exists ix_company_commodity_exposures_company on company_commodity_exposures (company_id);
create index if not exists ix_company_commodity_exposures_commodity on company_commodity_exposures (commodity_id);

-- ============================================================================
-- Stock Portfolio — a separate domain from portfolio_holdings/portfolio_transactions (MF). A
-- stock position has no folio number, no NAV, no expense ratio; forcing it through the MF shape
-- would mean nullable MF-only columns on every stock row and vice versa. current_price/
-- current_value are intentionally NOT columns here: they depend on a live price feed this
-- migration does not build (Section 28: "depends on licensed feed") and would otherwise be
-- fabricated or immediately stale. avg_cost/quantity/invested_value are the only figures this
-- schema can compute without one.
-- ============================================================================
create table if not exists stock_holdings (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete restrict,
  quantity numeric not null check (quantity >= 0),
  avg_cost numeric not null check (avg_cost >= 0),
  source text not null default 'manual' check (source in ('manual', 'broker_import')),
  first_acquired_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, source)
);
create index if not exists ix_stock_holdings_user on stock_holdings (user_id);

create table if not exists stock_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('buy', 'sell')),
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price >= 0),
  transaction_date date not null,
  source text not null default 'manual' check (source in ('manual', 'broker_import')),
  created_at timestamptz not null default now(),
  unique (user_id, company_id, transaction_type, quantity, price, transaction_date, source)
);
create index if not exists ix_stock_transactions_user on stock_transactions (user_id, transaction_date desc);

-- ============================================================================
-- Watchlist — explicitly not the same concept as a portfolio holding (Section 20). Multiple
-- watchlists per user, matching the requirement; a fresh user gets no row here until they create
-- one (no default-row insert trigger), same "don't fabricate state nobody asked for" posture as
-- the rest of this codebase.
-- ============================================================================
create table if not exists stock_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null default 'My Watchlist',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists ix_stock_watchlists_user on stock_watchlists (user_id);

create table if not exists stock_watchlist_items (
  id bigint generated always as identity primary key,
  watchlist_id uuid not null references stock_watchlists(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  notes text,
  added_at timestamptz not null default now(),
  unique (watchlist_id, company_id)
);
create index if not exists ix_stock_watchlist_items_watchlist on stock_watchlist_items (watchlist_id);

-- ============================================================================
-- Alerts — Section 21 explicitly rules out speculative "buy now" signals; every alert_type here
-- is either a factual threshold (price_threshold) or "something objectively happened"
-- (result_published, filing, concall, corporate_action, promoter_transaction,
-- material_announcement, watchlist_event). No alert_type implies or triggers a recommendation.
-- ============================================================================
create table if not exists stock_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  alert_type text not null check (alert_type in (
    'price_threshold', 'result_published', 'filing', 'concall', 'corporate_action',
    'promoter_transaction', 'material_announcement', 'watchlist_event'
  )),
  threshold_value numeric,
  threshold_direction text check (threshold_direction in ('above', 'below')),
  status text not null default 'active' check (status in ('active', 'triggered', 'disabled')),
  created_at timestamptz not null default now(),
  triggered_at timestamptz
);
create index if not exists ix_stock_alerts_user on stock_alerts (user_id, status);
create index if not exists ix_stock_alerts_company on stock_alerts (company_id, status);

-- ============================================================================
-- Research Notes — private/personal only this pass (Section 22 explicitly defers any public
-- community feature: "Do not launch public social/community features in this backend phase
-- unless explicitly approved"). One evolving note per user per company, versioned on every edit
-- so nothing is silently overwritten.
-- ============================================================================
create table if not exists stock_research_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  thesis text,
  catalysts text,
  risks text,
  questions text,
  management_observations text,
  valuation_assumptions text,
  attachments jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists ix_stock_research_notes_user on stock_research_notes (user_id);

create table if not exists stock_research_note_versions (
  id bigint generated always as identity primary key,
  note_id uuid not null references stock_research_notes(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (note_id, version)
);
create index if not exists ix_stock_research_note_versions_note on stock_research_note_versions (note_id, version desc);
