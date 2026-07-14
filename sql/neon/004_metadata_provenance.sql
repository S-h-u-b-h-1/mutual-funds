-- MF Pulse — Metadata provenance schema, Neon mirror (Provenance Mission Phase 3).
--
-- Mirrors sql/013_metadata_provenance.sql's table shapes for dual-write parity with
-- scripts/archive_factsheets.py's existing pattern (factsheet_archive/fund_history_events are
-- already dual-written; this extends the same pair of databases with field-level provenance).
--
-- Convention: bigint identity PKs (same shape as the Supabase side, so upsert() key columns
-- line up) but NO RLS — consistent with 002_auth_and_user_data.sql / 003_investor_intelligence.sql's
-- established Neon convention that authorization is app-code-only (query() in lib/db.js mediates
-- every read; there is no direct client-to-Neon path the way Supabase's PostgREST allows, so RLS
-- policies would be dead weight here, not defense in depth). This data is public fund-research
-- data either way (same category as factsheet_archive), not user-owned data — the "app-code-only"
-- reasoning applies regardless of RLS, since nothing queries Neon directly from a browser.
--
-- Two databases, independently-generated ids: per ingestion/db.py's lookup_id() docstring (see
-- scripts/archive_factsheets.py), a Supabase-side id and a Neon-side id for "the same" row are
-- NOT expected to match — each database's identity sequence is its own. Cross-references
-- (source_document_version_id, parser_version_id, source_extraction_id) are only ever resolved
-- within one database, never across the Supabase/Neon boundary.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/004_metadata_provenance.sql

create table if not exists source_documents (
  id                bigint generated always as identity primary key,
  amc               text not null,
  document_type     text not null check (document_type in
                       ('factsheet_pdf', 'portfolio_disclosure_xlsx', 'sid', 'kim', 'scheme_html_page')),
  scheme_hint       text,
  canonical_url     text not null,
  discovery_method  text not null check (discovery_method in ('direct_url', 'playwright_discovery', 'manual')),
  created_at        timestamptz not null default now()
);
-- Table-level UNIQUE can't hold an expression like coalesce() — needs a unique INDEX instead.
create unique index if not exists ux_source_documents_identity
  on source_documents (amc, document_type, coalesce(scheme_hint, ''), canonical_url);

create table if not exists source_document_versions (
  id                    bigint generated always as identity primary key,
  source_document_id    bigint not null references source_documents(id),
  fetched_url           text not null,
  published_date        date,
  fetched_at            timestamptz not null default now(),
  raw_content_sha256    text not null,
  byte_size             int,
  format_valid          boolean,
  created_at            timestamptz not null default now(),
  unique (source_document_id, raw_content_sha256)
);
create index if not exists ix_source_document_versions_doc on source_document_versions (source_document_id, fetched_at desc);

create table if not exists parser_versions (
  id             bigint generated always as identity primary key,
  parser_name    text not null,
  version_label  text not null,
  code_ref       text,
  created_at     timestamptz not null default now(),
  unique (parser_name, version_label)
);

create table if not exists source_extractions (
  id                            bigint generated always as identity primary key,
  scheme_code                   text not null,
  raw_scheme_identifier         text,
  field_name                    text not null,
  raw_value                     text,
  normalized_value              jsonb,
  unit                          text,
  source_document_version_id    bigint not null references source_document_versions(id),
  page_number                   int,
  table_reference                text,
  extraction_method              text not null,
  parser_version_id             bigint not null references parser_versions(id),
  extracted_at                   timestamptz not null default now(),
  confidence                    text not null check (confidence in ('high', 'medium', 'low')),
  is_current                     boolean not null default true,
  limitations                    text
);
-- UNIQUE, not just an index: docs/METADATA_PROVENANCE_SCHEMA.md states "exactly one current=true
-- row per (scheme_code, field_name)" as a design invariant. A plain index doesn't enforce that —
-- only a unique constraint does. Added before this migration is ever applied (table is empty, so
-- there's no risk of a pre-existing violation blocking the constraint from being created).
create unique index if not exists ux_source_extractions_current on source_extractions (scheme_code, field_name) where is_current;
create index if not exists ix_source_extractions_scheme_field on source_extractions (scheme_code, field_name, extracted_at desc);
create index if not exists ix_source_extractions_doc_version on source_extractions (source_document_version_id);

create table if not exists field_validation_results (
  id                     bigint generated always as identity primary key,
  source_extraction_id   bigint not null references source_extractions(id),
  check_name             text not null,
  passed                 boolean not null,
  detail                 text,
  checked_at             timestamptz not null default now()
);
create index if not exists ix_field_validation_results_extraction on field_validation_results (source_extraction_id);

create table if not exists metadata_quarantine (
  id                     bigint generated always as identity primary key,
  source_extraction_id   bigint not null references source_extractions(id),
  reason                 text not null,
  quarantined_at         timestamptz not null default now(),
  reviewed               boolean not null default false,
  reviewed_at            timestamptz,
  resolution             text
);
create index if not exists ix_metadata_quarantine_unreviewed on metadata_quarantine (reviewed) where not reviewed;

create or replace view fund_metadata_values as
select
  se.scheme_code, se.field_name, se.raw_value, se.normalized_value, se.unit, se.confidence,
  se.extracted_at, sdv.published_date as source_date, sdv.fetched_at as source_fetched_at,
  sd.amc, sd.document_type, sd.canonical_url as source_url,
  se.page_number, se.table_reference, se.extraction_method,
  pv.parser_name, pv.version_label as parser_version, se.limitations,
  (current_date - sdv.published_date) > 45 as is_stale
from source_extractions se
join source_document_versions sdv on sdv.id = se.source_document_version_id
join source_documents sd on sd.id = sdv.source_document_id
join parser_versions pv on pv.id = se.parser_version_id
where se.is_current
  and not exists (select 1 from field_validation_results v where v.source_extraction_id = se.id and not v.passed)
  and not exists (select 1 from metadata_quarantine q where q.source_extraction_id = se.id and not q.reviewed);

create or replace view fund_metadata_history as
select
  se.*, sdv.published_date, sdv.fetched_at as source_fetched_at,
  sd.amc, sd.document_type, sd.canonical_url as source_url,
  pv.parser_name, pv.version_label as parser_version,
  exists (select 1 from metadata_quarantine q where q.source_extraction_id = se.id and not q.reviewed) as is_quarantined
from source_extractions se
join source_document_versions sdv on sdv.id = se.source_document_version_id
join source_documents sd on sd.id = sdv.source_document_id
join parser_versions pv on pv.id = se.parser_version_id
order by se.scheme_code, se.field_name, se.extracted_at desc;

alter table fact_factsheet_runs add column if not exists document_type text;
alter table fact_factsheet_runs add column if not exists parser_version_id bigint references parser_versions(id);
