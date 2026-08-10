-- 037_stock_index_membership.sql — Stock Intelligence Engine mission, Phase 1/SLICE 1: canonical
-- index membership (NIFTY 50, BSE 100 first). 035_stock_intelligence_foundation.sql deliberately
-- scoped this out ("does NOT build Market Monitor (index price feeds)... this pass") and no table,
-- column, or code anywhere in this codebase represents "which companies belong to which index" —
-- confirmed by grep across sql/neon/*.sql and frontend/app/lib/stocks/*.js before writing this.
--
-- Effective-dating shape is a deliberate mirror of company_exchange_listings (035:125-136), the
-- one place this exact "membership with a start/end date, never destructively overwritten"
-- problem was already solved once in this schema — reusing that shape rather than inventing a
-- new one. A re-ingestion NEVER updates an existing membership row's constituent list in place;
-- it closes memberships no longer present (sets left_at) and opens new ones — the point of
-- effective dating is that "who was in NIFTY 50 on 2026-08-10" stays answerable after 2026-09-10.
--
-- stock_indices is deliberately generic (not two hardcoded booleans on companies) so a third index
-- (NIFTY Next 50, NIFTY 500, ...) is a data row, not a schema change — matching this migration's
-- own stated "quality before breadth, but don't hardcode against future breadth" instruction.
--
-- Run: python3 scripts/apply_migrations.py --apply (or the Neon MCP run_sql_transaction workaround
-- per docs/MIGRATION_RUNBOOK.md if the auto-classifier declines the DDL).

create table if not exists stock_indices (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  provider text not null,
  created_at timestamptz not null default now()
);
comment on table stock_indices is
  'Canonical index catalog (NIFTY 50, BSE 100, ...) — a new index is a row, not a schema change.';
comment on column stock_indices.key is
  'Stable machine key matching frontend/app/data/stock_universe.json''s indices.<key> shape (e.g. NIFTY50, BSE100).';

create table if not exists stock_index_memberships (
  id bigint generated always as identity primary key,
  index_id uuid not null references stock_indices(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  joined_at date not null,
  left_at date,
  is_current boolean not null default true,
  source text not null,
  source_url text,
  source_effective_date date,
  source_checksum_sha256 text,
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_stock_index_memberships_index on stock_index_memberships (index_id, is_current);
create index if not exists ix_stock_index_memberships_company on stock_index_memberships (company_id, is_current);
-- Guarantees at most one OPEN (is_current) membership per (index, company) — re-ingestion must
-- close the old row before opening a new one, never leave two current rows for the same pair.
create unique index if not exists ux_stock_index_memberships_open
  on stock_index_memberships (index_id, company_id) where is_current;

comment on table stock_index_memberships is
  'Effective-dated index constituency. A membership is closed (left_at set, is_current=false) and '
  'a new one opened on re-ingestion — never destructively overwritten. Mirrors '
  'company_exchange_listings'' listed_at/delisted_at/is_active shape (035_stock_intelligence_foundation.sql).';
comment on column stock_index_memberships.source is
  'Human-readable provenance, e.g. "NSE Indices" or "BSE Indices" — matches frontend/app/data/stock_universe.json''s indices.<key>.provider.';
comment on column stock_index_memberships.source_checksum_sha256 is
  'SHA-256 of the raw source file/response this row was derived from, for exact reproducibility — matches the collector''s own sourceChecksumSha256.';
