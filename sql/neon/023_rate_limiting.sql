-- MF Pulse — Backend Hardening Phase 3, H4 (authentication rate limiting).
-- Backs frontend/app/lib/platform/rateLimit/core.js. Before this, login, register, and
-- forgot-password had zero rate limiting anywhere — exploitable today with a plain
-- unauthenticated script for credential stuffing, reset-email bombing, or trivial account
-- enumeration by request volume.
--
-- Fixed-window counting in Postgres, not an in-process counter: this app runs on Vercel's
-- serverless platform, where each invocation can land on a different, memory-isolated instance —
-- an in-memory limiter resets per-instance and is trivially bypassed by nothing more than the
-- load balancing that already happens. A shared, durable backing store is required for this to
-- mean anything under real horizontal scaling; Postgres is the one already in place, so no new
-- external dependency (Redis/Upstash) was added for this.
--
-- bucket_key is "<action>:<identifier>", e.g. "login-ip:203.0.113.5" or
-- "login-email:someone@example.com" — see rateLimit/core.js for the exact keys used.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/023_rate_limiting.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) — see docs/TEST_DATABASE_AND_CI.md's schema-drift note.

create table if not exists rate_limit_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (bucket_key, window_start)
);

-- Supports an eventual cleanup sweep (`delete where window_start < now() - interval '1 day'`) —
-- not scheduled anywhere yet; old rows are harmless dead weight at this scale, not a correctness
-- issue, since every rate-limit check only ever reads/writes the CURRENT window's row.
create index if not exists idx_rate_limit_buckets_window on rate_limit_buckets (window_start);
