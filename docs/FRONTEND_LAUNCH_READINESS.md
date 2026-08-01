# MF Pulse frontend launch readiness

Updated 1 August 2026 — product-experience IA slice.

Implemented since the previous note:

- Unified desktop navigation with the shared product IA instead of maintaining a separate desktop menu.
- Added a public Help Center route for orientation, support paths, product boundaries and recovery actions.
- Made Help public in the auth gate so users are not redirected to login when they are stuck.
- Reframed the homepage around Research → Learn → Track → Invest, while keeping stock research separate from mutual-fund execution.
- Added reusable breadcrumbs to public stock/market/learning/help research surfaces.
- Extended global search to include Help, Profile and Service Status.
- Added Stocks/Markets/Learn/Help public areas to the sitemap.

Validation:

- Lint passed.
- Production build passed with 114 generated pages.
- Local browser responsive smoke checks passed at 320, 375, 390, 768, 1024, 1440 and 1920 widths for representative touched routes.
- Search query `help` returns the Help Center.
- `/help` remains public and no longer redirects to login.
- Test execution is still blocked by the configured `DATABASE_URL` safety guard.

Production gate:

- This slice still requires push, production refresh and browser verification on `https://mf-pulse.vercel.app` before it can be called live.

Updated 1 August 2026. The frontend is now being evaluated as a customer-experience release, not
as a collection of pages. Current launch posture: improving, but not final-launch approved until
authenticated journey, browser-matrix and failure-mode verification are complete.

## 1 August 2026 release update

Implemented since the previous readiness note:

- Stocks is now a first-class product area for research, discovery, portfolio intelligence,
  watchlist readiness and learning. It remains separate from Suasion mutual-fund execution.
- New public routes exist for `/stocks`, `/stocks/screener`, `/stocks/sectors`, `/markets`,
  `/markets/raw-materials` and `/learn/stocks`.
- Global search now covers funds, AMCs, Stocks entry points, sectors, learning, portfolio and
  Invest navigation. Company and sector search remains backend-data-gated.
- The universal skip-link target is now route-independent and avoids duplicate `main-content` IDs.
- The Invest dashboard now surfaces net worth, today’s change, total gain, portfolio health,
  invested amount, freshness and action-required state from existing backend contracts.

Current validation:

- Lint passed.
- Production build passed with 113 generated pages.
- Browser smoke checks passed for home, Stocks, search, mobile Stocks and unauthenticated Invest
  redirect.
- Production `/stocks` was verified on `https://mf-pulse.vercel.app` after CDN purge in the prior
  Stocks deployment.

Still required before final launch:

- Authenticated journey verification with real test credentials.
- Full mobile matrix: 320, 375, 390, 768, 1024, 1440 and 1920.
- Browser matrix: Chrome, Safari, Firefox and Edge.
- Simulated API failure matrix: 401, 403, 404, 409, 422, 429, 500, timeout, offline and malformed
  payloads.
- Production validation after each new frontend commit.

Updated 27 July 2026. This checklist records the current frontend state and the backend
dependencies that still prevent a full production launch.

## Implemented workflows

- Investor onboarding and Investment Readiness, including server-backed compliance progress.
- Guided onboarding now includes email verification, backend-derived resume behavior, prefilled
  profile fields, and save-before-advance semantics. See `docs/INVESTOR_ONBOARDING_UX_AUDIT.md`.
- Purchase order draft, review, submit, cancel, retry and truthful lifecycle tracking.
- Portfolio summary, holdings, allocation, performance, history and connect flows.
- SIP creation/listing with provider-backed plan, payment and mandate metadata.
- Redemption by amount or units, live eligibility, payout-bank context, exit-load/tax guidance,
  and transaction timeline.
- Same-AMC switch by amount or units, source-folio validation, linked redemption/purchase legs,
  and separate timelines for both legs.
- Portfolio and dashboard data-quality indicators for NAV coverage, stale holdings and latest NAV
  date; redemption and switch eligibility also show the backend valuation date when supplied.
- Document Vault loading, empty, search/filter, permission and error states.
- Notification inbox with unread count, filtering, pagination, detail timeline, read/unread and
  archive actions.
- Advisor, Operations and Management workspace shells with permission-aware awaiting-data states.

## Remaining backend dependencies

- First-class payment-attempt resource with retry history, idempotency, money state, next action,
  support reference and payment notifications.
- SIP pause, modify, cancel, failed-installment history and mandate retry contracts.
- Advisor-scoped client, household, tasks, notes, communications, meetings and permission APIs.
- Operations queue, detail, resolution and audit APIs.
- Management KPI and drill-down APIs.
- Authenticated rate-limit contracts for login/registration/recovery (status, retry timing and safe
  user-facing error semantics).

## Known limitations

- Switch legs progress independently because the current backend contract does not promise atomic
  settlement; both references and statuses are shown explicitly.
- Local database-backed service tests require `DATABASE_URL`; route and frontend tests run without
  a local database.
- Real provider settlement, payment and document-storage confirmation require production provider
  credentials and backend contracts; the UI does not fabricate these values.
- Account deletion UI remains intentionally hidden until the backend guarantees session revocation
  and a safe confirmation contract.

## Quality evidence

- Production build completed successfully with 97 routes, including the switch and notification
  API surfaces.
- ESLint passed with no warnings. The Transactions route includes a visible retry path for failed
  loads and a refresh control.
- Focused transaction, notification and redemption route tests passed. Switch service coverage is
  present in `switchService.test.js`; execution requires the configured Neon database.
- Chromium and WebKit checks at mobile and desktop widths found no horizontal overflow or console
  errors on protected Investor routes and the public fund screener. Firefox verification is blocked
  by an unrelated local Playwright routing/404 issue; it is not represented as passing evidence.
- The current test run has 53 passing files, 296 passing tests and 176 skipped tests; 17 database-backed
  files (34 tests) are blocked by the missing `DATABASE_URL`.
- Native form controls, semantic headings, status roles, alert regions, dialog roles and visible
  focus styles are used across the implemented journeys. Full account-based manual coverage still
  depends on production test credentials.

## Launch gate

The frontend is conditionally ready for contract-backed staging verification. Before public launch, run the
authenticated end-to-end suite against production-like provider sandboxes, verify real payment and
document callbacks, complete a browser matrix (Chromium, Safari and Firefox), and close the
backend dependencies listed above.
