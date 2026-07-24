# Backend Audit Report

Phase 3 — Backend Hardening & Release Candidate, 2026-07-24. Produced after the 5-item Backend
Contract Priority Brief (Redemption, Switch, Notification Read APIs, Provider Metadata, Portfolio
Metadata) reached feature completeness for the investor platform. This is a systematic,
evidence-based audit of the entire backend — architecture, database, security, concurrency,
provider resilience, observability, test suite, performance, and deployment — conducted to
determine what stands between the current feature-complete state and a genuine production
Release Candidate.

## Methodology

Eight independent deep-audit passes ran in parallel, each scoped to one concern and each briefed
with the platform's real history (prior incidents, established design principles, known
constraints) so it verified and extended existing knowledge rather than rediscovering it from
zero. Every finding below is grounded in direct reads of real source files (file:line cited
throughout) or live queries against the real production Neon database (read-only introspection
and `EXPLAIN ANALYZE`, zero writes). No finding in this report is speculative — where an agent
was not able to measure something directly, that is stated explicitly rather than presented as
fact.

Seven of the eight passes converged, independently and without coordination, on several of the
same issues from different angles — see §10. That convergence is treated as a confidence signal:
findings multiple audits reached by different routes are the ones most worth acting on first.

This report catalogs findings. Prioritization, effort estimates, and fix status live in
[`BACKEND_TECHNICAL_DEBT.md`](BACKEND_TECHNICAL_DEBT.md). Launch readiness and operational
checklists live in [`BACKEND_RELEASE_CANDIDATE.md`](BACKEND_RELEASE_CANDIDATE.md).

**Scale at audit time** (live production Neon, 2026-07-24T08:38 UTC): 82 base tables, 204
indexes, 75 foreign keys, 269,703 total rows — dominated by the NAV/news data warehouse. The
Invest-platform transactional tables are still pre-launch: `investment_orders` (0 rows),
`sip_mandates` (0), `order_status_history` (0), `notifications` (2), `portfolio_holdings` (20),
`documents` (1). This matters throughout — several findings are real code defects with zero
*current* user impact because there is essentially no real transactional data yet, and are
flagged as **latent** rather than **current** accordingly. Latent is not a reason to defer
indefinitely: several of these are cheap to fix now, while shipping them carries zero risk, and
expensive to discover later once real data and real users exist.

---

## 1. Architecture & Code Quality

**Overall verdict: fundamentally sound.** A clean, acyclic service-dependency graph across
`lib/invest/*`; a completed, real anti-duplication refactor (`getVerifiedBankAccount` extracted
into `bankAccounts.js` when a second caller needed it) proving the codebase does catch and fix
duplication rather than accumulate it; deliberate and mostly-consistent "freeze a snapshot at
creation time" semantics for money-relevant fields; consistent thin-route/fat-service layering
verified across all 37 invest API routes; mock providers that honestly conform to their own
declared interfaces. No cyclic dependencies were found anywhere in the service layer.

### Findings

- **[Medium] `plan`/`option` snapshot silently omitted for redemption/switch orders.**
  `orderService.js`'s `createOrder()`/`createSipMandate()` both populate `plan`/`option` from
  `getFund()`. `redemptionService.js`'s insert and `switchService.js`'s two inserts never do,
  despite writing to the same `investment_orders` table. These are real, always-present fields
  (verified: 14,246/14,246 records in `funds.json`). This breaks the "freeze at creation" principle
  applied everywhere else in the same table — every redemption/switch order's `plan`/`option`
  will be `NULL` forever. *Independently corroborated by the Database audit (§2), which confirmed
  the columns are nullable in the live schema and traced that every OTHER write path always
  populates them.*
- **[Medium] `reverseOrder()` is fully implemented (DB write, audit log, notification) with zero
  callers anywhere** — no API route, no test, no other code path. A live, consequential,
  money-adjacent state mutator sitting with no guardrail of a caller. Needs an explicit decision:
  wire a route, or document that it's intentionally ops-only/deferred.
- **[Medium] Duplicated exit-load/net-amount math between `redemptionService.js` and
  `switchService.js`** — near-verbatim duplicate calculation blocks (same epsilon tolerance, same
  formula shape), more surprising given `switchService.js` already reuses
  `getRedemptionEligibility()` for everything else. A clear candidate for a shared helper that
  simply wasn't extracted.
- **[Medium] Two independent, non-integrated notification-preference systems**:
  `user_notification_settings` (older Alert Engine) and `notification_preferences` (Notification
  Platform/M5) — different code, different tables, both live, no shared UI or reconciliation. *See
  §2 and §10 — the Database audit independently found and confirmed the same pair are both
  populated/queried in production code, not one dead and one live.*
- **[Low-Medium] `platform/` is not actually domain-agnostic** despite its own doc-comments
  describing it as a reusable Provider Infrastructure Layer — it imports from `invest/` in 7
  places (an event listener, a reconciliation comparator, and all 5 mock notification channels
  importing a generic `mockRef` ID helper that's simply misplaced under
  `invest/providers/mock/ids.js`). Easiest fix: relocate `mockRef`/`mockAccountNumber`.
- **[Low-Medium] "Notifications" has no single owning module** — every write goes through
  `lib/invest/notifications.js`, but every read/manage API route imports
  `lib/platform/notifications/*` directly, skipping the `lib/invest/*Service.js` layer every other
  capability in this codebase uses.
- **[Low]** Stale doc comment in `notifications.js` claiming `identityService`/`complianceService`
  are existing `notifyUser` call sites (verified false — they use the event-listener path
  instead, likely drifted after the Event Bus refactor).
- **[Low]** 5 near-identical mock notification-channel provider files (~30 lines each, differ only
  in a name string and a result-field name) — a factory function would collapse this to one
  implementation.
- **[Low]** Verbatim one-line validation duplication (`if (amount == null && units == null) throw
  ...`) across `orderService.js`/`redemptionService.js`/`switchService.js`.
- **[Verified clean]** No function exceeds ~4 real parameters anywhere in scope (consistent
  destructured-options-object pattern). No dead code left behind by any of the 5 shipped
  contract slices. `research_profile` vs `investor_profiles` looks like naming collision but is
  genuinely different data, not duplication.

---

## 2. Database

**Overall verdict: solid engineering discipline, with one real latent bug and one real
forward-looking compliance gap.** 36/36 primary `user_id` ownership columns are indexed. Every
single `ON CONFLICT` clause in the codebase (15 distinct targets, exhaustively checked) is backed
by a real, live unique constraint — zero gaps. Every table has exactly one primary key. The one
`FOR UPDATE SKIP LOCKED` usage in the app (the job-claim query) is correctly scoped, and a live
`pg_locks` check at audit time showed zero contention.

### Findings

- **[High] `investment_orders.placed_by_user_id` has no `ON DELETE` behavior specified** (defaults
  to `NO ACTION`). Dormant today (0 rows, no order-placement flow yet passes an advisor context),
  but the moment advisor-assisted ordering ships and any advisor account is ever deleted via the
  live `DELETE /api/v1/account` route, the delete will throw a raw FK-violation and fail the whole
  transaction — silently defeating the hard-delete guarantee the rest of the schema (36 CASCADE
  FKs to `users`) was built around. Fix: `ON DELETE SET NULL`, matching the reasoning already used
  for `document_events.actor_user_id`.
- **[High] `bank_accounts`, `documents`, and order/transaction history all fully hard-cascade-delete
  the instant a user is deleted**, and `DELETE /api/v1/account` is a live, functional, deployed
  endpoint today (not yet wired into any UI, per its own code comment, but reachable by any
  authenticated caller directly). Migration 017 registered Suasion Securities' real, confirmed
  AMFI distributor ARN/EUIN — this platform is on a real glide path to real transactions, and a
  real brokerage's KYC documents, bank records, and transaction history are typically subject to
  statutory retention that survives account closure. The codebase already understands this
  pattern (`audit_log.user_id` and `document_events.actor_user_id` both deliberately use `SET
  NULL` to survive user deletion) but never extended it to the regulated-record tables themselves.
  Recommend carving out `bank_accounts`, `documents`, `investment_orders`,
  `order_status_history`, `portfolio_transactions` from the cascade-delete model before this
  endpoint is ever wired into a UI or exercised against real transaction history.
- **[Medium] No CHECK constraints on any enum-shaped column added from migration 010 onward** —
  `investment_orders.order_type`/`status`/`payout_status`/`payment_status`,
  `sip_mandates.mandate_status`, `documents.status`/`category`/`doc_type`, `jobs.status`, and more
  are enforced only in application code. This is a **documented, deliberate** architectural choice
  (explicit in 3+ migration headers: "app-validated, not DB CHECK constraints, so adding a new
  value never needs a migration") — not an oversight — but it is a real defense-in-depth gap on
  the columns that drive money-movement state machines: a bad backfill or a bug in a new code path
  bypassing the JS constant would insert an invalid value today with nothing at the DB layer to
  catch it.
- **[Medium] 7 duplicate/redundant indexes** across 6 tables (e.g.
  `portfolio_snapshots.idx_snapshots_user_date` is a byte-for-byte exact duplicate of an existing
  unique-constraint index). Zero correctness risk, `DROP INDEX` is instant and safe.
- **[Medium] Missing indexes on real hot-path columns**: `investment_orders.scheme_code` (queried
  on every redemption-eligibility check), `portfolio_transactions.scheme_code` (same query family,
  earliest-purchase-date computation for tax classification). `investment_orders.created_at` /
  `sip_mandates.created_at` are also uncovered (existing indexes lead with `status`, not
  `created_at`), so `order by created_at desc` requires a separate sort step.
- **[Low-Medium] Migration 008 (Persistent Portfolio: `portfolio_folio`, `portfolio_import`,
  `portfolio_holding`, `portfolio_holding_valuation`) was never applied to production** — confirmed
  by direct table-list query, none of the 4 tables exist live. This is self-documented in the
  codebase's own test-script comments ("designed but not applied, per this session's own
  migration safety discipline... flagged as the explicit next step, not silently skipped") and
  confirmed dead: zero real code paths in `app/lib`/`app/api` depend on it. A genuine, confirmed
  gap in "do all 21 migrations apply cleanly" — but currently inert, not a live bug.
- **[Low] 2 fully dead tables**: `investor_profile` (singular, migration 003, 0 rows, zero code
  references — superseded by `investor_profiles` plural 10 days later) and `portfolio_sips`
  (migration 002, 0 rows, zero code references — superseded before ever being wired up). Pure
  schema clutter, zero functional risk, safe to drop.
- **[Verified clean]** No SQL injection surface at the schema level. No stuck/long-running
  transactions at audit time. Migration 006's same-day corrective rename of 005 (applied with
  reconstructed-from-memory column names that didn't match production) is a real, self-corrected
  incident with zero lingering effect (table had 0 rows at the time) — see §7 for the CI-side
  angle on why this happened.

---

## 3. Security

**Overall verdict: notably disciplined for a pre-launch financial platform.** Zero SQL injection
found anywhere (every DB call is parameterized via `db.js`'s `query(sql, params)`, verified
exhaustively including every place a template literal touches a SQL string). Zero IDOR found —
every route with a dynamic ID segment or mutating verb was checked individually; every one scopes
its underlying query by the authenticated session's own `user_id`, never a client-supplied one.
Zero mass-assignment found — every write handler destructures an explicit field allowlist rather
than spreading the request body; every state-defining field (order status, distributor
attribution, bank-verification flag) is always server-computed, never client-trusted.

### Findings

- **[High] No rate limiting anywhere in the application** — no middleware, no library, and the one
  related config knob (`getProviderConfig().rateLimitPerMinute`) is defined but never read by
  anything. This is exploitable **today**, not latent:
  - Login (`lib/auth.js`'s Credentials callback): unlimited password attempts against any known
    email — a dummy-hash timing defense closes the enumeration side-channel but does nothing to
    slow volume/credential-stuffing.
  - `POST /api/auth/forgot-password`: the reset email is deliberately fire-and-forget (to close a
    different timing side-channel), so the response returns instantly regardless — an attacker can
    script repeated calls to email-bomb a real user's inbox and burn the Resend quota, with zero
    auth required.
  - `POST /api/auth/register`: unlimited account creation, each paying real bcrypt cost.
  - OTP endpoints (`compliance/items/mobile`, `/email`): no attempt-count/lockout infrastructure at
    all. Currently moot (mock OTP is a hardcoded literal), but this is the exact code path that
    will need throttling the day a real OTP provider replaces the mock — flagging now since the
    swap-in point is a config change, not a code change.
- **[Medium] 5 `/api/internal/*/status` endpoints (jobs, webhooks, reconciliation, events,
  providers) have no authentication at all.** Reachable by anyone with the URL. Content is
  genuinely safe on inspection (aggregate counts and metadata only — independently verified by
  both this audit and the Observability audit, see §10), but it is real internal operational
  telemetry (queue depth, provider health, exception counts) handed to an unauthenticated caller,
  and inconsistent with the codebase's own standard one directory over
  (`POST /api/v1/internal/alerts/run` gates on a timing-safe shared secret). Cheap fix: reuse that
  exact pattern.
- **[Low-Medium] Generic error handlers (`catch (e) { return Response.json({error: e.message},
  {status:400}) }`) can leak raw exception text, present in 17+ route files.** For deliberately
  thrown `new Error("readable message")` this is safe and intentional (the overwhelming majority
  of throws). The gap is these are *blanket* catches — concretely demonstrated as currently
  reachable: `POST /api/v1/invest/sips` with a syntactically invalid `startDate` string passes
  app validation (only checked for truthiness) and reaches the DB, which raises a raw
  `invalid input syntax for type date` Postgres error, forwarded verbatim to the client.
- **[Low] Account enumeration on `/api/auth/register`** — returns `409` with an explicit "account
  already exists" message. Directly inconsistent with the same codebase's own deliberate
  anti-enumeration design on `forgot-password` (always-generic response, with a comment explaining
  why).
- **[Low, defense-in-depth]** `trustHost: true` in `lib/auth.js` with no Host-header hardening
  (not practically reachable on standard Vercel hosting, which normalizes forwarded-host; the
  codebase already applies the correct hardening pattern one file over in
  `forgot-password/route.js`'s `TRUSTED_ORIGIN` constant — just not to NextAuth's own flows). No
  security headers configured (`next.config.mjs` is an empty object — no CSP/HSTS/etc.). One `GET`
  route with a real side effect (`refreshOrderStatus` inside a timeline fetch) — CSRF-adjacent
  code smell, negligible practical impact since the resulting state change is deterministic and
  scoped to the caller's own data.
- **[Verified clean]** PII handling is schema-enforced, not just conventional — `bank_accounts` has
  *only* a masked-number column in the schema (storing the unmasked number is structurally
  impossible, not just avoided by discipline). PAN is never persisted anywhere at all (the
  `pan_masked` columns that exist are dead — never written to). Every `logAudit()` call site (19
  checked) carries IDs/enums/amounts, never raw PAN/OTP/unmasked bank numbers. CSRF: cookie
  session is `SameSite=Lax` (verified against the actually-installed `@auth/core` source, not
  assumed), which is real, effective protection given every mutating route in the app is
  POST/PUT/DELETE. No XSS path found — the one place the API layer builds real HTML
  (password-reset email) is safely escaped/encoded, and the Notification Platform's template
  engine HTML-escapes by default with nothing in the codebase currently opting into raw output.

---

## 4. Concurrency & Consistency

**This is the most consequential section of the report.** Three previously-fixed concurrency
issues from earlier in this platform's life were re-verified and confirmed intact with no
regression (advisory-lock/pooled-connection test isolation; full job-handler-set imports across
every job-claiming test file; the multi-row-INSERT `clock_timestamp()` fix, confirmed to be the
*only* instance of that bug pattern in the entire codebase after an exhaustive re-grep). But
outside of the job-claim mechanism and the incoming-webhook dedup path — both of which are
genuinely, verifiably race-safe and should be the template for everything below — **every
mutating investor-lifecycle sequence in this codebase is a bare read-then-decide-then-write with
no row lock and, in the two most consequential cases, no database constraint either**, because
`db.js` has never had a real multi-statement transaction primitive to build one on.

### Findings

- **[Critical] `orderService.transition()` performs an unconditional `UPDATE` with no
  compare-and-swap, no row lock, anywhere in the order lifecycle.** This is the single choke
  point for `submitOrder`, `refreshOrderStatus`, `cancelOrder`, `retryOrder`, `reverseOrder`. Two
  concrete, ordinary-user-behavior interleavings produce real corruption:
  - A double-clicked "Submit" (or a client retry after a slow response) fires two concurrent
    `submitOrder()` calls. Both read `status='draft'` before either writes, both pass the guard,
    both call the payment provider and the investment provider — **two real charge attempts and
    two real fund-purchase orders placed for one user intent.** *Independently confirmed by the
    Test Suite audit, which traced the identical gap from a different angle (`transition()`'s
    `UPDATE` has no `AND status = 'draft'` guard, unlike `completeJob()`'s correctly-guarded
    equivalent) — see §10.*
  - Two overlapping `GET` requests both trigger `refreshOrderStatus()` for an order at exactly the
    resolution threshold; `decideNextStatus()` draws `Math.random()` independently per call, so
    one can compute `"completed"` and the other `"failed"` from the same starting state — the last
    writer wins, and if the completing branch already ran (crediting the portfolio, generating a
    document, initiating a redemption payout — all irreversible), the order can end up permanently
    `status='failed'` while its financial effects already happened.
  - Cascades into **double portfolio-crediting**: `reconcileCompletedOrder()`'s
    `portfolio_holdings` upsert is additive on conflict, not idempotent — a second `transition()`
    call for the same order re-adds `deltaUnits` on top. The paired `portfolio_transactions`
    insert has no unique constraint at all.
  - **Proposed fix** (from the audit, concrete enough to implement directly): make `transition()`
    compare-and-swap (`WHERE id = $1 AND status = $expectedFromStatus`, treat 0 rows as "stale,
    stop"); for `submitOrder()` specifically, atomically claim the transition as the *first*
    statement before any provider call (`UPDATE ... SET status='submitting' WHERE id=$1 AND
    status='draft' RETURNING *`, bail on 0 rows) — this is what actually prevents the double
    provider call, not just the bookkeeping; add an idempotency guard for the portfolio-credit side
    (an `order_settlements(order_id uuid primary key)` table, insert-first, `23505` means
    "already settled, skip" — the same shape the codebase's own webhook-dedup code already gets
    right).
- **[Critical] Redemption/switch eligibility is a pure read-then-write TOCTOU race with zero
  database backstop.** `getRedemptionEligibility()` computes `unitsRedeemable` via a plain read;
  `createRedemptionOrder()` re-runs that same read then inserts with no transaction, no lock. No
  unique or check constraint on `(folio_number, status)` exists anywhere. Two concurrent
  redemption/switch requests on the same folio (a double-clicked button is sufficient — not an
  exotic race) can both pass the "enough units" check before either commits, producing a real
  over-redemption the platform must eventually honor a payout against or fail post-hoc.
  `switchService.js` inherits the identical gap via its reuse of the eligibility check.
  **Proposed fix**: wrap the check-then-insert sequence in a transaction that takes a per-folio
  `pg_advisory_xact_lock(hashtext(folio_number))` before recomputing eligibility (requires adding a
  real `withTransaction()` helper to `db.js`, since today's `query()` is pool-only/single-statement);
  and/or a DB-level backstop trigger that re-sums non-terminal redemption/switch-out units against
  actual held units on insert and rejects an overdraft regardless of which code path wrote the row.
- **[High] No idempotency key is ever passed to the payment provider** in `submitOrder()`'s
  purchase leg or `createSipMandate()`. `createSipMandate()` has no draft/pending gate protecting
  it at all (unlike purchase orders) — a double-clicked "Set up SIP" fires two independent
  `initiateMandate()` calls and inserts two `sip_mandates` rows even after Finding 1 above is
  fixed. Proposed fix: pass `order.id` as an idempotency key into the provider call (modeling what
  a real gateway's `Idempotency-Key` header requires, before a real adapter is ever built); add a
  partial-unique `idempotency_key` on `sip_mandates`.
- **[High] Job platform `completeJob()`/`failJob()` have no worker-ownership fencing.**
  `claimJobs()` itself is genuinely solid (single-statement CTE, `FOR UPDATE SKIP LOCKED`,
  confirmed the only such usage in the app) — but `completeJob()` only guards
  `status='running'`, not which worker holds the lease, and `failJob()` has no status guard on its
  `UPDATE` at all. Combined with lease-reclaim (a legitimately slow handler outliving its lease
  gets requeued and re-claimed by a second worker while the first is still executing), this
  permits real double-execution of a handler — the platform's own documented contract
  ("every handler must therefore be idempotent — enforced by convention, not by this module") is
  the only thing standing between this and a visible duplicate, and Finding 3 below is a concrete
  handler that violates that convention. Fix: thread `workerId` through both functions, add `AND
  locked_by = $workerId` to every UPDATE, treat a 0-row result as "someone else already resolved
  this, no-op."
- **[High] `deliverNotification()` has no "already delivered" guard.** If a provider call succeeds
  but the worker dies before the final status write, lease-reclaim requeues the job and it runs
  again from the top — re-sending. Currently invisible (every mock channel provider mints a fresh
  ID with no dedup, so nothing observes the duplicate), but it is a live, unguarded code path that
  will send two real emails/SMS/pushes the moment a real channel adapter replaces a mock. One-line
  fix: check `status === "delivered"` and no-op before proceeding, same place the existing
  `"cancelled"` check already lives.
- **[Medium] `identityService.ensureAccount()`'s race path throws instead of degrading
  gracefully**, contradicting its own doc comment ("idempotent — returns the existing account if
  one exists"). `investment_accounts.user_id` is genuinely unique, so no duplicate row can
  persist, but the losing concurrent call's unhandled `23505` propagates instead of returning the
  winner's row. The codebase already has the correct pattern for this exact shape elsewhere
  (`receiveWebhook()`'s own `23505` handler) — this is a one-function fix.
- **[Low, forward-looking]** Event dispatch has no cross-event ordering guarantee. Not exploitable
  today (only one internal listener is currently registered anywhere, and outbound webhook
  fan-out has no live subscribers), but nothing documents the hazard for whoever adds the first
  real listener for `PortfolioUpdated`/`OrderCompleted` — worth a contract note on `emitEvent()`
  now rather than a bug later.

---

## 5. Provider Resilience

**Headline: none of the 5 invest providers (KYC, Investment, Payment, Portfolio, Document) are
wrapped in retry or circuit-breaker logic — every call site is a bare `await`.** This stands in
direct contrast to the 5 Notification-channel mock providers, each of which wraps its own `send()`
in a real per-channel Circuit Breaker built from the shared Configuration Platform. The Provider
Registry (which all 5 invest providers *are* correctly registered in) is metadata-only by design
and never proxies a call — registration should never be read as "protected at runtime."

### Findings

- **[High] Two provider call sites sit behind API routes with no error handling of any kind** —
  not "no retry," but literally no `try`/`catch` anywhere in the chain:
  `identityService.ensureAccount()` (called from `POST /api/v1/invest/account`, which has zero
  try/catch) and `portfolioService.connectMockPortfolio()` (called from
  `POST /api/v1/invest/portfolio/connect`, also zero try/catch). A thrown error here today is
  purely theoretical (the mocks never throw), but it's a code-structure gap independent of when a
  real provider lands.
- **[Medium-High] Zero structured logging anywhere in the provider-call failure path** — this
  cross-references and sharpens the Observability audit's Critical finding (§6): every invest API
  route's generic `catch(e)` returns a flat HTTP 400 with no server-side log line, meaning a
  hypothetical future transport failure/timeout from a real provider adapter would produce no log,
  no alert, and a client-visible 400 indistinguishable from the user's own input error (which also
  incorrectly suppresses client-side retry logic, since 4xx is conventionally non-retryable).
- **[Medium] Failure-simulation realism is uneven across the 5 mocks.** Payment is genuinely good
  (both methods realistically weighted, mapped to standardized error codes). Investment is partial
  (only `placeOrder` has a failure branch; 5 of its 6 methods are unconditionally successful).
  KYC has real weighted failure branches on 2 of 3 methods but never maps them to a standardized
  error code (no DB column exists for one either). Document and Portfolio providers have **no**
  failure branch at all — any caller code written to handle a failure from either is currently
  untested dead code.
- **[Medium] Standardized `PROVIDER_ERROR_CODES` are used by only 2 of 5 providers** (Payment
  fully, Investment partially) — exactly matching which providers have a DB column to store the
  code in. KYC has real failures today with nowhere to put a code.
- **[Low, informational — correctly not over-weighted since no real provider exists yet]** No
  timeout/rate-limit contract is defined on the provider base-class interfaces themselves; the
  Configuration Platform's per-provider config schema (`timeoutMs`, `rateLimitPerMinute`,
  `maxAttempts`) is fully defined and env-overridable but consumed by nothing — a config
  placeholder with no enforcement code anywhere, for any provider in the app, invest or
  notification.
- **[Verified as correct design, not a gap]** The Provider Registry's read-only, non-intercepting
  design is intentional and documented as such — flagged here only so "registered" is never
  mistaken for "resilient" when reading other parts of this report.

---

## 6. Observability

**This is the single most significant gap area in the whole audit**, and stands in sharp
contrast to genuinely good work elsewhere in the same codebase: 4 of 5 `/api/internal/*/status`
endpoints report real, safe, verified-non-leaking aggregate metrics (payload-leakage claims in
their own code comments were independently checked against the actual backing SQL and confirmed
accurate); the async job-worker architecture correctly self-heals from a crashed worker via
lease-reclaim; the data/research side of this same application has a mature, incident-hardened
health dashboard and deploy-verification pipeline. That investment has simply not yet been
extended to the Invest/money-movement backend this audit covers.

### Findings

- **[Critical] Zero server-side logging or error tracking anywhere in the API/service request
  path.** Confirmed by exhaustive grep: 0 `console.*` calls anywhere in `app/api`; only 2 files in
  `app/lib` use `console.error` at all (neither reachable from an order/payment failure). Every
  invest API route's `catch(e)` returns a clean `Response.json({error: e.message}, {status:400})`
  — because the exception is caught and a normal-shaped response returned, this never reaches
  Vercel's own runtime error boundary either; from the platform's perspective, a failed order
  submission looks identical to a successful invocation. Sentry is client-only
  (`@sentry/browser`, not `@sentry/nextjs`) — zero visibility into server-side/API-route errors.
  This is a self-acknowledged gap in the team's own existing roadmap doc, but has not been closed.
  **If `submitOrder()` throws mid-flow in production today, there is no log line, no alert, no
  stack trace anywhere — only a 400 the end user saw.**
- **[Critical] CI never runs the test suite or lint.** `frontend/package.json` defines
  `npm test` (vitest, 69 test files) and `npm run lint` (eslint) — `ci.yml` runs neither; its
  `frontend-build` job does only `npm ci && npm run build`. Compounding: no `vercel.json` exists,
  so Vercel's git integration deploys on every push to `main` **independently of CI's outcome
  entirely** — a broken test or lint violation can merge and deploy today with zero automated
  resistance of any kind.
- **[High] The Invest backend's own execution engine (`jobs-worker.yml`, the 15-minute cron every
  notification delivery/event dispatch/reconciliation run depends on) has no failure alerting.**
  `SLACK_WEBHOOK_URL` is documented as an env var but wired into zero workflows. It is also the
  one workflow excluded from the repo's single consolidated health dashboard
  (`/internal/system-health`'s tracked-workflow list is hardcoded to 4 other, unrelated
  workflows). A silent failure here today would only surface via GitHub's own default email or a
  human manually polling the jobs-status endpoint.
- **[High] Migration process is ad hoc with no tracking table, and has already caused one real
  production incident** (migration 005 applied from a reconstructed-from-conversation column-name
  summary rather than the actual file, producing a live schema mismatch that 500'd an endpoint
  until 006 corrected it). The team's own compensating test (`test_migrations.py`) covers exactly
  the tables involved in that incident and nothing else — the 15 migrations shipped since (007
  through 021, the entire job/webhook/reconciliation/event/notification/redemption/switch/
  provider/portfolio-metadata backend) have zero equivalent regression coverage.
- **[Medium] No consolidated health view for the Invest platform** — an operator must check 5
  separate JSON endpoints by hand, and there is no metrics endpoint for Notifications at all (the
  one subsystem missing from the otherwise-consistent 5-endpoint pattern).
- **[Medium] Correlation IDs are real but fragmented — one hop drops them entirely.** Each stage
  of a real flow (order → event → job → notification) mints its own ID scoped to its own primary
  key rather than propagating one trace token; a concrete, one-line bug was found —
  `emitEvent()`'s own dispatch call to `enqueueJob()` omits the `correlationId` option entirely,
  even though `enqueueJob()` fully supports it, so every `event-dispatch` job's correlation column
  is `NULL` today.
- **[Medium-High] No `.env.local.example` exists for the frontend app** (22+ required env vars,
  undocumented for a new engineer/operator), and **fail-fast startup validation covers only
  `DATABASE_URL`, and only inside the standalone cron worker script — never inside the live
  Next.js app itself** (no `instrumentation.ts` hooks it in). Every other required var (auth
  secrets, OAuth credentials, `RESEND_API_KEY`, provider webhook secrets) has zero fail-fast
  coverage; a missing one surfaces however/wherever first touched.
- **[High, collectively, correctly de-prioritized given current near-zero traffic]** No latency
  percentiles anywhere in any subsystem; no database connection-pool or slow-query monitoring; no
  API-latency instrumentation of any kind (no middleware, no Vercel Speed Insights, no
  `Server-Timing`). None of this blocks the current mock-provider phase, but all of it should gate
  before real-money launch.
- **[Medium] No rehearsed disaster-recovery restore drill** — Neon PITR exists as the underlying
  mechanism, but no runbook exists and no restore has ever been performed. Self-identified in the
  team's own roadmap already (not a new discovery).
- **[Verified safe, Low]** All 5 `/api/internal/*/status` endpoints were independently confirmed
  (by both this audit and the Security audit — see §10) to genuinely contain no payload/PII
  leakage despite being unauthenticated.

---

## 7. Deployment & Operations

*(Findings that don't duplicate §6 above — CI, migrations, and alerting gaps are covered there.)*

- **[Low]** A `Dockerfile` exists at the repo root but packages the Python data-pipeline API, not
  the Next.js frontend, and is referenced by zero CI/CD path (`grep` across workflows/docs/configs
  found nothing) — vestigial, not part of the live deploy story. Minor hygiene issues if it's ever
  revived (runs as root, single-stage, unpinned base image, no healthcheck).
- **[Low-Medium, deliberate tradeoff]** Rollback is fully manual by design — the runbook states
  this explicitly ("no rollback automation exists by design"). Code rollback via Vercel's
  promote-a-past-deployment flow is real and functional; database rollback is policy-gated
  (additive-only migrations, spot-checked across all 21 files — zero destructive operations found,
  one justified `RENAME COLUMN` on an empty table). This reads as a reasonable trade-off for
  current team size/velocity, not an oversight.
- **[Verified correct, not a false gap]** Since this is a stateless serverless deployment,
  "graceful shutdown"/"startup ordering" in the traditional sense don't apply — correctly not
  reported as a gap. The one genuinely long-running piece (the cron-driven job worker) has a
  real, working self-healing mechanism via lease-reclaim.

---

## 8. Test Suite Quality

**Overall verdict: high underlying test-design quality, undermined by one specific, precisely
diagnosed, currently-active flakiness mechanism that makes the full suite untrustworthy as an
unconditional release gate right now.**

### Findings

- **[High — root cause of this session's own repeated flaky-test re-verification work] Stray jobs
  from a shared test helper starve two specific test files' claim budgets.** Five test files call
  `makeInvestmentReadyUser()`, whose last step fires a real `InvestmentReady` event with a real
  registered listener — enqueuing a real job into the shared `jobs` table. None of those 5 files
  drain the job they create; `jobs` has no FK to `users`, so deleting the test user doesn't clean
  it up either. When `webhookPlatform.test.js` or `notifications/core.test.js` later calls
  `runWorkerTick()` with no "claim only mine, put strangers back" filter (unlike
  `jobPlatform.test.js`, which already has exactly this discipline via its own `claimOwn()`
  helper), it can burn its claim budget on this accumulated backlog before reaching its own job —
  precisely matching the "queued instead of delivered" / timeout symptoms observed repeatedly
  this session. The shared advisory-lock documentation (`testClaimLock.js`, `vitest.config.js`)
  is also stale — it still describes a 3-file lock group and a "38-file suite," while the actual
  numbers are 4 files and ~69, meaning `MAX_WAIT_MS`'s safety margin was recalibrated at some
  point without the prose being updated to match, leaving only ~14% headroom on the current
  worst-case estimate.
- **[High — real product bugs, found via test-gap analysis, not just missing coverage] No
  validation anywhere for negative or zero `amount`/`units`** in `orderService.js`,
  `redemptionService.js`, or `switchService.js` — confirmed by reading the source, not inferred
  from absent tests. In `redemptionService.js` specifically, a negative `requestedUnits` makes the
  overdraw guard (`requestedUnits > unitsRedeemable`) always false, so it silently passes through
  to order creation. *Independently, this same audit traced the exact same
  `submitOrder()`/`transition()` compare-and-swap gap the Concurrency audit found from a completely
  different angle — see §10 — plus a related, lower-confidence second race in
  `complianceService.js`'s `maybeCompleteInvestmentReady` (two concurrent last-item submissions
  could both pass its completion check and both fire the `InvestmentReady` event).*
- **[Medium] `Math.random` mock-leak risk in 3 files** (`documentService.test.js`,
  `portfolioService.test.js`, `mockProviders.test.js`) — each pairs a manual
  `vi.spyOn`/`vi.restoreAllMocks()` with no file-level `afterEach` safety net, unlike the other 4
  files using the same spy target. Currently latent (the guarded assertions haven't thrown), but
  `portfolioService.test.js` specifically has 4+ tests after the vulnerable spot that would
  silently inherit a stuck mock if that ever changes.
- **[Low]** `webhookPlatform.test.js`'s cleanup queries use a 30-minute wall-clock window instead
  of the run-scoped identifier the rest of the same file correctly uses — a narrow, low-probability
  cross-run coupling risk (same-file re-runs within 30 minutes of each other).
- **[Verified clean — genuinely good news]** No timing-assumption sleeps anywhere in the suite
  (every test needing real elapsed time backdates a timestamp column and re-invokes the real code
  path). Weighted-mock-outcome tolerance is handled correctly and consistently everywhere it's
  exercised — no test found that assumes only a success branch. No hardcoded-NAV or
  timezone-dependent assertions found. No genuine duplicate tests found (a same-titled cluster
  between `redemptionService.test.js`/`switchService.test.js` exercises legitimately separate code
  across a deliberate delegation boundary, not waste).

---

## 9. Performance

**Overall verdict: fast today, for the correct and unremarkable reason that almost no real data
exists yet** (`investment_orders`: 0 rows; `sip_mandates`: 0; `order_status_history`: 0).
Every `EXPLAIN ANALYZE` run against production came back under 5ms, and every sequential scan
observed was the objectively correct planner choice for current table sizes — none of these are
misconfigured plans. Connection pooling is implemented correctly (a real shared `pg.Pool` per
warm instance, wrapped in Vercel's `attachDatabasePool` for clean drain-on-suspend, on the correct
pooled Neon endpoint) — verified against Neon's own published guidance for this exact deployment
target.

### Findings

- **[Critical-leaning-High — the one performance finding that is slow *today*, independent of data
  volume] The compliance-completion gate does 11 sequential DB round trips on every single
  order/redemption/switch/SIP-creating action**, unconditionally, even for a user whose compliance
  has been complete for months. `ensureApplication()`'s 9-item insert loop runs sequentially inside
  a `for` loop rather than one multi-row statement, and `getApplication()` calls it unconditionally
  on every invocation rather than checking existence first. Measured directly: 11 sequential
  trivial round trips took ~2.7s over the audit's own network path to Neon (this number reflects
  that path, not necessarily Vercel's — likely much lower if region-matched — but the *shape* of
  the defect, 11 round trips where 1-2 would do, is a code fact independent of network location,
  and it fires on the single most business-critical write path in the app).
- **[Medium, latent — confirmed will matter, timeline is predictable] `listOrders()` and
  `listSipMandates()` have no `LIMIT` at all.** A realistic 500-order user (plausible after months
  of active SIPs — the exact feature that generates recurring orders) would receive an estimated
  ~650KB unbounded JSON payload on every load of the orders screen. `getPortfolioTimeline()`'s
  `limit` parameter is not real pagination either — it fetches all matching rows from two unbounded
  SQL queries and only applies the cap via `.slice()` in JavaScript afterward, materially weaker
  than the real SQL-level `LIMIT`/`OFFSET` this same codebase already uses correctly for
  `listNotifications()`/`listDocuments()`.
- **[Medium, latent]** The reconciliation `holdings-vs-provider` comparator has a genuine N+1 over
  users (one query per distinct user, compounding with a second per-holding loop inside the core
  reconciliation loop) — negligible at today's ~6 mock-connected users, real at
  `userLimit=200`. Its sibling comparators already use the correct single-query `LEFT JOIN`
  pattern, making this one an outlier, not the norm.
- **[Low-Medium, latent]** No retention/prune job exists for `domain_events` or
  `reconciliation_runs`/`reconciliation_items` (contrast: `jobs`/`job_events` already have a
  working 30/90-day prune routine). No index covers `investment_orders`/`sip_mandates`'
  `(user_id, created_at)` or `domain_events.created_at` — both will start to matter as soon as the
  `LIMIT` gap above is fixed and real order history begins accumulating.
- **[Low]** `documentService.js`'s reads consistently `select *`/`returning *`, including the
  internal `tsvector search_vector` column — never useful to a client, currently small in absolute
  bytes given low content volume, cheap to exclude via an explicit column list.
- **[Medium, latent]** No caching layer exists anywhere for the Neon-backed Invest routes (the
  pattern is proven and used extensively on the *other*, Supabase-backed half of this same
  codebase via `revalidate` — it just hasn't been extended here yet). `getPortfolio()`'s full
  in-memory revaluation/health-report pipeline, recomputed from scratch on every request despite
  only changing on discrete, already-instrumented events (`PortfolioUpdated`), is the highest-value
  candidate.
- **[Medium, latent, foreseeable-not-hypothetical]** Job-worker throughput has a static ceiling
  (50 jobs/15-minute tick) with no logic that scales up under queue-depth pressure. A burst of 500
  correlated events (plausible for this specific app: SIP mandates execute on fixed calendar dates,
  so a real active-SIP cohort will produce naturally clustered, near-simultaneous events on those
  specific days each month) would take an estimated ~2.5 hours worst-case to fully drain — an
  acceptable latency for a background prune job, not for user-facing notification delivery.

---

## 10. Cross-cutting findings — independent convergence

The following issues were identified independently, via different investigative routes, by two
or more of the eight audit passes above. This convergence is the strongest confidence signal in
this report — treat these as verified, not merely reported.

1. **`orderService.transition()`'s missing compare-and-swap** — found by the Concurrency audit via
   direct interleaving analysis, and separately by the Test Suite audit while investigating
   missing edge-case coverage for `submitOrder()`. Two unrelated investigative paths, same root
   cause, same file:line.
2. **Two parallel, non-integrated notification-preference systems** (`user_notification_settings`
   vs `notification_preferences`) — found by the Architecture audit via code-import tracing, and
   independently by the Database audit via row-count/code-reference verification, which confirmed
   *both* tables are live and load-bearing (not one dead), sharpening the Architecture audit's
   finding.
3. **Unauthenticated `/api/internal/*/status` endpoints** — found and independently verified safe
   (no payload leakage) by both the Security audit and the Observability audit, via different
   verification methods (one checking the SQL directly, one checking the route code's own
   claims against that SQL).
4. **Provider-call error handling and logging are effectively absent** — the Provider Resilience
   audit found the specific missing-try/catch call sites; the Observability audit independently
   found the same root cause (zero server-side logging in the request path) from the
   whole-codebase angle; both converge on the same conclusion: a real provider failure today
   would be invisible.
5. **Compliance-gate round-trip cost** and the **latent unbounded-list-query risk** were each
   measured directly by the Performance audit and are structurally the same class of "correct
   today only because there's no real data yet" finding the Database and Concurrency audits
   independently raised about other subsystems (over-redemption, migration 008, CHECK
   constraints) — a consistent pattern across this whole report: **the codebase's current safety
   margin comes disproportionately from having almost no real transactional data yet, not from
   guarantees that will hold once it does.**

---

## Overall Verdict

The backend is **architecturally sound and, on the specific dimensions traditionally hardest to
retrofit — SQL injection, IDOR, mass assignment, PII handling — genuinely well-built.** That is
not a small thing, and it means this hardening phase is corrective, not remedial.

It is **not yet a Release Candidate**, for reasons that cluster tightly rather than spreading
thin: a handful of real concurrency bugs in the money-movement core (§4) that ordinary user
behavior — not an adversary — can trigger; a near-total absence of server-side observability for
that same core (§6); a CI pipeline that doesn't gate on its own 69-file test suite (§6/§8); and a
regulated-financial-data retention gap that becomes load-bearing the moment the platform's
already-registered real distributor identity starts handling real transactions (§2). Every one of
these is well-understood, precisely located, and — per the technical debt ranking that follows —
fixable without a redesign.

Full prioritization and effort estimates: [`BACKEND_TECHNICAL_DEBT.md`](BACKEND_TECHNICAL_DEBT.md).
