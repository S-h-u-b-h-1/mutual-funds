# Frontend audit report

Audit date: 1 August 2026
Scope update: product-experience audit across top-level IA, homepage guidance, stock research
wayfinding, public help access, breadcrumbs, global search and responsive smoke checks.

## 1 August 2026 product-experience findings and fixes

| Severity | Finding | Fix / disposition |
|---|---|---|
| P1 | Public research deep links still depended on local page headings/back links, creating inconsistent recovery paths when users landed from search, Google, or shared links. | Added `ProductBreadcrumbs` to high-traffic mutual-fund research routes: Funds, Compare, Categories, Category detail, Fund detail, AMC index/detail, Performance, News, Status, Data Status, Raw Materials, About, Methodology and public Portfolio. |
| P1 | Desktop and mobile navigation were defined separately, creating drift as Stocks, Markets, Learn and Invest evolved. | Desktop navigation now consumes the shared `NAV_GROUPS` product IA. Top-level areas are Home, Mutual Funds, Stocks, Markets, Portfolio, Learn, Invest, Profile and Help. |
| P1 | `/help` did not exist as a clear recovery/orientation path, and after creation it was initially caught by the auth gate. | Added a public Help Center and added `/help` to the public allowlist. The page explains product boundaries, recovery paths and where to go when stuck. |
| P1 | Homepage still opened as a daily mutual-fund workspace rather than explaining the full customer journey. | Reframed the hero around Research → Learn → Track → Invest, with clear boundaries between stock research and Suasion mutual-fund execution. |
| P2 | Stock and market research routes lacked consistent breadcrumb/back-navigation affordances. | Added reusable `ProductBreadcrumbs` and applied it to Stocks home, Screener, Sectors, Company pages, Markets, Learn and Help. |
| P2 | Global search did not surface Help/Profile/Status recovery destinations. | Added Help Center, Profile and Service Status to the server search surfaces. |
| P2 | The route sitemap omitted the new Stocks/Markets/Learn/Help public product areas. | Added the public product-area routes to `frontend/app/sitemap.js`. |
| P2 | Benchmark review of Screener/Tijori/ValuePickr/BigMint reinforced that research UX should be progressive, source-aware and context-rich rather than metric-dense. | Applied as IA guidance only: no proprietary layout/content copied, and no backend data fabricated. |

## 1 August 2026 product-experience validation evidence

- `npm run lint --prefix frontend` passed.
- `npm run build --prefix frontend` passed with 114 generated App Router pages.
- `npm test --prefix frontend` remains blocked by the existing `DATABASE_URL` safety guard before collecting tests.
- Browser smoke checks passed locally for `/`, `/stocks`, `/stocks/screener`, `/stocks/sectors`, `/markets`, `/learn/stocks` and `/help`.
- Responsive overflow samples passed at 320, 375, 390, 768, 1024, 1440 and 1920 widths across the touched public routes.
- Local browser console had no application errors after fixing the duplicate React key in the Profile menu; only dev-only React/Next messages appeared.
- Follow-up public-route breadcrumb validation is required after the second wayfinding slice is built and deployed.

## Remaining product-experience risks

- Full every-route visual certification still requires production credentials, production provider access and browser/device matrix coverage.
- Authenticated Invest and personal Portfolio workflows were not modified in this slice; they still need real-account verification for launch.
- Stock richness remains backend/data-contract dependent; frontend continues to render unavailable states rather than inferred data.

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
