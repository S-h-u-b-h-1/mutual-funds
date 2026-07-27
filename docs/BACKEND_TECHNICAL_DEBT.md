# Backend Technical Debt

Ranked inventory of every finding from [`BACKEND_AUDIT_REPORT.md`](BACKEND_AUDIT_REPORT.md), 2026-07-24.
Full reasoning, exploit scenarios, and evidence for each item live in that report — this doc is
the actionable ranking: what, how big, and what's already been closed.

**Effort scale**: XS (&lt;1hr) · S (1-3hrs) · M (half day-1 day) · L (2-3 days) · XL (needs a new
primitive or design decision before work can start).

**Status legend**: 🔴 open · 🟡 in progress · ✅ fixed this phase (commit noted).

---

## Critical — fix before this can be called a Release Candidate

| # | Item | Location | Effort | Status |
|---|---|---|---|---|
| C1 | `orderService.transition()` unconditional UPDATE — no compare-and-swap anywhere in the order lifecycle; double-click or concurrent poll can double-charge/double-place an order and double-credit a portfolio | `frontend/app/lib/invest/orderService.js` (`transition`, `submitOrder`) | L | 🟡 written, not yet merged |
| C2 | Redemption/switch eligibility check is a pure TOCTOU race with zero DB backstop — two concurrent requests on the same folio can both pass the balance check | `frontend/app/lib/invest/redemptionService.js`, `switchService.js` | L | ✅ fixed |
| C3 | Zero server-side logging or error tracking anywhere in the API/service request path — a failed order today leaves no trace anywhere | every `app/api/v1/invest/**/route.js`, all invest services | M | ✅ fixed |
| C4 | CI never runs the 69-file test suite or lint; Vercel deploys independently of CI's result either way | `.github/workflows/ci.yml` | S | ✅ fixed |
| C5 | Compliance-gate does 11 sequential DB round trips on every order/redemption/switch/SIP-creating action, unconditionally | `frontend/app/lib/invest/complianceService.js` (`ensureApplication`, `getApplication`) | S | ✅ fixed |

**C4 resolution (2026-07-27)**: landed *after* test/production DB isolation (`docs/TEST_DATABASE_AND_CI.md`)
and the H11 root-cause drain fix, per this table's own original sequencing note — the 70-file suite
was proven deterministic (2 consecutive full runs, 0 failures) before being wired as a merge gate,
so it enforces real regressions rather than the flaky pattern that predated isolation. `ci.yml` now
has a `frontend-tests` job (lint + full suite against the isolated Neon `test` branch). One manual
step remains: the `TEST_DATABASE_URL` GitHub Actions secret has not been created (tooling in this
session couldn't create repo secrets) — until it is, that job fails fast at an explicit guard step
rather than running against an empty database. Separately, verified (not assumed) that Vercel
production deploys do **not** wait on CI either way — see `TEST_DATABASE_AND_CI.md`'s "Deploy
gating" section for the two commits that prove it and the ready-to-activate `Ignored Build Step`
script that closes that gap once someone with dashboard access wires it in.

**C2 resolution (2026-07-27)**: `withTransaction()` + a per-(user, folio) `pg_advisory_xact_lock`
in both `createRedemptionOrder` and `createSwitchOrder` (same lock key namespace for both, so a
redemption and a switch racing the same folio also serialize against each other). No migration —
pure runtime primitive. Verified with three real `Promise.allSettled` concurrency tests, which
also surfaced and fixed a genuine pre-existing bug: `getRedemptionEligibility`'s pending-units
query never counted `switch_out` orders, so a switch could silently over-commit a folio's units
even without any concurrency involved. Merged to `main` directly (`10c69bf`).

**C3 resolution (2026-07-27)**: `withObservability()` wraps all 39 `app/api/v1/invest/**/route.js`
handlers — structured JSON request logs (route/method/status/duration/correlationId/userId) to
stdout, captured by Vercel automatically with no external service; a safety net that logs+returns
a generic 500 for any exception a route's own try/catch didn't already handle (routes with their
own error handling are unaffected); optional Sentry forwarding, inert until `SENTRY_DSN` is ever
set (it isn't anywhere today — see `OBSERVABILITY_RUNBOOK.md`). Verified against a live dev
server, not just build+lint: real correlation ID on the response header, matching structured log
line written server-side. Merged to `main` directly (`3dce7f7`) — no migration needed.

**C1 status (2026-07-27)**: implemented and passing (19 tests incl. 3 real concurrency tests
against the isolated test branch) on branch `hardening/c1-order-idempotency`, **not yet merged to
`main`**. `createOrder`/`createSipMandate` gained the same `withTransaction`-based advisory-lock
dedupe C2 uses (an optional caller-supplied `idempotencyKey` plus a backend-native backstop for
callers that never send one); `submitOrder`/`retryOrder` gained an atomic pre-provider-call claim
(`submission_claimed_at`, a 30s soft lease); `order.id` now reaches both provider calls as an
idempotency key. Blocked on `sql/neon/022_order_idempotency.sql` (two new nullable columns, one
partial unique index) — applying it to the **test** branch succeeded, but applying it to
**production** was denied by this session's tooling (the same class of block that stopped the
`TEST_DATABASE_URL` secret). Pushing the code to `main` before that migration is live in
production would break every order create/submit call (missing columns) the moment Vercel
deployed it, so it's parked on its own branch rather than merged. Someone with production DB
access needs to run that migration file against production; the branch can be merged the moment
that's confirmed done.

---

## High — fix before real-money launch

| # | Item | Location | Effort | Status |
|---|---|---|---|---|
| H1 | No idempotency key passed to the payment provider (`submitOrder`'s purchase leg, `createSipMandate`); SIP mandate creation has no draft/pending gate at all | `orderService.js` (`submitOrder`, `createSipMandate`) | M | 🔴 |
| H2 | Job platform `completeJob`/`failJob` lack worker-ownership fencing — combined with lease-reclaim, permits real handler double-execution | `frontend/app/lib/platform/jobs/core.js` | S | ✅ fixed |
| H3 | `deliverNotification()` has no "already delivered" guard — a lease timeout can cause a real duplicate send once a real channel adapter exists | `frontend/app/lib/platform/notifications/core.js` | XS | ✅ fixed |
<!-- H3 fully closed 2026-07-27, see resolution note after the High table below — the 2026-07-24 fix only caught status='delivered'; a status='processing' row from a crash-mid-send was still unguarded. -->
| H4 | No rate limiting anywhere — login, register, and forgot-password are exploitable today with a plain unauthenticated script | `lib/auth.js`, `api/auth/*` | M (auth endpoints only) / L (app-wide) | ✅ fixed |
| H5 | `investment_orders.placed_by_user_id` has no `ON DELETE` behavior — will hard-fail account deletion once advisor-assisted ordering ships | `sql/neon/028_placed_by_user_fk_fix.sql` | XS | 🟡 written, denied by tooling on both branches — see `MIGRATION_RUNBOOK.md` |
| H6 | `bank_accounts`/`documents`/order history fully hard-cascade-delete on user deletion, via a live (if UI-unwired) `DELETE /api/v1/account` — incompatible with brokerage record-retention obligations given the real, registered distributor ARN/EUIN | schema design decision + migration | L | 🟡 written, blocked on migration |
| H7 | `identityService.ensureAccount`/`portfolioService.connectMockPortfolio` call sites sit behind routes with **no** try/catch at all | `api/v1/invest/account/route.js`, `api/v1/invest/portfolio/connect/route.js` | XS | ✅ fixed |
| H8 | `jobs-worker.yml` (the Invest platform's execution engine) has no failure alerting and is excluded from the one health dashboard | `.github/workflows/jobs-worker.yml`, `lib/pipelineHealth.js` | S | 🔴 |
| H9 | ~~Ad hoc migration process, no tracking table; already caused one real production incident (005/006); 15 newer migrations (007-021, the entire Invest backend) have zero regression-test coverage~~ **✅ fixed (process + tracking)** — see resolution note below. Extending `test_migrations.py`'s per-table schema-contract pattern to migrations 007-021 is explicitly NOT done by this fix (real effort, flagged as a follow-up in `MIGRATION_RUNBOOK.md`). | `sql/neon/*`, `tests/test_migrations.py` | M (extend existing test pattern) | 🟡 process fixed, test coverage extension still open |
| H10 | No validation anywhere for negative/zero `amount`/`units` in order/redemption/switch creation — a real product-correctness gap, not just a test gap | `orderService.js`, `redemptionService.js`, `switchService.js` | S | ✅ fixed |
| H11 | Jobs-table test noise: 5 test files enqueue an undrained `event-dispatch` job via `makeInvestmentReadyUser`; 2 files (`webhookPlatform.test.js`, `notifications/core.test.js`) claim without filtering to "mine," causing the specific flakiness re-diagnosed multiple times this session | `app/lib/platform/webhooks/webhookPlatform.test.js`, `app/lib/platform/notifications/core.test.js` | S | ✅ fixed |
| H12 | None of the 5 invest providers (KYC/Document/Investment/Payment/Portfolio) had timeout, retry, or circuit-breaker protection on any call — a hung mock call hangs the whole request until Vercel's own function timeout, and a struggling provider gets hammered by every concurrent request | `frontend/app/lib/invest/providers/*`, `identityService.js`, `complianceService.js`, `orderService.js`, `documentService.js`, `portfolioService.js` | M | ✅ fixed |

**H4 resolution (2026-07-27)**: Postgres-backed fixed-window rate limiting
(`app/lib/platform/rateLimit/core.js`, `sql/neon/023_rate_limiting.sql`) — deliberately not an
in-process counter, since this app runs on Vercel's serverless platform where an in-memory limiter
resets per-instance and is trivially bypassed. Login gets both IP- and email-scoped limits
(stops single-attacker credential stuffing AND distributed attacks on one victim); register gets
IP-scoped; forgot-password gets both IP- and email-scoped (the email-scoped check is keyed on the
raw submitted address regardless of account existence, so it doesn't reopen the enumeration gap
that route already avoids); reset-password gets IP-scoped. Verified with a real concurrency test
(20 concurrent requests against one fresh bucket, cross-checked against the persisted row count)
and a live end-to-end smoke test against a real dev server. Migration applied to both the test
branch and production; merged to `main` directly (`bd9f619`).

**H12 resolution (2026-07-27)**: `app/lib/invest/providers/resilience.js`'s `callProvider()` wraps
every provider call site with an 8s timeout and that provider's own circuit breaker — reusing the
Retry Framework and Circuit Breaker Framework built earlier this session (Phase 4.5), not a new
implementation. Retry is opt-in per call and defaults to off — "do not blindly retry non-idempotent
operations" — only turned on for genuinely idempotent/read-style calls (KYC status checks, document
fetch, portfolio sync, order cancellation); every money-moving write (payment, order placement,
mandate registration, payout) gets timeout + circuit breaker only. At the three call sites with an
existing decline branch, a classified timeout/circuit-open failure now resolves cleanly to that same
'failed' path (tagged `PROVIDER_UNAVAILABLE`) instead of throwing a raw 500; a genuine unexpected
exception still propagates so a real bug can't hide behind a normal-looking decline. Verified with
11 unit tests (including circuit-breaker tripping — fn confirmed NOT called once open — and
per-provider breaker independence) plus the full 106-test real-integration suite across every
touched service file, zero regressions. No migration — the breaker is deliberately in-memory per
its own documented design. Merged to `main` directly (`f1551cf`).

**H3 fully closed (2026-07-27)**: the 2026-07-24 fix only guarded `status === 'delivered'` — it
missed a narrower, more realistic window where a worker calls `provider.send()` (the real
user-visible side effect) and crashes before writing `'delivered'`, leaving the row stuck at
`status === 'processing'`. A second worker picking up the job after lease-reclaim would previously
re-run from the top and send a real duplicate. `deliverNotification()` now treats a `'processing'`
row it encounters on entry as ambiguous (the prior attempt might already have reached the
provider) and dead-letters it instead of retrying — sends are not naturally idempotent, so this
prefers under-delivery over risking a duplicate. Verified with 3 new tests against the real job
platform (`runWorkerTick`, not just a direct call), asserting against a real send-call counter on
the test channel, not just the DB status field. Merged to `main` directly (`cde778e`).

**M10 resolution (2026-07-28)**: `app/lib/internalAuth.js` extracts the timing-safe shared-secret
check `alerts/run` already used (`crypto.timingSafeEqual`) into a single reusable
`checkInternalSecret(request, envVarName)`. All 5 status routes (events/jobs/providers/
reconciliation/webhooks) now call it against a new `INTERNAL_STATUS_SECRET` env var before doing
any work; `alerts/run` was refactored to call the same helper against its existing
`ALERTS_INTERNAL_SECRET`, rather than leaving two copies of the same crypto logic. Fails closed:
returns 503 if the env var isn't set at all (not silently open), 401 on a missing/wrong header.
Catch blocks across all 5 routes now log the real error server-side via C3's `logError()` and
return a generic message instead of interpolating `err.message` into the response. Verified with
5 unit tests plus a live dev-server smoke test (no header → 401, wrong secret → 401, correct
secret → 200). No migration — pure application code. Merged to `main` directly (`a6a7d45`).
**Operator action needed**: `INTERNAL_STATUS_SECRET` must be set in production (Vercel) for these
5 endpoints to function; until then they correctly return 503 rather than opening up.

**H9 resolution (2026-07-28)**: full account and current per-branch inventory in the new
`docs/MIGRATION_RUNBOOK.md`. `sql/neon/025_migration_ledger.sql` adds `schema_migrations` — a
branch-local, database-native record of which migrations have actually run, with a checksum so
`scripts/apply_migrations.py --verify` can detect a migration file that changed on disk after it
was applied (the exact class of drift 005/006 exemplified). The script also replaces "someone runs
`psql -f` by hand, nothing records it" with `--status`/`--apply`/`--verify`/`--backfill` against
whichever branch `DATABASE_URL` points at. Applied to and backfilled on both branches for real:
production and `test` both now have an accurate, empirically-verified (not assumed) ledger.
Process-only, additive, applied directly (no PR needed for the tracking table itself) — `025` is
`create table if not exists`, succeeded against production immediately. Also wired
`tests/test_migrations.py` (the schema-regression suite the 005/006 incident itself produced) into
CI for the first time — `backend-tests` previously ran with no `DATABASE_URL` at all, so that
suite's own skip guard silently no-op'd on every run; it's now pointed at the same
`TEST_DATABASE_URL` secret `frontend-tests` uses (still not created as a repo secret — same
pre-existing gap flagged for C4 — so it continues to skip until that secret exists, but will start
running for free the moment it does). **Not done**: extending per-table schema-contract tests
(`test_migrations.py`'s own pattern) to the 19 migrations since 006 — real effort, correctly out
of scope for this pass, flagged as the natural next step in the runbook. One real mistake happened
during this work and is documented, not hidden: a smoke test of `--apply` unintentionally applied
`008_persistent_portfolio.sql` to the `test` branch (it was legitimately pending at the same time
as a scratch file being tested) — confirmed harmless (additive, reviewed, zero code references
yet) and left in place by explicit choice rather than reverted; see the runbook's inventory and
M20's updated row for the full story.

**M6/M7/L5/H5 status (2026-07-28, written, `test`-verified, NOT applied to production)**:
`sql/neon/026_index_cleanup.sql` (M6 + M7), `027_drop_dead_tables.sql` (L5), and
`028_placed_by_user_fk_fix.sql` (H5) are all merged to `main` — pure SQL, no application code
depends on any of them, so merging the files themselves carries no risk. All three were applied to
the `test` branch first: 026 and 027 succeeded and are verified live there (confirmed via
`scripts/apply_migrations.py --status`); 028 was denied by this session's tooling on `test` too.
Attempting 026 and 027 against production was then also denied, a broader block than earlier in
this session (which allowed `create table` for brand-new objects against production). Per the
tooling's own explicit instruction on denial (stop and surface it, don't retry or route around
it), none of the three were forced. Full detail, including exactly which catalog queries proved
M6's redundant indexes and L5's dead tables, is in `docs/MIGRATION_RUNBOOK.md`'s inventory. All
three are safe, reviewed, and ready — they just need a human with direct database access to run
`psql "$DATABASE_URL" -f sql/neon/0NN_*.sql` against production (and, for 028, against `test` too).

**H6 status (2026-07-27, written and tested, NOT merged)**: `DELETE /api/v1/account` no longer
hard-deletes the `users` row (which cascaded through ~35 tables, wiping every financial/compliance
record). It now anonymizes identifying fields in place (`app/lib/accountLifecycle.js`) — the row
never disappears, so none of those cascades ever fire; every order, mandate, compliance decision,
document, and audit entry survives fully intact. A new, separate, fully reversible
`deactivateAccount()`/`reactivateAccount()` pair (blocks/restores login, deletes-then-implicitly-
requires-relogin for sessions) now exists for "log me out everywhere" as distinct from "destroy my
history." No regulatory retention *period* is invented anywhere — the default is retain-
indefinitely-anonymized, with explicit open policy questions flagged in the new
`docs/ACCOUNT_LIFECYCLE_AND_RETENTION.md` for legal/compliance to actually answer. Verified with 7
tests including one that creates a full real compliance/order history via `makeInvestmentReadyUser()`,
deletes the account, and asserts the exact same record counts survive. **Blocked on
`sql/neon/024_account_lifecycle.sql`** (two nullable columns on `users`, one new audit table) being
denied against production by this session's tooling — same pattern as C1. Parked on
`hardening/h6-account-lifecycle` rather than merged, since the code requires these columns to exist
in production (login and account deletion would otherwise break the moment it deployed).

---

## Medium — real, worth doing, not urgent

| # | Item | Location | Effort |
|---|---|---|---|
| M1 | `reverseOrder()` fully implemented, zero callers anywhere — wire a route or explicitly document deferral | `orderService.js` | XS |
| M2 | `plan`/`option` snapshot silently null for redemption/switch orders (populated for purchase/SIP) | `redemptionService.js`, `switchService.js` | S |
| M3 | Duplicated exit-load/net-amount math between redemption and switch | same two files | S |
| M4 | Two parallel, non-integrated notification-preference systems (`user_notification_settings` vs `notification_preferences`) — both live | product decision + consolidation | L |
| M5 | No CHECK constraints on any enum-shaped column added from migration 010 onward (`order_type`, `status` columns, `mandate_status`, etc.) | new migration | M |
| M6 | ~~7 duplicate/redundant indexes across 6 tables~~ **🟡 written, `test`-verified, blocked on production** — `sql/neon/026_index_cleanup.sql`. All 7 found by a catalog query (pg_index prefix/predicate match, not the eyeballing the original audit implies), confirmed none unique, confirmed zero code references by name. Applied cleanly to `test`; denied against production by this session's tooling. | `sql/neon/026_index_cleanup.sql` | XS |
| M7 | ~~Missing indexes: `investment_orders.scheme_code`, `portfolio_transactions.scheme_code`, `(user_id, created_at)` on orders/mandates~~ **🟡 written, `test`-verified, blocked on production** — same file as M6. Confirmed against the real query shapes in `redemptionService.js`/`orderService.js`; `EXPLAIN ANALYZE` against production today shows plain Seq Scans regardless (near-zero row counts), so this is structural insurance, not a currently-measurable speedup — see the migration's own header. | `sql/neon/026_index_cleanup.sql` | S |
| M8 | `listOrders`/`listSipMandates` have no `LIMIT`; `getPortfolioTimeline` fetches unbounded then slices in JS instead of a real SQL `LIMIT`/`OFFSET` | `orderService.js`, `portfolioService.js` | S |
| M9 | Reconciliation `holdings-vs-provider` comparator has a genuine N+1 over users; sibling comparators already use the correct JOIN pattern | `lib/platform/reconciliation/comparators/holdingsVsProvider.js` | S |
| M10 | ~~5 `/api/internal/*/status` endpoints unauthenticated — reuse the existing shared-secret pattern from `alerts/run`~~ **✅ fixed** — all 5 gated behind a new shared `checkInternalSecret()` helper (`INTERNAL_STATUS_SECRET`); `alerts/run` itself refactored onto the same helper; error responses no longer leak `err.message`. | 5 route files | S |
| M11 | Generic `catch(e) → e.message` error handlers can leak raw exceptions (DB errors, etc.) — concretely demonstrated via a malformed SIP date | 17+ route files | S-M (systematic sweep) |
| M12 | No consolidated Invest-platform health view; no Notifications metrics endpoint at all | new `/internal/*` page + `getNotificationMetrics()` | M |
| M13 | ~~Correlation IDs fragment per-hop; `emitEvent()` → `enqueueJob()` drops `correlationId` entirely (concrete one-line bug)~~ **The one-line bug is ✅ fixed** — `event-dispatch` jobs now carry the originating event's `correlationId`. Broader per-hop fragmentation (order → event → job → notification each minting its own ID) is unchanged, real, and still open. | `lib/platform/events/core.js` | ~~XS (the bug)~~ done / M (full propagation, open) |
| M14 | No `frontend/.env.local.example`; fail-fast validation covers only `DATABASE_URL`, only in the cron worker, never the live app | `lib/platform/config/core.js`, new `instrumentation.ts` | S |
| M15 | No rehearsed DR restore drill (Neon PITR exists as the mechanism, no runbook, self-tracked already) | ops exercise + doc | M |
| M16 | ~~`identityService.ensureAccount()` race throws instead of gracefully degrading, contradicting its own idempotency claim~~ **✅ fixed** — losing concurrent call's `23505` is now caught and returns the winner's row, matching `receiveWebhook()`'s existing pattern; covered by a new real-concurrency test. | `identityService.js` | XS |
| M17 | `Document`/`Portfolio` provider calls sit mid-`transition()`/mid-flow with no compensating logic if they fail after an order is already marked completed | `orderService.js`, `portfolioService.js` | M |
| M18 | `Math.random` mock-leak risk in 3 test files (no file-level `afterEach(vi.restoreAllMocks)`) | `documentService.test.js`, `portfolioService.test.js`, `mockProviders.test.js` | XS |
| M19 | Only 2 of 5 providers use standardized `PROVIDER_ERROR_CODES`; KYC has real failures with no code to map to | `providers/types.js`, `MockKYCProvider.js` | S |
| M20 | Migration 008 (Persistent Portfolio) designed, reviewed, additive-only, but not yet applied to production — associated with the still-open Persistent Portfolio Mission (Phase 2 domain model done, Phase 3+ not yet built), correctly not "dead" so much as not yet needed. **Now applied to the `test` branch** (2026-07-28, during H9's tooling verification — see `MIGRATION_RUNBOOK.md`'s inventory for the full story), still deliberately not applied to production — that's a product-scope call (resume the mission, or formally retire 008), not a hardening-pass decision. | `sql/neon/008_persistent_portfolio.sql` | XS (decision: apply to prod, or formally retire) |

---

## Low — hygiene, cheap wins, deliberate tradeoffs worth documenting

| # | Item | Location | Effort |
|---|---|---|---|
| L1 | `platform/` imports from `invest/` in 7 places (mostly a misplaced `mockRef` helper) despite claiming to be domain-agnostic | `invest/providers/mock/ids.js` → relocate | XS |
| L2 | "Notifications" has no single owning module — read/manage routes skip `lib/invest/*Service.js` entirely, unlike every other capability | route layer | M |
| L3 | Stale doc comment in `notifications.js` claiming false things about pre-M5 call sites | `notifications.js` | XS |
| L4 | 5 near-identical mock notification-channel provider files — collapse to one factory | `platform/notifications/channels/mock/*.js` | S |
| L5 | ~~2 fully dead tables (`investor_profile` singular, `portfolio_sips`), 0 rows, 0 code references~~ **🟡 written, `test`-verified, blocked on production** — `sql/neon/027_drop_dead_tables.sql`. Re-confirmed immediately before writing the file: 0 rows, 0 code references, 0 incoming FKs (queried `pg_constraint`). Applied cleanly to `test`; denied against production by this session's tooling. | `sql/neon/027_drop_dead_tables.sql` | XS |
| L6 | Account enumeration on `/api/auth/register` (inconsistent with the deliberate anti-enumeration design on `forgot-password`) | `api/auth/register/route.js` | S |
| L7 | `trustHost: true` with no Host-header hardening (not practically reachable on Vercel; the codebase already has the right pattern one file over) | `lib/auth.js` | S |
| L8 | No security headers configured (CSP, HSTS, X-Frame-Options, etc.) | `next.config.mjs` | S |
| L9 | One `GET` route with a real side effect (order-timeline fetch can advance status) — CSRF-adjacent code smell, negligible practical impact | `orders/[orderId]/route.js` | S |
| L10 | Root-level `Dockerfile` packages the Python pipeline, referenced by zero CI/CD path, minor hygiene issues if ever revived | `Dockerfile` | XS (or delete) |
| L11 | No timeout/rate-limit contract documented on the provider base-class interfaces (correctly low priority — no real provider exists yet) | `providers/types.js` | XS (doc only) |
| L12 | Stale test-infrastructure documentation: `testClaimLock.js`/`vitest.config.js` still describe a 3-file lock group and "38-file suite" against the real 4 files / ~69 | test infra comments | XS |
| L13 | `webhookPlatform.test.js` cleanup uses a 30-minute wall-clock window instead of the run-scoped ID the rest of the file uses | same file | XS |
| — | Manual-only rollback (no automation) | *(accepted tradeoff — documented, not tracked as debt)* | — |

---

## Summary

- **5 Critical, 12 High, 20 Medium, 13 Low** (plus 1 explicitly accepted tradeoff) — H12 (provider
  resilience) added 2026-07-27, called out explicitly in the RC hardening directive but not
  originally broken out as its own High item.
- Current status (2026-07-28): Critical **4/5 fixed and live** (C2, C3, C4, C5). C1 is written,
  tested, and verified but **not yet merged** — blocked on a production migration this session's
  tooling can't apply (see C1's own status note above). High **8/12 fixed and live** (H2, H3, H4,
  H7, H9 process, H10, H11, H12); H5, H6 are written and verified on `test` but not applied to
  production (see their own status notes) — H1/H8 still open, H9's own test-coverage-extension
  half is explicitly still open too (see H9's row). Medium: M6, M7, M10, M13 (partial), and M16
  fixed (M6/M7 on `test` only, blocked on production — see their rows); the rest are open but
  genuinely non-urgent (see table). Low: L5 written and `test`-verified, blocked on production.
- **Migration process itself is now tracked, not ad hoc** — see `docs/MIGRATION_RUNBOOK.md` (new,
  H9). Every migration through 028 is now recorded in a real `schema_migrations` ledger on the
  `test` branch (026/027 fully, 028 denied even there), and through 025 on production, empirically
  verified against live schema rather than assumed.
- **Five items are now parked, blocked on production/tooling DB access**: `hardening/
  c1-order-idempotency` (022), `hardening/h6-account-lifecycle` (024) on their own branches, plus
  `026_index_cleanup.sql`, `027_drop_dead_tables.sql`, and `028_placed_by_user_fk_fix.sql` — all
  three already merged to `main` as pure SQL files, verified safe and (for 026/027) proven working
  against `test`, but not yet run against production. **The blocking pattern widened over the
  course of this session**: early on, `create table` succeeded against production for brand-new
  objects while only `alter table` on live central tables was denied; by 026-028, `drop index`/
  `create index`/`drop table` were denied against production too, and 028's `alter table` was
  denied even against `test` — see `MIGRATION_RUNBOOK.md`'s inventory for the full, current
  picture. All five need a human with direct database access to run one file each; this is now the
  single largest concrete blocker to a READY (vs CONDITIONALLY READY) release verdict.
- Total XS/S items (cheap, low-risk, shippable immediately): **~24** — the bulk of Medium/Low.
- Items needing a genuine design decision before work starts (XL-adjacent): H6 (retention vs.
  deletion policy), M4 (which notification-preference system wins), C1/C2 (need a real
  `withTransaction()` primitive in `db.js` that doesn't exist today).
- See [`BACKEND_RELEASE_CANDIDATE.md`](BACKEND_RELEASE_CANDIDATE.md) for which of these block
  launch versus which are accepted, tracked risk.
