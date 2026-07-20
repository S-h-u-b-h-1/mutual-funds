-- 012_job_platform.sql — Phase 4 M1: Background Job Platform
--
-- A Postgres-backed durable job queue. Deliberate architecture choice for this stack:
-- Vercel serverless can't host a long-lived worker process, and the brief requires
-- provider-independence — so the queue lives in Neon (the system of record we already
-- trust) and is drained by short-lived worker ticks (GitHub Actions cron running
-- frontend/scripts/jobs_worker_tick.mjs). Claiming uses SELECT ... FOR UPDATE SKIP LOCKED,
-- so any number of concurrent tickers are safe; crash recovery is lease-based, so a worker
-- that dies mid-job never strands it. Semantics are AT-LEAST-ONCE: handlers must be
-- idempotent (documented in docs/JOB_PLATFORM.md).
--
-- Status model (kept minimal on purpose — retry visibility lives in job_events, not in a
-- separate 'failed' interim status):
--   'queued'    waiting (run_at may be in the future = delayed job, or a scheduled retry)
--   'running'   claimed by a worker, lease_expires_at set
--   'succeeded' terminal
--   'dead'      terminal — the dead-letter queue: max_attempts exhausted, kept for inspection
--   'cancelled' terminal — cancelled while still queued (a running job cannot be cancelled;
--               the worker owning it may be mid-side-effect)

-- Recurring jobs. Two recurrence forms, both deliberately simple and testable rather than a
-- cron-expression parser: fixed interval_seconds, or once daily at daily_at (UTC).
create table if not exists job_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  interval_seconds integer,
  daily_at time,               -- UTC time of day
  priority integer not null default 5,
  max_attempts integer not null default 5,
  enabled boolean not null default true,
  last_enqueued_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- exactly one recurrence form
  check (
    (interval_seconds is not null and daily_at is null)
    or (interval_seconds is null and daily_at is not null)
  ),
  check (interval_seconds is null or interval_seconds >= 60)
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  -- 'queued' | 'running' | 'succeeded' | 'dead' | 'cancelled'  (see header)
  priority integer not null default 5 check (priority between 1 and 9), -- 1 = most urgent
  run_at timestamptz not null default now(),
  attempts integer not null default 0,       -- incremented at claim time (= execution tries)
  max_attempts integer not null default 5 check (max_attempts >= 1),
  backoff_base_seconds integer not null default 30,
  backoff_max_seconds integer not null default 3600,
  -- Idempotent enqueue: same key can only ever create one job row. Partial unique index
  -- below (not a column constraint) so null keys stay unconstrained.
  idempotency_key text,
  correlation_id text,          -- request/trace id propagated from the enqueuing context
  schedule_id uuid references job_schedules(id) on delete set null,
  locked_by text,               -- worker id currently holding the lease
  lease_expires_at timestamptz, -- past this, the job is presumed orphaned and reclaimable
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,       -- first claim
  finished_at timestamptz,      -- terminal transition
  updated_at timestamptz not null default now()
);

create unique index if not exists jobs_idempotency_key_uq
  on jobs (idempotency_key) where idempotency_key is not null;
-- The claim query's exact shape: status filter + ordering by (priority, run_at).
create index if not exists jobs_claim_idx
  on jobs (priority, run_at) where status = 'queued';
create index if not exists jobs_lease_idx
  on jobs (lease_expires_at) where status = 'running';
create index if not exists jobs_type_status_idx on jobs (type, status, created_at);

-- Full execution history — every state transition, with detail. This (not extra statuses)
-- is where "how many times did it fail and why" lives.
create table if not exists job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references jobs(id) on delete cascade,
  event text not null,
  -- 'enqueued' | 'deduplicated' | 'claimed' | 'succeeded' | 'retry_scheduled'
  -- | 'dead_lettered' | 'cancelled' | 'lease_reclaimed'
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists job_events_job_idx on job_events (job_id, id);

-- Seed the two recurring platform-maintenance schedules M1 ships with. next_run_at = now()
-- means the first worker tick runs them immediately, then they settle onto their daily slot.
-- Both handlers are idempotent, so the early first run is harmless.
insert into job_schedules (name, job_type, daily_at, next_run_at) values
  ('vault-retention-sweep-daily', 'vault-retention-sweep', '01:30', now()),
  ('job-history-prune-daily', 'job-history-prune', '02:15', now())
on conflict (name) do nothing;
