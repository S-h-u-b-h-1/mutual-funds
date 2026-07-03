-- Phase 6/7 (institutional data-depth sprint) — versioned factsheet archive + fund-history event
-- log. Same posture as every other table here: public SELECT, writes only via service-role key.
--
-- Fund history events are NEVER inferred — they are only ever produced by diffing two
-- consecutive factsheet_archive rows for the same scheme_code (see scripts/archive_factsheets.py's
-- detect_changes()). Since no prior snapshots exist before this migration, fund_history_events
-- starts genuinely empty; the first change it can ever record requires a SECOND real archived
-- snapshot to diff against the first. Any UI showing this must say so plainly: "History begins
-- from first archived factsheet" — never implying older history exists.

create table if not exists factsheet_archive (
  id bigint generated always as identity primary key,
  scheme_code text not null,
  amc text not null,
  source_url text,
  -- checksum of the PARSED metadata content (not the raw PDF bytes) for this initial backfill —
  -- we only have parsed output for the 152 already-ingested schemes, not the original PDFs.
  -- scripts/ingest_factsheets.py should checksum the raw PDF at fetch time going forward and
  -- store that instead; content_checksum remains a valid "did anything parsed change" signal
  -- either way.
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

alter table factsheet_archive enable row level security;
alter table fund_history_events enable row level security;

create policy "public_read_factsheet_archive" on factsheet_archive for select using (true);
create policy "public_read_fund_history_events" on fund_history_events for select using (true);
-- No write policies — only the service-role key (bypasses RLS) can write, same as every other
-- table in this project.
