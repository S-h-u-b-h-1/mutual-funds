-- MF Pulse — Auth + User Data schema (Personal Investment Operating System, cloud-sync sprint,
-- 2026-07-08). Neon is primary for every table in this file — none of this ever existed in
-- Supabase, so there is no migration-from-Supabase question here (unlike 001_neon_schema.sql).
--
-- DELIBERATE CHOICES, read before touching this file:
--
-- 1. NO ROW-LEVEL SECURITY. Same reasoning as 001_neon_schema.sql: DATABASE_URL is server-only
--    (Next.js Route Handlers, never the browser), so authorization is enforced in application
--    code — every query in every route handler is written with an explicit `where user_id = $1`
--    using the AUTHENTICATED SESSION's user id, never a client-supplied one. This is stricter
--    than RLS in practice (no query can accidentally omit a WHERE clause and still return data,
--    because there is no direct client->DB path at all), but it means a bug in a route handler
--    is not caught by a second, independent DB-level gate. Every new route handler MUST derive
--    user_id from the server-side session, never from a request body/query param.
--
-- 2. UUID primary keys (gen_random_uuid(), pgcrypto — already enabled by 001_neon_schema.sql)
--    for every table in this file, matching Auth.js's expected id shape and avoiding sequential-
--    id enumeration of users.
--
-- 3. Auth.js tables (users/accounts/sessions/verification_tokens) use THIS file's own snake_case
--    naming, matching every other table in this codebase — NOT the stock @auth/pg-adapter's
--    camelCase schema. This repo pairs them with a custom Adapter implementation
--    (frontend/app/lib/authAdapter.js) instead of the stock adapter package, specifically so the
--    schema stays internally consistent and doesn't depend on a third-party package's exact
--    internal column names being reproduced correctly from memory.
--
-- 4. Every user-owned table has `on delete cascade` from users(id) — deleting a user's account
--    genuinely removes their data everywhere, not just from the users table (a real GDPR/privacy
--    consideration for a product that will hold research history and, eventually, portfolio data).
--
-- Run: psql "$DATABASE_URL" -f sql/neon/002_auth_and_user_data.sql

create extension if not exists pgcrypto;

-- ============================================================================
-- Auth.js core tables
-- ============================================================================

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  email_verified timestamptz,
  image text,
  -- Only set for Credentials-provider (email+password) users; null for OAuth-only users, who
  -- authenticate solely via the accounts table below. bcrypt hash, never plaintext, never logged.
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per OAuth provider identity linked to a user. A single user can have multiple rows
-- here (e.g. signed up with Google, later linked GitHub too) — that linking flow is NOT built
-- this sprint (Auth.js supports it; this schema doesn't block it later).
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,                    -- 'oauth' | 'email' | 'credentials'
  provider text not null,                -- 'google' | 'github' | 'email' | 'credentials'
  provider_account_id text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  created_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);
create index if not exists idx_accounts_user on accounts (user_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  expires timestamptz not null,
  -- Real device/session visibility (Phase 2's "Sessions" + "Devices" merged at the DB level —
  -- user_devices below is for the human-readable device list; this is the actual auth session).
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_sessions_user on sessions (user_id);

-- Magic-link sign-in tokens (Auth.js Email provider) AND password-reset tokens share this table
-- — both are "prove you control this email address" flows with identical security properties
-- (single-use, short-lived, identifier+token composite key). `purpose` distinguishes them so a
-- leaked magic-link token can never be replayed as a password-reset token or vice versa.
create table if not exists verification_tokens (
  identifier text not null,              -- email address
  token text not null,                   -- hashed token, never the raw value sent in the email
  purpose text not null default 'sign_in',  -- 'sign_in' | 'password_reset' | 'email_verify'
  expires timestamptz not null,
  primary key (identifier, token)
);

-- ============================================================================
-- User research data (cloud-sync targets — mirrors the existing localStorage shapes exactly,
-- so the client-side migration in Phase 10 / the sync APIs are a mechanical mapping, not a
-- redesign of what's already proven in sessionMemory.js)
-- ============================================================================

create table if not exists user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scheme_code text not null,
  fund_name text,
  amc text,
  added_at timestamptz not null default now(),
  unique (user_id, scheme_code)
);
create index if not exists idx_watchlist_user on user_watchlist (user_id);

create table if not exists user_research_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scheme_code text not null,
  fund_name text,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notes_user_fund on user_research_notes (user_id, scheme_code);

create table if not exists user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists idx_collections_user on user_collections (user_id);

create table if not exists user_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references user_collections(id) on delete cascade,
  scheme_code text not null,
  fund_name text,
  added_at timestamptz not null default now(),
  unique (collection_id, scheme_code)
);
create index if not exists idx_collection_items_collection on user_collection_items (collection_id);

-- Mirrors sessionMemory.js's mfp_recent_views — type: 'fund' | 'amc' | 'category' | 'benchmark' | 'manager'
create table if not exists user_research_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  entity_name text,
  meta jsonb,
  viewed_at timestamptz not null default now()
);
create index if not exists idx_history_user_time on user_research_history (user_id, viewed_at desc);

create table if not exists user_saved_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  amcs jsonb not null,                   -- array of AMC names, same shape as mfp_recent_compares
  created_at timestamptz not null default now()
);
create index if not exists idx_comparisons_user on user_saved_comparisons (user_id);

create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  dashboard_layout jsonb,
  theme text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  alert_type text not null,              -- see alert_rules.alert_type below
  channel text not null,                 -- 'email' | 'push' | 'in_app'
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, alert_type, channel)
);
create index if not exists idx_notification_settings_user on user_notification_settings (user_id);

create table if not exists user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_label text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_devices_user on user_devices (user_id);

-- user_id nullable on purpose: some events (failed login attempt on an unknown email) have no
-- resolvable user yet, and are still worth recording for security review.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action text not null,                  -- 'sign_in' | 'sign_out' | 'sign_up' | 'password_reset' | 'account_link' | 'account_delete' | 'sync_migrate' | ...
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_user_time on audit_log (user_id, created_at desc);
create index if not exists idx_audit_action_time on audit_log (action, created_at desc);

-- ============================================================================
-- Portfolio data model (Phase 5 — architecture, now with a real place to land; still NO
-- analytics/UI built on top this sprint, per that phase's own explicit scope)
-- ============================================================================

create table if not exists portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scheme_code text not null,
  units numeric not null,
  avg_cost numeric,
  source text not null,                  -- 'cas' | 'groww' | 'coin' | 'kuvera' | 'indmoney' | 'manual'
  folio_number text,
  imported_at timestamptz not null default now(),
  unique (user_id, scheme_code, source, folio_number)
);
create index if not exists idx_holdings_user on portfolio_holdings (user_id);

create table if not exists portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scheme_code text not null,
  transaction_type text not null,        -- 'purchase' | 'redemption' | 'switch_in' | 'switch_out' | 'dividend_payout' | 'dividend_reinvest'
  units numeric,
  nav_value numeric,
  amount numeric,
  transaction_date date not null,
  source text not null,
  folio_number text,
  created_at timestamptz not null default now()
);
create index if not exists idx_transactions_user_date on portfolio_transactions (user_id, transaction_date desc);

create table if not exists portfolio_sips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scheme_code text not null,
  amount numeric not null,
  frequency text not null,               -- 'monthly' | 'weekly' | 'quarterly'
  start_date date not null,
  next_date date,
  status text not null default 'active', -- 'active' | 'paused' | 'stopped'
  source text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sips_user on portfolio_sips (user_id);

-- Fund-level, not user-level — a NAV adjustment or scheme rename applies regardless of who
-- holds it. Populated by a future ingestion job, not by any user action.
create table if not exists portfolio_corporate_actions (
  id uuid primary key default gen_random_uuid(),
  scheme_code text not null,
  action_type text not null,             -- 'dividend' | 'split' | 'merger' | 'name_change'
  action_date date not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_corp_actions_scheme on portfolio_corporate_actions (scheme_code, action_date desc);

-- ============================================================================
-- Alert engine (Phase 6 — backend only: schema + evaluation logic. No email/push delivery
-- infrastructure exists yet; alert_deliveries.status stays 'pending' until a real delivery
-- worker with real provider credentials is built — see docs/ALERT_ENGINE.md)
-- ============================================================================

create table if not exists alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  alert_type text not null,              -- 'health_score' | 'attention_score' | 'news' | 'factsheet' | 'benchmark' | 'category' | 'amc' | 'research_queue'
  target_type text not null,             -- 'fund' | 'category' | 'amc' | 'benchmark'
  target_id text not null,
  target_name text,
  condition jsonb not null,              -- e.g. {"op":"crosses_below","value":50} or {"op":"new_item"}
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_alert_rules_user on alert_rules (user_id) where enabled;
create index if not exists idx_alert_rules_target on alert_rules (target_type, target_id) where enabled;

create table if not exists alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references alert_rules(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  channel text not null,                 -- 'email' | 'push' | 'in_app'
  status text not null default 'pending', -- 'pending' | 'sent' | 'failed'
  payload jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_deliveries_rule_time on alert_deliveries (rule_id, triggered_at desc);
create index if not exists idx_deliveries_status on alert_deliveries (status) where status = 'pending';
