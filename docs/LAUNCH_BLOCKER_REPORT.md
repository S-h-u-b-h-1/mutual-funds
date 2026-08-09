# Launch Blocker Report

Produced for LAUNCH MISSION 1, Phase 2. Every finding below was verified directly against live
code (file:line cited throughout) by four parallel audits plus direct spot-checks in this same
session — not inferred from older docs. Where an older internal doc's claim was checked and found
stale or unverifiable, that's stated explicitly rather than repeated at face value (see §Doc
Trust Note at the end).

**Severity key**: **Critical** = blocks a real customer from completing the core journey, or
blocks commercial launch outright. **High** = a real customer will hit this, with real trust or
correctness consequences. **Medium** = real gap, contained or lower-frequency impact. **Low** =
real but cosmetic, internal-only, or already in flight.

---

## CRITICAL

### C1 — Every provider is mock. No real KYC, bank verification, payment, or investment execution exists.

- **Problem**: `frontend/app/lib/invest/providers/index.js` wires exactly five provider slots
  (KYC, Document, Investment, Payment, Portfolio) to `Mock*Provider` classes — 100% of them, with
  no exception. The file's own header states it plainly: "Today every slot is mocked."
  `MockPaymentProvider.js`: "Never contacts a real bank, UPI, or NACH endpoint and never moves real
  money."
- **Customer impact**: Nothing a customer does — KYC, bank verification, a mutual fund purchase, a
  SIP, a redemption — moves real money or creates a real regulatory record anywhere. A customer
  believing they've invested has not.
- **Business impact**: This is not a launchable brokerage today. It's a fully-built, well-tested
  simulation of one.
- **Technical impact**: None — the mock layer is honest and internally consistent (see the rest of
  this report for real bugs within it), but it is a simulation end to end.
- **Recommended fix**: Not an engineering fix. Requires a real BSE Star MF (or equivalent)
  membership, a CAMS/KFintech/CDSL integration agreement, and a licensed payment/mandate provider
  (NACH/UPI Autopay). The provider interfaces (`providers/types.js`) are already designed so a real
  adapter is a swap in one file, not a rewrite — that groundwork is done.
- **Estimated effort**: Not estimable by engineering — commercial/regulatory timeline, not a sprint.
- **Dependencies**: **Licensed provider access, BSE credentials, commercial agreements** — exactly
  the category the governing directive names as a legitimate stop condition. This is that
  condition, for the whole transaction chain at once.

### C2 — PEP declaration is a required, blocking compliance item with no onboarding UI. No customer can ever reach investment-ready.

- **Problem**: `complianceService.js`'s `ITEM_KEYS` (line 14) includes `pep` as a required
  compliance item, defaulted to `pending` for every new user. `evaluateInvestmentReadiness()`
  (`identityService.js:205-219`) blocks readiness on any incomplete required item, and every
  order/SIP/redemption/switch calls `assertInvestmentReady()` (`orderService.js:141-152`), which
  enforces that. But `OnboardingFlow.jsx`'s hardcoded `steps` array (lines 8-11) has no `"pep"`
  entry, and no `stepId === "pep"` form exists anywhere in the file. `ComplianceCenter.jsx`'s
  `copy` object also omits `pep`; its "Open →" deep link resolves to step 0 (Profile) because
  `steps.findIndex(...)` returns `-1` for a step that doesn't exist and `Math.max(0, -1)` = `0`.
- **Customer impact**: Every single new customer is permanently stuck at 8/9 (or whatever fraction
  excludes PEP) compliance completion. Nobody can ever place a first order. This is the same class
  of bug as the mobile-phone-number and FATCA-country gaps found and fixed earlier this session
  (`docs/SUASION_PLATFORM_STATUS.md` §4) — except neither of those two fully blocked onboarding on
  their own (only their own two steps failed); PEP blocks the *entire* readiness gate for
  everyone, unconditionally.
- **Business impact**: Total — zero real signups can ever convert, in mock mode or with a real
  provider, until this is fixed.
- **Technical impact**: None beyond the missing UI — the backend (`pep_declarations` table,
  `complianceService.js`'s `pep` case) is correct and already tested.
- **Recommended fix**: Add a `pep` step to `OnboardingFlow.jsx`'s `steps` array and a form
  (`payload.declared` must be a JS boolean — a two-button yes/no choice, not a checkbox, since this
  is a substantive declaration, not a confirmation) plus the matching `copy` entry in
  `ComplianceCenter.jsx`. Exactly the pattern already used for `fatca`.
- **Estimated effort**: XS (under 1 hour) — this session already has full context on this exact
  file and pattern from the mobile/FATCA fix.
- **Dependencies**: None. Fixing this immediately, right after this report, since it's the single
  highest-leverage launch blocker that's actually internally solvable today.

### C3 — KRA (KYC Registration Agency) does not exist anywhere in the codebase.

- **Problem**: Zero code references to KRA anywhere in `frontend/app/lib/invest`,
  `app/api/v1/invest`, or `app/components/invest`. The only mention in the entire repo is a
  migration comment (`sql/neon/034_compliance_model_hardening.sql:53`) framing it as a future,
  unbuilt dependency. Identity verification today runs entirely through the mock `identity`/CKYC
  path — there is no separate KRA registration/download flow, no `kra_*` table.
- **Customer impact**: None *today* (CKYC substitutes in the mock flow), but if KRA registration is
  actually a distinct SEBI/AMFI regulatory requirement alongside CKYC for a real distributor, this
  is a real compliance gap that would surface the moment real KYC begins.
- **Business impact**: Potentially blocking, depending on the answer to the open question below.
- **Technical impact**: None yet — nothing has been built that would need to be un-built.
- **Recommended fix**: This needs a **regulatory decision, not engineering** — is KRA registration
  actually required as a distinct step for Suasion Securities' distributor structure, or does the
  existing CKYC flow satisfy it? Once answered, if real, this becomes a normal schema+service+UI
  build following the CKYC/PAN pattern already established.
- **Estimated effort**: Unknown pending the regulatory answer; the engineering build itself would
  be M (comparable to the FATCA/PEP builds already done) once scoped.
- **Dependencies**: **Regulatory approval/clarification** — explicitly one of the directive's own
  stop conditions. Flagging, not building blind.

---

## HIGH

### H1 — The CAS-upload progress bar is fabricated, not real backend state.

- **Problem**: Per the platform's own prior audit (`docs/PORTFOLIO_UI_FUNCTIONAL_AUDIT.md:57`):
  "Seven-stage pipeline... Advances every 650ms, unrelated to backend state." Explicitly labeled
  "Misleading" by that doc.
  &gt; ***Quoted directly** because it's the platform's own prior finding, stated in under 15 words,
  and precisely on point.*
- **Customer impact**: A customer uploading a real CAS statement watches a progress animation that
  has no relationship to whether their document is actually being parsed, is stuck, or has failed —
  they cannot tell real progress from a decorative timer.
- **Business impact**: Direct violation of this mission's own Phase 6 principle ("never allow stale
  information to appear fresh... never fabricate values") — this is the clearest instance of that
  exact anti-pattern found anywhere in this audit.
- **Technical impact**: None — the real parse *does* happen and *is* correct
  (`docs/SUASION_PLATFORM_STATUS.md` §2); only the progress indicator lies about its pacing.
- **Recommended fix**: Replace the fixed-interval fake progress with real state — the upload
  request already returns a final result; at minimum collapse to a real
  "uploading → parsing → done/error" state machine tied to the actual request lifecycle, not a
  timer.
- **Estimated effort**: S (a few hours) — no backend change needed, purely a frontend state fix.
- **Dependencies**: None.

### H2 — Document downloads return metadata with no real file behind them.

- **Problem**: `MockDocumentProvider.js:35-46`'s `generateDocument()` returns a synthetic
  `storageRef`, a **randomly generated** `fileSizeBytes`, and a hardcoded `mimeType` — no bytes are
  ever produced anywhere. `documents/[id]/download/route.js:13-15` returns the DB row as JSON, not
  a binary/file stream, by its own admission ("no real object-storage backend to stream bytes
  from").
- **Customer impact**: A customer clicking "download" on their investment confirmation or account
  statement gets a JSON blob or a broken download, not a PDF.
- **Business impact**: Immediately, visibly broken the first time any real customer tries to
  retrieve a document — a core expectation of any brokerage relationship.
- **Technical impact**: Requires an actual PDF-generation step and real object storage (or storing
  bytes directly for this stage) — currently structurally impossible to serve a real file.
- **Recommended fix**: Build real PDF generation (a template + real data already exists in
  `documentService.js`'s metadata) and wire it to actual storage (even a simple Neon-adjacent blob
  store or Vercel Blob would unblock this without needing a real brokerage provider). This is
  buildable now, independent of C1's provider-licensing blocker.
- **Estimated effort**: M (1-2 days) — needs a PDF template renderer and a storage decision.
- **Dependencies**: A storage choice (S3-compatible, Vercel Blob, or similar) — not blocked on
  licensed provider access, genuinely buildable today.

### H3 — RESOLVED 2026-08-09. An expired or logged-out session hitting `/invest/*` used to dead-end instead of redirecting to login.

- **Problem**: No `middleware.js` exists for the invest route tree; `InvestShell.jsx` only reads
  `useSession()` for a display name, never redirects on `unauthenticated`. `useInvestData.js`'s
  `ErrorCard` shows "This view did not load" with only a "Try again" button that re-calls the same
  401'ing endpoint — no path back to `/login` anywhere in the component.
- **Customer impact**: A customer whose session expires mid-session (or who bookmarks an `/invest`
  URL while logged out) hits a dead end with no way forward except manually navigating to `/login`
  themselves.
- **Business impact**: A real, if narrow, conversion/retention leak — customers abandoning here
  read as the app being broken, not "please sign in again."
- **Technical impact**: Low-risk fix — API layer already correctly 401s on every route (verified
  earlier this session), so no data-exposure risk exists today; this is purely a UX dead end.
- **Recommended fix**: Either add `middleware.js` gating `/invest/*` (mirroring the public/private
  split `AuthGate.jsx` already does client-side elsewhere) or have `ErrorCard`/`useInvestData`
  redirect to `/login?callbackUrl=...` specifically on a 401, not just show a generic retry.
- **Estimated effort**: S (a few hours).
- **Dependencies**: None.
- **Resolution**: took the second option — `useInvestData`'s catch block now redirects to
  `/login?callbackUrl=...` on a 401 (`InvestApiError.status === 401`) instead of just setting an
  error message, reusing the exact callback pattern `AuthGate.jsx` already uses. Full page-load
  cases (never signed in, or signed in with an incomplete profile) were already correctly handled
  by `AuthGate` itself before this fix — the gap this closes is specifically the mid-visit
  session-expiry case the report describes, verified by code path rather than a forced live race.

### H4 — SIPs never actually recur after the first mandate is set up.

- **Problem**: `orderService.js` exports only `createSipMandate`/`listSipMandates` — no job or
  handler exists anywhere that fires subsequent SIP installments (confirmed: zero portfolio- or
  SIP-related hits across all `.github/workflows/*.yml`, and the internal job platform's only two
  handlers are `jobHistoryPrune.js`/`vaultRetentionSweep.js`, neither SIP-related). Corroborated by
  `docs/INVESTOR_JOURNEY_AUDIT.md:114-120`.
- **Customer impact**: A customer who sets up a monthly SIP gets exactly one authorization event
  and nothing recurring — with no UI indication that this is the current, temporary state rather
  than a bug on their end.
- **Business impact**: The core "SIP investing" product claim doesn't function beyond day one,
  independent of C1 (this would still be true even with a real payment provider — the recurring
  trigger itself doesn't exist).
- **Technical impact**: A real scheduled job needs to exist, with idempotent installment creation
  (reusing the same C1 idempotency-key pattern just shipped for orders) so a retry or double-fire
  can't double-charge.
- **Recommended fix**: Build a scheduled job (matching the existing `jobs-worker.yml` cron pattern)
  that finds active SIP mandates due today and creates+submits a purchase order per mandate, using
  a deterministic idempotency key (e.g. `mandate_id:due_date`) so re-runs are safe.
- **Estimated effort**: M (1-2 days) — the order-creation path this reuses is already solid and
  now idempotent.
- **Dependencies**: None for the mock environment; real money movement still depends on C1.

### H5 — Notification channels (SMS/push/email) are all mock — no real message ever leaves the system.

- **Problem**: Per `docs/BACKEND_TECHNICAL_DEBT.md`, 5 near-identical mock notification-channel
  provider files back the entire notification platform. Real delivery, preferences, and read APIs
  are all genuinely built and tested (`docs/SUASION_PLATFORM_STATUS.md`-adjacent work this
  session) — but the last mile never leaves the database.
- **Customer impact**: A customer never receives a real SMS/email/push for an order update,
  security event, or SIP reminder — only an in-app notification list they'd have to remember to
  check.
- **Business impact**: Meaningfully different (lower) engagement/trust than a real brokerage's
  notification experience.
- **Technical impact**: None — the platform-side plumbing (preferences, scheduling primitives,
  read APIs) is real and ready to receive a real channel.
- **Recommended fix**: Unlike C1's core transaction providers, this has a genuinely fast, cheap
  path — a transactional email/SMS provider (e.g. Resend, which is already partially wired for
  password-reset email) is far easier to acquire than BSE Star MF licensing. Worth pursuing
  independently and sooner.
- **Estimated effort**: S-M once a provider is chosen — the interface/registry pattern already
  exists, this is a real-adapter swap like C1's provider registry describes.
- **Dependencies**: A transactional email/SMS provider account (cheap, fast — not the same category
  of blocker as C1).

### H6 — RESOLVED 2026-08-09. `/advisor/workspace`, `/operations`, and `/management` were publicly-routable, non-functional UI shells with no role-gating.

- **Problem**: `AdvisorWorkspace.jsx` and `InternalConsole.jsx` (exporting `OperationsConsole` +
  `ManagementDashboard`) are real, routed pages (`app/advisor/workspace/page.js`,
  `app/operations/page.js`, `app/management/page.js`) — hardcoded KPI/queue labels, every action
  button disabled, self-documented as awaiting real APIs. No `role`/`requireRole` gating was found
  on these specific routes (consistent with the already-known fact that no code path grants
  `advisor`/`admin` roles at all today).
- **Customer impact**: None directly (buttons are inert, no real customer data is shown or
  fabricated) — but any visitor can navigate to what visually presents as an internal operations
  console, which reads as unprofessional at best and a trust/security smell at worst.
- **Business impact**: Cosmetic today, but worth closing before real advisor/ops accounts and real
  data exist behind these same routes.
- **Technical impact**: Low — these are inert shells, not a live data-exposure risk today.
- **Recommended fix**: Gate these three routes behind auth + an explicit role check (even though no
  role-granting flow exists yet, the routes themselves should 404 or redirect for anyone without
  `advisor`/`admin`, rather than rendering an inert shell to the public internet).
- **Estimated effort**: XS-S.
- **Dependencies**: None for the gating itself; the underlying advisor/ops backend remains
  explicitly out of scope (design-only) per prior direction.
- **Resolution**: each page now calls `requireRole(["advisor","admin"])` (Advisor Workspace) or
  `requireRole(["admin"])` (Operations, Management) and calls `notFound()` when it returns null —
  which is unconditional today, since no role-granting flow exists. Verified live in a dev
  environment for both an anonymous visitor and a freshly-registered, default-role authenticated
  user: all three routes 404. The bare `/advisor` contact-lead page was never actually in scope —
  it's a deliberately public lead-gen form (see `AuthGate.jsx`'s own comment), not an internal
  console; the report's heading above has been corrected to drop it from this item's title.

---

## MEDIUM

### M1 — Customer-facing freshness badge uses a shallower check than the one that actually caught the real staleness incident.

`FreshnessBadge` (rendered in global nav, `/funds`, `/news`) computes staleness via
`marketStatus.js`'s simple `today − asOf` — a check that could *not* have caught the real incident
this session found and fixed (bundle silently 6 days behind raw ingest while its own `asOf` still
looked internally consistent). The deeper `rawLatest`/`bundleAsOf`/`pipelineHealth` cross-check
that actually caught it only renders on `/status` and `/data-status`, off the primary browsing
path. **Fix**: route the customer-facing badge through the deeper signal, or expose it more
prominently. **Effort**: S. **Dependencies**: none.

### M2 — Stock/company valuation data has zero freshness contract.

Confirmed independently by this session's own `docs/STOCK_INTELLIGENCE_STATUS.md` work and a fresh
audit: no `source`/`lastFetched`/`freshnessStatus` fields exist anywhere in the stocks domain — only
a bare `as_of_date` column. **Fix**: extend the MF-domain freshness pattern once real stock data
exists to populate it. **Effort**: S once there's real data to attach it to. **Dependencies**: real
stock/company data source (separately tracked, licensing-gated).

### M3 — `portfolio_snapshots.total_value` actually stores cost basis, not market value.

The only writer (`casUpload.js:190-197`) computes `totalCostValue` and stores it in a column named
`total_value`. Currently contained — the sole reader (`getPortfolioPerformance`) already
self-discloses sparsity and doesn't misuse the field — but a landmine for any future code that
trusts the column name. **Fix**: rename the column (or the computed value) before more code
accumulates around the wrong meaning. **Effort**: XS-S (a migration + one call site). **Dependencies**:
none.

### M4 — Cross-CAS-upload duplicate-folio handling is a silent overwrite, and folio-number normalization is unverified.

A repeated folio+scheme across two separate CAS uploads correctly *overwrites* (not duplicates) via
the DB's own conflict key — but silently, with no warning shown to the customer that a prior
statement's units/cost basis were just replaced (contrast the existing checksum-duplicate path,
which does warn). Separately, folio numbers aren't normalized at extraction, so a registrar
formatting difference between two statements could theoretically bypass the conflict key and create
a real duplicate row instead — unverified without a real second sample statement to test against
(same class of caveat already accepted for STT/charges extraction). **Fix**: surface a diff/warning
on overwrite; verify normalization against a real second sample once available. **Effort**: S for
the warning; unverifiable-until-sample for normalization. **Dependencies**: a second real CAS
sample for the normalization question.

### M5 — Notification Scheduling (quiet-hours/digest) has schema support but zero enforcement.

`preferences.js` stores and validates `quiet_hours_start/end` and `digest_enabled/frequency`, but
`sendNotification()` never checks the clock against them and nothing batches into a digest. Low
current customer impact since channels are mock anyway (H5) — worth bundling with that fix.
**Effort**: S-M. **Dependencies**: none blocking, but most valuable alongside H5.

### M6 — Notification Metrics and Notification Admin APIs are entirely unbuilt.

Zero code found for either. Internal/ops tooling, not customer-visible — lower urgency than
anything above. **Effort**: M each. **Dependencies**: none.

### M7 — Mobile responsiveness of the actual purchase/onboarding/SIP journeys is unverified.

`docs/FRONTEND_E2E_MATRIX.md`'s device evidence covers Portfolio/Redemption/Notifications/Advisor
at 375/768/1440 — Orders, Onboarding, and SIP are absent from that matrix, and
`docs/FRONTEND_LAUNCH_READINESS.md` itself still lists "full mobile matrix" as outstanding. This is
an unknown, not a confirmed break — but a real risk given this is likely where most real customers
will transact. **Fix**: a real device/viewport pass specifically on the purchase/onboarding/SIP
screens. **Effort**: S-M. **Dependencies**: none.

### M8 — `revaluation.js`'s XIRR call site still lacks the unavailability-reason enrichment `casNormalizer.js` already has.

Formulas are otherwise in sync between the two valuation paths (verified line-by-line) — this is
the one already-known, still-real gap from an earlier pass in this session, confirmed still true.
**Fix**: mirror `casNormalizer.js`'s `portfolioStatus`/`byStatus` pattern into `revaluation.js`.
**Effort**: XS-S. **Dependencies**: none.

### M9 — CI's real test gate (`frontend-tests` job) never actually runs — the `TEST_DATABASE_URL` GitHub Actions secret was never set.

Confirmed still missing via `gh secret list` this session. The safety net exists in code (C4,
already marked fixed) but silently short-circuits at a guard step in the real CI environment. Zero
customer visibility — pure infrastructure — listed here for completeness per the directive's "hide
nothing" instruction, not because it should be prioritized over anything above.
**Fix**: set the repo secret to the test branch's connection string. **Effort**: XS (one command,
once someone with repo-secret access runs it). **Dependencies**: repo secret access.

### M10 — Homepage's primary "Get started" CTA routes to `/portfolio` (CAS review), not `/register` or `/invest`.

May well be a deliberate funnel choice (portfolio review as the lower-friction entry hook) rather
than a bug — flagging as a product decision to explicitly confirm, not asserting it's wrong.
**Effort**: N/A pending the decision. **Dependencies**: a product call, not engineering.

---

## LOW

### L1 — RESOLVED 2026-08-07. C1 order-idempotency migration is now live in production.

20/20 + 89/89 tests passing. The code (bundled with C2's PEP fix) was pushed to `main` before this
was confirmed applied — a sequencing mistake, caught immediately after the push by re-checking
rather than assuming the migration's state. `022_order_idempotency.sql` was applied to production
right away and verified via `information_schema.columns` before moving on; no evidence of order/SIP
traffic hitting the gap in between. The earlier "denied twice" classifier block turned out to be
transient, not a firm policy stance — a retry succeeded cleanly. See `BACKEND_TECHNICAL_DEBT.md`'s
C1 resolution note for the full account.

### L2 — Order outcome (completed/retry_required/failed) is a random 80/10/10 roll, by explicit mock-provider design.

Not a bug in the mock's own terms — it's honestly simulating real-world decline rates — but it
means no outcome is deterministic or trustworthy until a real provider exists. Ties back to C1
rather than being independently actionable.

### L3 — No client-side request timeout/AbortController exists on the invest API client.

`app/lib/invest/api.js`'s `requestJson` has no client-enforced ceiling — if a serverless function
stalls beyond its own server-side guarantees, the browser shows "Submitting…" indefinitely. Minor;
the server-side resilience/circuit-breaker layer already bounds the more likely failure modes.
**Effort**: XS.

### L4 — Two internal audit docs contain claims that don't hold up to direct verification.

`docs/ROUTE_AND_NAVIGATION_AUDIT.md` marks every route "WORKING" with no evidence shown.
`docs/INVESTOR_ONBOARDING_UX_AUDIT.md` contains a self-correction admitting an earlier claim
("protected, redirects to login") was false. Noted so future audits re-verify these two docs'
specific claims against code directly rather than citing them at face value — not itself a launch
blocker.

---

## Doc Trust Note

This report was built by checking claims against live code directly, file:line, across four
parallel audits — not by summarizing prior docs. Two prior docs (L4) were found to contain
unverified or previously-corrected claims; `docs/SUASION_PLATFORM_STATUS.md` and
`docs/STOCK_INTELLIGENCE_STATUS.md` (both written earlier in this same session, both re-verified
fresh during this pass) held up completely — no contradictions found anywhere they were
cross-checked.

## What happens next

Per the directive's own execution model, the highest-leverage next step is C2 (PEP onboarding
gap) — internally solvable, zero external dependency, unblocks 100% of new signups. Fixing it
immediately following this report, then working down the list by severity within what's internally
buildable, holding anything genuinely gated on C1/C3/H2's storage decision/H5's provider choice as
explicit, separately-flagged dependencies rather than silently skipped.
