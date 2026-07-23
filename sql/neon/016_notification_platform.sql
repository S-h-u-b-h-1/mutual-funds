-- Phase 5 M5 — Notification Platform. Extends the notifications table built deliberately
-- minimal in migration 010 (Journey 2) — see that file's own comment: "the full notification
-- service (list/mark-read APIs, the complete event vocabulary) is Journey 6; building the table
-- now and the full service later avoids building it twice." This is that full service landing.
-- Every existing row/column/index from 010 is preserved untouched; everything below is additive.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/016_notification_platform.sql

alter table notifications add column if not exists channel text not null default 'in_app';
alter table notifications add column if not exists category text;
alter table notifications add column if not exists priority text not null default 'normal'; -- critical | high | normal | low
-- Existing rows predate the status/state-machine concept entirely — they were written directly,
-- synchronously, with no queue/retry step, so 'delivered' is the only truthful status for them.
-- New in-app sends stay synchronous (still 'delivered' immediately); anything actually routed
-- through the async delivery pipeline (M5 sub-step 2 onward) explicitly sets 'queued' first.
alter table notifications add column if not exists status text not null default 'delivered';
alter table notifications add column if not exists template_name text;
alter table notifications add column if not exists template_version text;
alter table notifications add column if not exists correlation_id text;
alter table notifications add column if not exists data jsonb not null default '{}';
alter table notifications add column if not exists scheduled_for timestamptz;
alter table notifications add column if not exists expires_at timestamptz;
alter table notifications add column if not exists attempts int not null default 0;
alter table notifications add column if not exists max_attempts int not null default 5;
alter table notifications add column if not exists last_error text;
alter table notifications add column if not exists job_id uuid references jobs(id) on delete set null;
alter table notifications add column if not exists dismissed_at timestamptz;
alter table notifications add column if not exists archived_at timestamptz;
alter table notifications add column if not exists cancelled_at timestamptz;
alter table notifications add column if not exists delivered_at timestamptz;
alter table notifications add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_notifications_user_status on notifications (user_id, status, created_at desc);
create index if not exists idx_notifications_user_category on notifications (user_id, category) where category is not null;
create index if not exists idx_notifications_correlation on notifications (correlation_id) where correlation_id is not null;
-- Only rows actually due for async delivery — in-app's synchronous path never touches 'queued'.
create index if not exists idx_notifications_due on notifications (scheduled_for) where status = 'queued';

-- Every state transition, per notification, per the brief's "every transition must be
-- auditable" — same shape as job_events/domain_events elsewhere in this platform.
create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  event text not null, -- created | queued | processing | delivered | failed | retry_scheduled | dead_lettered | read | dismissed | archived | cancelled
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_events_notification on notification_events (notification_id, created_at);

-- One row per user; absence means "all defaults" (in-app only, no quiet hours, English) rather
-- than requiring a row to exist before a user can receive anything.
create table if not exists notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  enabled_channels text[] not null default array['in_app'],
  category_settings jsonb not null default '{}', -- { [category]: { enabled: bool, channels: [...] } }
  quiet_hours_start smallint, -- 0-23 local to quiet_hours_timezone; null = quiet hours not configured
  quiet_hours_end smallint,
  quiet_hours_timezone text not null default 'Asia/Kolkata',
  digest_enabled boolean not null default false,
  digest_frequency text not null default 'daily', -- daily | weekly
  language text not null default 'en',
  updated_at timestamptz not null default now()
);
