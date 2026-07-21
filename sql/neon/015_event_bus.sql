-- 015_event_bus.sql — Phase 4 M4: Event Bus
--
-- domain_events is the durable, append-only log every emitted event lands in — the audit
-- trail IS the emit step, not a side effect of it. Internal-listener dispatch state lives on
-- the M1 `jobs` table (each dispatch is an 'event-dispatch' job), so there is no separate
-- dispatch-tracking table here: job status/retries/DLQ already are that tracking.

create table if not exists domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text,          -- ties related events together (e.g. an order's id across its lifecycle)
  source text,                   -- which service emitted it ('identityService', 'orderService', ...)
  created_at timestamptz not null default now()
);
create index if not exists domain_events_type_idx on domain_events (event_type, created_at desc);
create index if not exists domain_events_correlation_idx on domain_events (correlation_id) where correlation_id is not null;
