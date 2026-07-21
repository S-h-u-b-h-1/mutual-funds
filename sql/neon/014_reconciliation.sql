-- 014_reconciliation.sql — Phase 4 M3: Reconciliation Engine
--
-- Exception-based reconciliation: a RUN executes a named comparator over paired
-- internal/external records; MATCHED pairs are counted in the run's totals (and auto-resolve
-- any open exception for that key); EXCEPTIONS become persistent items that live ACROSS runs
-- as one row per (recon_type, entity_key) — occurrences increment instead of duplicating, so
-- "this order has mismatched for 3 days" is one escalating item, not three disconnected rows.
--
-- Item status ladder (the brief's states, with explicit semantics):
--   'retry'     first sighting of a mismatch — often settlement/timing; re-checked next run
--   'mismatch'  persisted on the 2nd consecutive sighting — a real discrepancy
--   'escalated' 3rd+ sighting — needs an operator
--   'resolved'  terminal: matched again on a later run (auto-heal, noted as such) or manually
--               resolved with a note. 'pending' exists only transiently inside a run.
--
-- Audit: the run row (scope, totals, timing, job linkage) + the item history (occurrences,
-- first/last run ids, resolution trail) are the auditable record; M8 folds these into the
-- platform-wide audit spine.

create table if not exists reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  recon_type text not null,
  status text not null default 'running',  -- 'running' | 'completed' | 'failed'
  scope jsonb not null default '{}'::jsonb,
  totals jsonb,          -- {checked, matched, exceptions, autoResolved, retry, mismatch, escalated}
  job_id uuid references jobs(id) on delete set null,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists reconciliation_runs_type_idx on reconciliation_runs (recon_type, started_at desc);

create table if not exists reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  recon_type text not null,
  entity_type text not null,   -- 'order' | 'holding' | 'document' | 'webhook_delivery' | ...
  entity_key text not null,    -- stable identity of the reconciled thing (id or composite)
  status text not null default 'retry',
  -- 'retry' | 'mismatch' | 'escalated' | 'resolved'  (ladder above)
  mismatch_kind text,          -- 'value_mismatch' | 'missing_external' | 'missing_internal'
  details jsonb not null default '{}'::jsonb,  -- field-level diffs: [{field, internal, external}]
  occurrences integer not null default 1,
  first_seen_run_id uuid references reconciliation_runs(id) on delete set null,
  last_seen_run_id uuid references reconciliation_runs(id) on delete set null,
  resolved_by text,            -- 'auto' or an operator identifier
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One OPEN exception per reconciled entity — the ladder lives on this row.
create unique index if not exists reconciliation_open_item_uq
  on reconciliation_items (recon_type, entity_key)
  where status in ('retry', 'mismatch', 'escalated');
create index if not exists reconciliation_items_status_idx
  on reconciliation_items (recon_type, status, updated_at desc);

-- Daily schedules for the comparators M3 ships, staggered after the nightly maintenance
-- jobs. All idempotent; all run against mock providers where a provider is involved
-- (honestly labeled — swapping in BSE/RTA changes the provider, not the engine).
insert into job_schedules (name, job_type, payload, daily_at, next_run_at) values
  ('recon-documents-vault-integrity-daily', 'reconciliation-run', '{"reconType":"documents-vault-integrity"}', '02:45', now()),
  ('recon-orders-provider-linkage-daily', 'reconciliation-run', '{"reconType":"orders-provider-linkage"}', '03:00', now()),
  ('recon-holdings-vs-provider-daily', 'reconciliation-run', '{"reconType":"holdings-vs-provider"}', '03:10', now()),
  ('recon-webhook-processing-lag-daily', 'reconciliation-run', '{"reconType":"webhook-processing-lag"}', '03:20', now())
on conflict (name) do nothing;
