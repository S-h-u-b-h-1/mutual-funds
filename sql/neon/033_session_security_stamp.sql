-- MF Pulse — Suasion Securities Auth+Onboarding truth audit, Phase 1 (session revocation).
--
-- Real gap found by direct code audit: auth.js falls back to Auth.js "jwt" session strategy
-- whenever zero non-Credentials providers are configured (a real @auth/core constraint —
-- "database" strategy is rejected outright when Credentials is the only provider; see
-- node_modules/@auth/core/lib/utils/assert.js). Under that jwt fallback, password-reset's
-- `delete from sessions where user_id = $1` and account-deletion's cascade are no-ops — no
-- `sessions` row was ever created for a jwt-strategy user, so there's nothing to delete, and the
-- signed cookie stays valid until its natural 30-day expiry regardless of a password change.
--
-- This column closes that gap without touching the already-correct "database" strategy path
-- (which keeps using real session-row deletion). A jwt callback (added in auth.js) stashes the
-- current stamp into the token at sign-in and re-checks it against the live DB value on every
-- subsequent request; a mismatch invalidates the token. Any future revocation trigger (password
-- reset, a future "sign out everywhere" action, suspected compromise) is then just:
--   update users set security_stamp = gen_random_uuid() where id = $1
--
-- Run: psql "$DATABASE_URL" -f sql/neon/033_session_security_stamp.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez). If production application is blocked by this session's own tooling (same pattern as
-- 022/024/028/029/030/031/032), apply to test only, record that honestly in
-- docs/MIGRATION_RUNBOOK.md's inventory, and leave production application for someone with direct
-- DB access.
alter table users add column if not exists security_stamp uuid not null default gen_random_uuid();

comment on column users.security_stamp is
  'Bumped (regenerated) to invalidate every JWT-strategy session for this user immediately, independent of the sessions table (which only real "database"-strategy sessions ever populate). Checked in auth.js''s jwt callback on every request.';
