-- Additive only: historical uploads/users/audit rows are preserved.
create table if not exists newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email))),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','confirmed','unsubscribed'))
);
revoke all on newsletter_subscriptions from public;

create table if not exists schema_baselines (
  id text primary key,
  captured_at timestamptz not null default now(),
  schema_checksum text not null,
  details jsonb not null
);
revoke all on schema_baselines from public;
