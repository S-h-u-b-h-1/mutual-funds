-- MF Pulse — governed wealth-advisory profile changes.
--
-- A completed research profile drives risk-aware fund comparisons. It must not be silently
-- overwritten by a later browser interaction. The application accepts the first completed
-- profile once, then records proposed replacements here. Only an authenticated advisor/admin
-- review endpoint may atomically apply a pending request to research_profile.

alter table research_profile add column if not exists advisory_answers jsonb;
alter table research_profile add column if not exists risk_score integer check (risk_score between 0 and 100);
alter table research_profile add column if not exists risk_profile text check (risk_profile in ('conservative', 'balanced', 'growth'));
alter table research_profile add column if not exists locked_at timestamptz;

-- Existing completed profiles become governed immediately; new rows set locked_at on insert.
update research_profile set locked_at = coalesce(locked_at, updated_at, now());

create table if not exists profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  current_profile jsonb not null,
  requested_profile jsonb not null,
  reason text not null check (char_length(reason) between 20 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references users(id) on delete set null,
  review_note text
);

create unique index if not exists ux_profile_change_requests_one_pending
  on profile_change_requests (user_id) where status = 'pending';
create index if not exists idx_profile_change_requests_review_queue
  on profile_change_requests (status, requested_at);
