-- MF Pulse — Backend Hardening Phase 3, H6 (account deletion / record retention).
-- Backs frontend/app/lib/accountLifecycle.js and docs/ACCOUNT_LIFECYCLE_AND_RETENTION.md, which
-- has the full design rationale, the regulatory tension this resolves, and the open policy
-- questions explicitly flagged for legal/compliance confirmation rather than invented here.
--
-- Before this: DELETE /api/v1/account ran a single `delete from users where id = $1`, relying
-- entirely on `on delete cascade` to wipe every user-owned row across ~35 tables — bank accounts,
-- KYC documents, completed orders, compliance decisions, the audit trail itself — with no
-- separation between "log me out everywhere" and "destroy my regulated financial history," and no
-- retention layer at all. Unacceptable to leave ambiguous for a platform operating under a real,
-- registered AMFI distributor ARN (289322).
--
-- The fix is deliberately schema-light: two nullable timestamp columns on `users`, plus one new
-- audit table. It does NOT touch any of the ~35 existing `on delete cascade` tables — the design
-- (see the doc) never hard-deletes a `users` row at all, so none of those cascades ever fire.
-- Financial/compliance/document/audit data is preserved by construction, not by a per-table
-- judgment call this migration would otherwise have to make about which of ~35 tables count as
-- "regulated." Deletion instead anonymizes the identifying fields on `users` and
-- `investor_profiles` in place (frontend/app/lib/accountLifecycle.js), leaving every other row
-- intact and still correctly attributed to that now-anonymized identity.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/024_account_lifecycle.sql

-- deactivated_at: reversible. Set by deactivateAccount(), cleared by reactivateAccount(). Blocks
-- login (see app/lib/auth.js's authorize()) but touches nothing else — no anonymization, no data
-- loss, no audit-table entries anywhere else.
alter table users add column if not exists deactivated_at timestamptz;
-- deleted_at: NOT reversible. Set once by requestAccountDeletion() at the same moment the
-- anonymizing UPDATE runs. Presence of this column (rather than inferring "deleted" from
-- name='[deleted]' or similar) gives every other query a single, unambiguous, indexable signal.
alter table users add column if not exists deleted_at timestamptz;

create table if not exists account_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event text not null, -- 'deactivated' | 'reactivated' | 'deletion_requested_and_anonymized'
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_account_lifecycle_events_user on account_lifecycle_events (user_id, created_at);
