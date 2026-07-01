-- Phase 9 (complete-workflows sprint) — backend-ready models for the future auth system.
-- NOT user-facing: no UI reads or writes these tables yet. Login itself is explicitly out of
-- scope for this sprint. Every table references auth.users (Supabase's built-in identity
-- table, already present even with zero signups) so no competing user-identity system is
-- invented. RLS is owner-only from day one (auth.uid() = user_id) — since no real session can
-- authenticate yet, these tables are functionally inert until login ships, by construction.
-- Applied live via Supabase MCP apply_migration; tracked here for version control.

-- profiles: one row per authenticated user, created on first sign-in (not yet wired).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  investor_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own_profile_select" on profiles for select using (auth.uid() = id);
create policy "own_profile_update" on profiles for update using (auth.uid() = id);
create policy "own_profile_insert" on profiles for insert with check (auth.uid() = id);

-- workspaces: a named collection a user organises research into (e.g. "Retirement portfolio").
create table if not exists workspaces (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table workspaces enable row level security;
create policy "own_workspaces" on workspaces for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists ix_workspaces_user on workspaces (user_id);

-- saved_research: a fund/AMC/category a user bookmarked, with an optional personal note.
create table if not exists saved_research (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id bigint references workspaces(id) on delete set null,
  entity_type text not null check (entity_type in ('fund', 'amc', 'category', 'benchmark', 'manager')),
  entity_id text not null,
  note text,
  created_at timestamptz not null default now()
);
alter table saved_research enable row level security;
create policy "own_saved_research" on saved_research for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists ix_saved_research_user on saved_research (user_id);
create unique index if not exists ux_saved_research_dedup on saved_research (user_id, entity_type, entity_id);

-- saved_comparisons: DB-backed version of the localStorage compare workspaces
-- (CompareClient.jsx mfp_compare_ws) for a logged-in user, so comparisons persist cross-device.
create table if not exists saved_comparisons (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amc_names text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table saved_comparisons enable row level security;
create policy "own_saved_comparisons" on saved_comparisons for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists ix_saved_comparisons_user on saved_comparisons (user_id);

-- watchlist_items: DB-backed version of the localStorage watchlist (WatchButton.jsx mfp_watchlist)
-- for a logged-in user. The anonymous localStorage watchlist keeps working regardless — this is
-- additive, not a replacement, until a migration path (merge-on-login) is built.
create table if not exists watchlist_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheme_code text not null,
  added_at timestamptz not null default now()
);
alter table watchlist_items enable row level security;
create policy "own_watchlist_items" on watchlist_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create unique index if not exists ux_watchlist_items_dedup on watchlist_items (user_id, scheme_code);

-- notifications: in-app notifications for a logged-in user (distinct from the existing anonymous
-- email-only `alerts` table) — e.g. "a fund on your watchlist entered the top decile."
create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table notifications enable row level security;
create policy "own_notifications_select" on notifications for select using (auth.uid() = user_id);
create policy "own_notifications_update" on notifications for update using (auth.uid() = user_id);
create index if not exists ix_notifications_user_unread on notifications (user_id, read_at) where read_at is null;

-- behaviour model: user_events already exists and is append-only/anonymous (session_id keyed).
-- Prepare it for auth by adding an optional user_id — nullable so every existing/anonymous
-- event keeps working unchanged; only filled in for events fired by a signed-in session once
-- login exists. No backfill, no retroactive identification of anonymous history.
alter table if exists user_events add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists ix_events_user on user_events (user_id) where user_id is not null;
