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
| C1 | `orderService.transition()` unconditional UPDATE — no compare-and-swap anywhere in the order lifecycle; double-click or concurrent poll can double-charge/double-place an order and double-credit a portfolio | `frontend/app/lib/invest/orderService.js` (`transition`, `submitOrder`) | L | 🔴 |
| C2 | Redemption/switch eligibility check is a pure TOCTOU race with zero DB backstop — two concurrent requests on the same folio can both pass the balance check | `frontend/app/lib/invest/redemptionService.js`, `switchService.js` | L | 🔴 |
| C3 | Zero server-side logging or error tracking anywhere in the API/service request path — a failed order today leaves no trace anywhere | every `app/api/v1/invest/**/route.js`, all invest services | M | 🔴 |
| C4 | CI never runs the 69-file test suite or lint; Vercel deploys independently of CI's result either way | `.github/workflows/ci.yml` | S | 🔴 |
| C5 | Compliance-gate does 11 sequential DB round trips on every order/redemption/switch/SIP-creating action, unconditionally | `frontend/app/lib/invest/complianceService.js` (`ensureApplication`, `getApplication`) | S | 🔴 |

**Sequencing note**: C4 should land *after* T1 (jobs-table test noise) below, or the newly-enforced
CI gate will immediately start failing on a known, already-diagnosed flaky-test pattern rather than
real regressions — that would train the team to distrust exactly the signal C4 is meant to add.

---

## High — fix before real-money launch

| # | Item | Location | Effort | Status |
|---|---|---|---|---|
| H1 | No idempotency key passed to the payment provider (`submitOrder`'s purchase leg, `createSipMandate`); SIP mandate creation has no draft/pending gate at all | `orderService.js` (`submitOrder`, `createSipMandate`) | M | 🔴 |
| H2 | Job platform `completeJob`/`failJob` lack worker-ownership fencing — combined with lease-reclaim, permits real handler double-execution | `frontend/app/lib/platform/jobs/core.js` | S | ✅ fixed |
| H3 | `deliverNotification()` has no "already delivered" guard — a lease timeout can cause a real duplicate send once a real channel adapter exists | `frontend/app/lib/platform/notifications/core.js` | XS | ✅ fixed |
| H4 | No rate limiting anywhere — login, register, and forgot-password are exploitable today with a plain unauthenticated script | `lib/auth.js`, `api/auth/*` | M (auth endpoints only) / L (app-wide) | 🔴 |
| H5 | `investment_orders.placed_by_user_id` has no `ON DELETE` behavior — will hard-fail account deletion once advisor-assisted ordering ships | new migration | XS | 🔴 |
| H6 | `bank_accounts`/`documents`/order history fully hard-cascade-delete on user deletion, via a live (if UI-unwired) `DELETE /api/v1/account` — incompatible with brokerage record-retention obligations given the real, registered distributor ARN/EUIN | schema design decision + migration | L | 🔴 |
| H7 | `identityService.ensureAccount`/`portfolioService.connectMockPortfolio` call sites sit behind routes with **no** try/catch at all | `api/v1/invest/account/route.js`, `api/v1/invest/portfolio/connect/route.js` | XS | ✅ fixed |
| H8 | `jobs-worker.yml` (the Invest platform's execution engine) has no failure alerting and is excluded from the one health dashboard | `.github/workflows/jobs-worker.yml`, `lib/pipelineHealth.js` | S | 🔴 |
| H9 | Ad hoc migration process, no tracking table; already caused one real production incident (005/006); 15 newer migrations (007-021, the entire Invest backend) have zero regression-test coverage | `sql/neon/*`, `tests/test_migrations.py` | M (extend existing test pattern) | 🔴 |
| H10 | No validation anywhere for negative/zero `amount`/`units` in order/redemption/switch creation — a real product-correctness gap, not just a test gap | `orderService.js`, `redemptionService.js`, `switchService.js` | S | ✅ fixed |
| H11 | Jobs-table test noise: 5 test files enqueue an undrained `event-dispatch` job via `makeInvestmentReadyUser`; 2 files (`webhookPlatform.test.js`, `notifications/core.test.js`) claim without filtering to "mine," causing the specific flakiness re-diagnosed multiple times this session | `app/lib/platform/webhooks/webhookPlatform.test.js`, `app/lib/platform/notifications/core.test.js` | S | 🔴 |

---

## Medium — real, worth doing, not urgent

| # | Item | Location | Effort |
|---|---|---|---|
| M1 | `reverseOrder()` fully implemented, zero callers anywhere — wire a route or explicitly document deferral | `orderService.js` | XS |
| M2 | `plan`/`option` snapshot silently null for redemption/switch orders (populated for purchase/SIP) | `redemptionService.js`, `switchService.js` | S |
| M3 | Duplicated exit-load/net-amount math between redemption and switch | same two files | S |
| M4 | Two parallel, non-integrated notification-preference systems (`user_notification_settings` vs `notification_preferences`) — both live | product decision + consolidation | L |
| M5 | No CHECK constraints on any enum-shaped column added from migration 010 onward (`order_type`, `status` columns, `mandate_status`, etc.) | new migration | M |
| M6 | 7 duplicate/redundant indexes across 6 tables | new migration (`DROP INDEX`) | XS |
| M7 | Missing indexes: `investment_orders.scheme_code`, `portfolio_transactions.scheme_code`, `(user_id, created_at)` on orders/mandates | new migration | S |
| M8 | `listOrders`/`listSipMandates` have no `LIMIT`; `getPortfolioTimeline` fetches unbounded then slices in JS instead of a real SQL `LIMIT`/`OFFSET` | `orderService.js`, `portfolioService.js` | S |
| M9 | Reconciliation `holdings-vs-provider` comparator has a genuine N+1 over users; sibling comparators already use the correct JOIN pattern | `lib/platform/reconciliation/comparators/holdingsVsProvider.js` | S |
| M10 | 5 `/api/internal/*/status` endpoints unauthenticated — reuse the existing shared-secret pattern from `alerts/run` | 5 route files | S |
| M11 | Generic `catch(e) → e.message` error handlers can leak raw exceptions (DB errors, etc.) — concretely demonstrated via a malformed SIP date | 17+ route files | S-M (systematic sweep) |
| M12 | No consolidated Invest-platform health view; no Notifications metrics endpoint at all | new `/internal/*` page + `getNotificationMetrics()` | M |
| M13 | ~~Correlation IDs fragment per-hop; `emitEvent()` → `enqueueJob()` drops `correlationId` entirely (concrete one-line bug)~~ **The one-line bug is ✅ fixed** — `event-dispatch` jobs now carry the originating event's `correlationId`. Broader per-hop fragmentation (order → event → job → notification each minting its own ID) is unchanged, real, and still open. | `lib/platform/events/core.js` | ~~XS (the bug)~~ done / M (full propagation, open) |
| M14 | No `frontend/.env.local.example`; fail-fast validation covers only `DATABASE_URL`, only in the cron worker, never the live app | `lib/platform/config/core.js`, new `instrumentation.ts` | S |
| M15 | No rehearsed DR restore drill (Neon PITR exists as the mechanism, no runbook, self-tracked already) | ops exercise + doc | M |
| M16 | ~~`identityService.ensureAccount()` race throws instead of gracefully degrading, contradicting its own idempotency claim~~ **✅ fixed** — losing concurrent call's `23505` is now caught and returns the winner's row, matching `receiveWebhook()`'s existing pattern; covered by a new real-concurrency test. | `identityService.js` | XS |
| M17 | `Document`/`Portfolio` provider calls sit mid-`transition()`/mid-flow with no compensating logic if they fail after an order is already marked completed | `orderService.js`, `portfolioService.js` | M |
| M18 | `Math.random` mock-leak risk in 3 test files (no file-level `afterEach(vi.restoreAllMocks)`) | `documentService.test.js`, `portfolioService.test.js`, `mockProviders.test.js` | XS |
| M19 | Only 2 of 5 providers use standardized `PROVIDER_ERROR_CODES`; KYC has real failures with no code to map to | `providers/types.js`, `MockKYCProvider.js` | S |
| M20 | Migration 008 (Persistent Portfolio) designed but never applied to production — confirmed dead, self-documented | `sql/neon/008_persistent_portfolio.sql` | XS (decision: apply or formally retire) |

---

## Low — hygiene, cheap wins, deliberate tradeoffs worth documenting

| # | Item | Location | Effort |
|---|---|---|---|
| L1 | `platform/` imports from `invest/` in 7 places (mostly a misplaced `mockRef` helper) despite claiming to be domain-agnostic | `invest/providers/mock/ids.js` → relocate | XS |
| L2 | "Notifications" has no single owning module — read/manage routes skip `lib/invest/*Service.js` entirely, unlike every other capability | route layer | M |
| L3 | Stale doc comment in `notifications.js` claiming false things about pre-M5 call sites | `notifications.js` | XS |
| L4 | 5 near-identical mock notification-channel provider files — collapse to one factory | `platform/notifications/channels/mock/*.js` | S |
| L5 | 2 fully dead tables (`investor_profile` singular, `portfolio_sips`), 0 rows, 0 code references | new migration (`DROP TABLE`) | XS |
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

- **5 Critical, 11 High, 20 Medium, 13 Low** (plus 1 explicitly accepted tradeoff).
- Total XS/S items (cheap, low-risk, shippable immediately): **~24** — the bulk of Medium/Low.
- Items needing a genuine design decision before work starts (XL-adjacent): H6 (retention vs.
  deletion policy), M4 (which notification-preference system wins), C1/C2 (need a real
  `withTransaction()` primitive in `db.js` that doesn't exist today).
- See [`BACKEND_RELEASE_CANDIDATE.md`](BACKEND_RELEASE_CANDIDATE.md) for which of these block
  launch versus which are accepted, tracked risk.
