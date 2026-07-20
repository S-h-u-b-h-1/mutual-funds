-- 013_webhook_platform.sql — Phase 4 M2: Webhook Platform
--
-- Generic webhook engine, both directions, built ON TOP of the M1 job platform (processing
-- and outbound delivery are job types — retries/backoff/DLQ come from there, not from a
-- second retry implementation).
--
-- INCOMING: /api/webhooks/[provider] → verify signature → replay/duplicate checks → persist
-- the delivery → enqueue a 'webhook-process' job → the provider's registered handler runs
-- async. A future BSE/payment-gateway integration implements ONLY a handler (+ endpoint row).
--
-- OUTGOING: emitOutboundEvent(type, payload) fans out to registered listener URLs via
-- 'webhook-outbound-deliver' jobs, HMAC-signed the same way we verify inbound.
--
-- Secrets are NEVER stored in these tables — secret_env_var names the environment variable
-- that holds the actual secret (config-platform milestone M10 will validate presence).

create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,          -- URL slug: /api/webhooks/<provider>
  description text,
  signature_scheme text not null default 'hmac-sha256',
  -- 'hmac-sha256' (X-Webhook-Signature over "<timestamp>.<rawBody>") | 'custom' (the
  -- registered handler config supplies its own verify() — for future providers whose scheme
  -- is dictated by their official docs)
  secret_env_var text,                    -- env var NAME holding the shared secret
  tolerance_seconds integer not null default 300,  -- replay window for the signed timestamp
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text,        -- the PROVIDER's id for this event; basis of duplicate detection
  event_type text,
  payload jsonb,
  headers jsonb not null default '{}'::jsonb,  -- signature/timestamp/id headers only, never all
  signature_valid boolean,
  status text not null default 'received',
  -- 'received'   persisted, processing job enqueued
  -- 'processing' handler currently running
  -- 'processed'  handler succeeded (terminal)
  -- 'failed'     handler failed; the processing job retries/dead-letters (the job is the
  --              failure queue — deliveries stay 'failed' until a retry flips them)
  -- 'duplicate'  same (provider, external_event_id) seen before (terminal; acked 200 anyway
  --              so the provider stops resending)
  -- 'rejected'   failed verification — bad signature, stale timestamp, disabled endpoint
  reject_reason text,
  last_error text,
  job_id uuid references jobs(id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
-- Duplicate detection: one delivery per provider event id (rejected rows excluded so a
-- forged-signature request can't squat a real event's id before the genuine one arrives).
create unique index if not exists webhook_deliveries_dedup_uq
  on webhook_deliveries (provider, external_event_id)
  where external_event_id is not null and status <> 'rejected';
create index if not exists webhook_deliveries_provider_idx
  on webhook_deliveries (provider, received_at desc);
create index if not exists webhook_deliveries_status_idx
  on webhook_deliveries (status, received_at desc);

create table if not exists webhook_outbound (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text not null,
  event_types jsonb not null default '[]'::jsonb,  -- internal event names this listener wants
  secret_env_var text,                              -- signing secret env var NAME
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_outbound_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbound_id uuid not null references webhook_outbound(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending',  -- 'pending' | 'delivered' | 'dead'
  attempts integer not null default 0,
  last_status_code integer,
  last_error text,
  job_id uuid references jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists webhook_outbound_deliveries_idx
  on webhook_outbound_deliveries (outbound_id, created_at desc);

-- Seed the mock incoming provider the test-harness and future payment-flow rehearsals use.
-- Real providers get their own rows when commercial onboarding supplies docs + secrets.
insert into webhook_endpoints (provider, description, signature_scheme, secret_env_var) values
  ('mock-payments', 'Mock payment-gateway callbacks (test harness; no real provider)', 'hmac-sha256', 'WEBHOOK_SECRET_MOCK_PAYMENTS')
on conflict (provider) do nothing;
