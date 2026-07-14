-- 013_metadata_provenance.sql — Provenance Mission Phase 3: field-level source provenance.
--
-- Answers, for any displayed metadata value, "which exact document, published when, fetched
-- when, by which parser, produced this?" — something no existing table can answer today.
-- factsheet_archive (011) stores one wide row per scheme per snapshot with a SINGLE source_url
-- for the whole row; it cannot say which page or table a specific field came from, and it stores
-- only the already-parsed value, never the raw matched text. This migration is additive: it does
-- not replace factsheet_archive or fact_factsheet_runs (005), it gives them a field-level
-- companion. Nothing here deletes or renames an existing table.
--
-- Design choice: fund_metadata_values / fund_metadata_history (both named in the mission brief)
-- are VIEWS over source_extractions, not physical tables. A field's "current value" and "full
-- history" are both fully derivable from the extraction log below — storing them again as
-- separate tables would be a fourth copy of the same fact and could silently drift from the log
-- that is supposed to be the source of truth. "Never duplicate calculations" applies to storage
-- as much as to code.

-- ---------------------------------------------------------------------------------------------
-- 1. source_documents — the LOGICAL identity of a document (e.g. "SBI Small Cap Fund's per-
--    scheme factsheet"), stable across the many times it gets re-published/re-fetched.
create table if not exists source_documents (
  id                bigint generated always as identity primary key,
  amc               text not null,
  document_type     text not null check (document_type in
                       ('factsheet_pdf', 'portfolio_disclosure_xlsx', 'sid', 'kim', 'scheme_html_page')),
  scheme_hint       text,                 -- null for a consolidated document covering many schemes
  canonical_url     text not null,        -- the stable URL/portal pattern identifying this document
  discovery_method  text not null check (discovery_method in ('direct_url', 'playwright_discovery', 'manual')),
  created_at        timestamptz not null default now()
);
-- A table-level UNIQUE constraint can't contain an expression like coalesce() — only a plain
-- column list. scheme_hint is nullable (null = consolidated document), so this has to be a
-- unique INDEX on the expression, not a table constraint.
create unique index if not exists ux_source_documents_identity
  on source_documents (amc, document_type, coalesce(scheme_hint, ''), canonical_url);

-- 2. source_document_versions — one row per actual fetch. A monthly factsheet re-fetched every
--    month produces a new version here each time its content changes (or even when it doesn't —
--    see the unique constraint below, which dedupes on content, not on fetch attempt).
create table if not exists source_document_versions (
  id                    bigint generated always as identity primary key,
  source_document_id    bigint not null references source_documents(id),
  fetched_url           text not null,     -- actual URL fetched (may carry a version/query param the canonical_url doesn't)
  published_date        date,              -- the document's OWN stated as-of/effective date — never assumed equal to fetched_at
  fetched_at            timestamptz not null default now(),
  raw_content_sha256    text not null,      -- checksum of the FETCHED BYTES (not the parsed fields)
  byte_size             int,
  format_valid          boolean,           -- basic sanity check (e.g. %PDF- header present) passed at fetch time
  created_at            timestamptz not null default now(),
  unique (source_document_id, raw_content_sha256)
);
create index if not exists ix_source_document_versions_doc on source_document_versions (source_document_id, fetched_at desc);

-- 3. parser_versions — which exact parser logic produced an extraction. Lets a future parser fix
--    be scoped to "re-run everything extracted by parser X before version Y" instead of guessing.
create table if not exists parser_versions (
  id             bigint generated always as identity primary key,
  parser_name    text not null,           -- e.g. 'SBIAdapter', 'HDFCAdapter', 'PortfolioDisclosureParser'
  version_label  text not null,           -- e.g. a short git SHA, or a manually bumped semantic tag
  code_ref       text,                    -- e.g. the git commit this version corresponds to
  created_at     timestamptz not null default now(),
  unique (parser_name, version_label)
);

-- 4. source_extractions — the core provenance record: one row per (scheme, field, document
--    version, parser version). This is the only place a field's value is actually stored;
--    fund_metadata_values/history (views, below) read from here.
create table if not exists source_extractions (
  id                            bigint generated always as identity primary key,
  scheme_code                   text not null,       -- resolved CANONICAL AMFI scheme code
  raw_scheme_identifier         text,                -- the scheme name/hint exactly as it appeared in the source document, before resolution — never discarded
  field_name                    text not null,       -- e.g. 'expense_ratio', 'fund_manager', 'holdings', 'ytm'
  raw_value                     text,                -- the exact matched source text, before normalization
  normalized_value              jsonb,               -- the typed/parsed value — number, string, or a structured array (holdings, sector_allocation)
  unit                          text,                -- e.g. '%', 'crores', 'days'; null where not applicable
  source_document_version_id    bigint not null references source_document_versions(id),
  page_number                   int,                 -- null when the extraction method doesn't track pages (e.g. whole-text regex)
  table_reference                text,                -- free text, e.g. "Top 10 Holdings table", "Rating Profile table"
  extraction_method              text not null,       -- e.g. 'labeled_line_regex', 'table_extraction', 'positional_pdf', 'derived'
  parser_version_id             bigint not null references parser_versions(id),
  extracted_at                   timestamptz not null default now(),
  confidence                    text not null check (confidence in ('high', 'medium', 'low')),
  is_current                     boolean not null default true,   -- exactly one current=true, validated row per (scheme_code, field_name)
  limitations                    text                  -- free text caveat, e.g. "solo fund-manager line ambiguous — see SBI adapter comment"
);
-- UNIQUE, not just an index — enforces "exactly one current row per (scheme_code, field_name)"
-- at the database level, matching the same fix applied to the Neon mirror (sql/neon/004).
create unique index if not exists ux_source_extractions_current on source_extractions (scheme_code, field_name) where is_current;
create index if not exists ix_source_extractions_scheme_field on source_extractions (scheme_code, field_name, extracted_at desc);
create index if not exists ix_source_extractions_doc_version on source_extractions (source_document_version_id);

-- 5. field_validation_results — every validation check run against an extraction, pass or fail.
--    A field is eligible to appear in fund_metadata_values only if it has zero failing checks.
create table if not exists field_validation_results (
  id                     bigint generated always as identity primary key,
  source_extraction_id   bigint not null references source_extractions(id),
  check_name             text not null,     -- e.g. 'expense_ratio_range', 'sector_sum_bounds', 'not_a_subtotal_row', 'not_a_security_name_in_sector_field'
  passed                 boolean not null,
  detail                 text,
  checked_at             timestamptz not null default now()
);
create index if not exists ix_field_validation_results_extraction on field_validation_results (source_extraction_id);

-- 6. metadata_quarantine — extractions held back from publication. Quarantine is a queue for
--    review, not a silent discard — reviewed/resolution columns make the disposition traceable.
create table if not exists metadata_quarantine (
  id                     bigint generated always as identity primary key,
  source_extraction_id   bigint not null references source_extractions(id),
  reason                 text not null,
  quarantined_at         timestamptz not null default now(),
  reviewed               boolean not null default false,
  reviewed_at            timestamptz,
  resolution             text               -- e.g. 'confirmed bad, discarded' / 'false positive, released'
);
create index if not exists ix_metadata_quarantine_unreviewed on metadata_quarantine (reviewed) where not reviewed;

-- 7. fund_metadata_values — current, validated value per (scheme, field). A VIEW, not a table:
--    derived entirely from source_extractions + field_validation_results so it can never drift
--    from the extraction log that is the actual source of truth.
create or replace view fund_metadata_values as
select
  se.scheme_code,
  se.field_name,
  se.raw_value,
  se.normalized_value,
  se.unit,
  se.confidence,
  se.extracted_at,
  sdv.published_date  as source_date,
  sdv.fetched_at       as source_fetched_at,
  sd.amc,
  sd.document_type,
  sd.canonical_url    as source_url,
  se.page_number,
  se.table_reference,
  se.extraction_method,
  pv.parser_name,
  pv.version_label    as parser_version,
  se.limitations,
  (current_date - sdv.published_date) > 45 as is_stale   -- standard 45-day threshold, docs/DATA_SOURCE_REGISTER.md
from source_extractions se
join source_document_versions sdv on sdv.id = se.source_document_version_id
join source_documents sd on sd.id = sdv.source_document_id
join parser_versions pv on pv.id = se.parser_version_id
where se.is_current
  and not exists (select 1 from field_validation_results v where v.source_extraction_id = se.id and not v.passed)
  and not exists (select 1 from metadata_quarantine q where q.source_extraction_id = se.id and not q.reviewed);

-- 8. fund_metadata_history — every extraction ever made, current or superseded, quarantined or
--    not. Also a view — this is the audit trail fund_metadata_values intentionally filters down.
create or replace view fund_metadata_history as
select
  se.*,
  sdv.published_date, sdv.fetched_at as source_fetched_at,
  sd.amc, sd.document_type, sd.canonical_url as source_url,
  pv.parser_name, pv.version_label as parser_version,
  exists (select 1 from metadata_quarantine q where q.source_extraction_id = se.id and not q.reviewed) as is_quarantined
from source_extractions se
join source_document_versions sdv on sdv.id = se.source_document_version_id
join source_documents sd on sd.id = sdv.source_document_id
join parser_versions pv on pv.id = se.parser_version_id
order by se.scheme_code, se.field_name, se.extracted_at desc;

-- 9. metadata_ingestion_runs — the mission names this as a required concept; it is the same
--    concept as the EXISTING fact_factsheet_runs (005_factsheet_runs.sql), which already has
--    amc/status/schemes_found/schemes_populated/problems/source_url/started_at/finished_at and,
--    critically, is a real table nothing currently writes to (Phase 4 finding). Extending it
--    rather than creating a same-shaped second table.
alter table fact_factsheet_runs add column if not exists document_type text;
alter table fact_factsheet_runs add column if not exists parser_version_id bigint references parser_versions(id);
comment on table fact_factsheet_runs is
  'Ingestion run audit log — this is the table the Provenance Mission brief calls metadata_ingestion_runs. Not currently written to by any script (Phase 4 finding); wiring this up is part of the Phase 4 pipeline fix.';

-- RLS: same posture as every other table in this project — public read, service-role-only write.
alter table source_documents enable row level security;
alter table source_document_versions enable row level security;
alter table parser_versions enable row level security;
alter table source_extractions enable row level security;
alter table field_validation_results enable row level security;
alter table metadata_quarantine enable row level security;

do $$ begin
  create policy p_read on source_documents for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_read on source_document_versions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_read on parser_versions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_read on source_extractions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_read on field_validation_results for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  -- Quarantine is deliberately NOT public-readable — it may contain contaminated/rejected
  -- extraction attempts (e.g. mis-parsed text) that shouldn't be surfaced anywhere in the
  -- product, even accidentally via a generic "select * from every table" debug view.
  create policy p_service_only on metadata_quarantine for select using (false);
exception when duplicate_object then null; end $$;
-- No write policies anywhere above — only the service-role key (bypasses RLS) writes, same as
-- every other table in this project.
