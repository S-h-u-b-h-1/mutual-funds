# Frontend audit report

Audit date: 1 August 2026
Scope update: customer-experience release audit across navigation, global search, Stocks IA,
Invest dashboard, public route access, mobile overflow, accessibility skip target, lint, build and
browser smoke checks.

## 1 August 2026 findings and fixes

| Severity | Finding | Fix / disposition |
|---|---|---|
| P1 | The app shell and several route pages both used `id="main-content"`, creating duplicate IDs and an inconsistent skip-link target. | Changed the universal skip target to `#app-content` in `frontend/app/layout.js`. Browser check confirms exactly one shell target and no duplicate shell/page conflict. |
| P1 | Global search still behaved like a mutual-fund-only command palette after Stocks became a first-class product area. | Extended `/api/search` and `Search.jsx` to route to Stocks, stock screener, sectors, Learn, Markets, Portfolio and Invest surfaces. Company/sector hits remain backend-driven and appear only when real rows exist. |
| P1 | The authenticated Invest dashboard did not immediately answer the customer’s key questions: net worth, today’s change, gain, invested amount, freshness and action required. | Reworked `InvestDashboard` metric hierarchy using existing backend summary/data-quality fields; no frontend-only financial business logic or fake values were added. |
| P2 | `/learn/stocks` was initially treated as a private workspace route during browser verification. | Added `/learn` to the public research route allowlist so stock learning remains open like mutual-fund research. |
| P2 | The public domain previously served a stale 404 for newly added Stocks routes after deployment. | Purged the Vercel CDN cache after deploy; production `/stocks` returned 200 and matched the new route. |

## 1 August 2026 validation evidence

- `npm run lint --prefix frontend` passed.
- `npm run build --prefix frontend` passed; 113 App Router pages generated.
- `npm test --prefix frontend` is blocked by the existing `DATABASE_URL` guard before collecting tests.
- Browser checked `/`, `/stocks`, `/invest` redirect-to-login, global search, and mobile widths 320/390.
- Search query `stocks` returned the Stocks workspace and navigated to `/stocks`.
- Browser console had no application errors; only expected development-mode framework messages locally.
- Horizontal overflow check passed on desktop and 320px Stocks route.

## Remaining customer-experience risks

- Full authenticated Invest, Portfolio, SIP, Redemption and Switch journey verification still needs production-like test credentials and a configured database.
- Browser matrix verification for Safari, Firefox, Edge and physical devices remains required before launch sign-off.
- Error-state simulation for 401/403/404/409/422/429/500/offline/timeout is not yet exhaustive across every API caller.
- Stock company, sector, timeline and commodity richness depends on Claude-populated backend contracts; the frontend currently renders honest unavailable states.

Audit date: 26 July 2026
Scope: public, Investor, Advisor, Operations, Management and internal routes in `frontend/app`.

## Findings and fixes

| Severity | Finding | Fix / disposition |
|---|---|---|
| P0 | The production build prerendered `/internal/neon-status` and failed when Supabase/Neon DNS was unavailable. | Added `dynamic = "force-dynamic"`; the diagnostic remains live-only and no longer blocks release builds. |
| P1 | `/invest/transactions` showed an error but offered no recovery action. | Added a shared-style refresh control, explicit loading semantics and a “Try again” action. |
| P1 | Full database-backed test suites cannot start without `DATABASE_URL`. | Documented as an environment gate; no product workaround or fake data was introduced. |
| P2 | Internal health/data routes call external services during build or request rendering. | Build now succeeds with graceful service warnings; production must provide service DNS and credentials. |
| P2 | Advisor, Operations and Management investor workspace routes are permission-aware shells while their scoped read/write contracts remain incomplete. | Kept data unavailable states truthful and recorded the dependencies in `FRONTEND_CONTRACT_GAPS.md`. |
| P2 | Browser automation could not be repeated in this sandbox through the CLI wrapper. | Existing representative Playwright evidence remains valid; release still requires the full browser/device matrix. |
| P3 | Dialogs expose semantic `role="dialog"` and close controls, but a formal focus trap and focus return are not standardized across every modal. | Recorded as technical debt; do not block staging, but complete before broad public launch. |
| P2 | NAV freshness was previously implicit in portfolio and eligibility views. | Surface backend `navDate`, stale-day counts and coverage in Portfolio, Dashboard, Redemption and Switch without calculating financial values in the client. |
| P2 | Recoverable API errors could lose rate-limit timing and support correlation references. | `investApi` now preserves 429/Retry-After and support/request IDs for safe retry and escalation messaging. |

## Route coverage

All 97 App Router pages were inventoried. Investor routes have dedicated loading, empty and error
states for the live journeys (readiness, purchase/orders, portfolio, SIPs, redemption, switch,
documents, notifications and transactions). Internal and public data pages retain their existing
server-side fallback behavior. Advisor, Operations and Management layouts correctly render
permission-aware “awaiting backend data” states rather than fabricated metrics.

## Interaction review

- Deep links are represented by route-local pages and stable `/invest/*` paths.
- Investor navigation uses native links, so browser back/forward and refresh retain normal browser
  semantics.
- API reads are centralized through `investApi`, `portfolioApi`, `documentsApi`, `notificationsApi`,
  `redemptionApi`, `switchApi` and `sipApi`, with retry, caching and normalized error messages.
- Financial workflows show server status, reference IDs, provider metadata when supplied, next-step
  guidance and support links through `TransactionTimeline`.

## Remaining risks

The remaining risks are environment or backend readiness risks: production service DNS/credentials,
database-backed integration execution, scoped internal-workspace contracts, payment-attempt history,
SIP management mutations, auth rate-limit contracts, and complete browser-matrix verification. No
remaining risk requires inventing frontend business logic.
