-- MF Pulse — Backend Hardening Phase 3, C1 (order idempotency and compare-and-swap).
-- Backs frontend/app/lib/invest/orderService.js. See docs/BACKEND_TECHNICAL_DEBT.md C1/H1 and
-- docs/BACKEND_AUDIT_REPORT.md for the exploit scenario this closes: orderService.transition()
-- and submitOrder() had no compare-and-swap or claim mechanism anywhere, so a double-click submit,
-- two browser tabs, or a client retry after a timed-out request could place the same order twice
-- or run a completed-order's settlement side effects (reconciliation, document generation, payout)
-- more than once.
--
-- Two new columns, both nullable, both purely internal (never surfaced as a new order "status" —
-- the existing status enum is unchanged):
--
-- 1. idempotency_key — an OPTIONAL caller-supplied token (e.g. a client-generated UUID per
--    logical submit attempt) that createOrder()/createSipMandate() dedupe on when present. A
--    partial unique index enforces it; a duplicate create with the same (user_id, idempotency_key)
--    returns the ORIGINAL row instead of inserting a second one. Ready for the frontend to adopt;
--    does nothing if never sent (backward compatible).
-- 2. submission_claimed_at — an internal claim marker for submitOrder()/retryOrder(), analogous to
--    the job platform's locked_by/leased_until fencing (sql/neon/012_job_platform.sql, H2's fix)
--    applied to a single order row instead of a job queue. Set atomically as the FIRST statement
--    of a submission attempt, before any provider is contacted; a concurrent/retried second call
--    reads 0 rows back from that UPDATE and bails out instead of racing to place a second
--    payment/order. Treated as stale (reclaimable) after 30s so a genuinely crashed attempt
--    self-heals on the next retry without needing a background sweep — see orderService.js's
--    submitOrder() for the exact window and the tradeoff it documents.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/022_order_idempotency.sql (or the Neon MCP
-- run_sql_transaction workaround per docs/MIGRATION_RUNBOOK.md if the auto-classifier declines
-- the DDL, as it has for every migration since 022).

alter table investment_orders add column if not exists idempotency_key text;
alter table investment_orders add column if not exists submission_claimed_at timestamptz;
create unique index if not exists investment_orders_user_idempotency_key_uq
  on investment_orders (user_id, idempotency_key) where idempotency_key is not null;

alter table sip_mandates add column if not exists idempotency_key text;
create unique index if not exists sip_mandates_user_idempotency_key_uq
  on sip_mandates (user_id, idempotency_key) where idempotency_key is not null;
