# MF Pulse — production, data, API, UI, security and launch audit

**Audit date:** 2026-09-08 (Asia/Kolkata)

**Scope:** read-only review of the repository, production public routes, static data artifacts, migrations, test suites and documented launch blockers. No code, schema, deployment or production data was changed.

## 1. Executive summary

MF Pulse is a substantial mutual-fund research product with a working public production site, a broad Next.js route/API surface, a documented ingestion pipeline, and a meaningful amount of deterministic calculation code. It is not yet ready to present as a complete investment platform or as a fully populated research terminal.

The strongest part is the public evidence-led research shell: AMFI-derived identity/NAV coverage is broad, missing values are often shown as unavailable, freshness is disclosed, and anonymous users can inspect research without creating an account. The weakest parts are the gap between universe coverage and research-ready coverage, inconsistent freshness between raw data and site bundles, a broken global-search interaction at the audited 1200px production viewport, portfolio values calculated from two different sources, fail-open authentication rate limiting, and the fact that all KYC, payment, document, portfolio and investment providers are mocks.

### Readiness scores

These are judgement scores from the evidence below, not SLA measurements or a regulatory certification.

| Area | Score | Verdict | Why |
|---|---:|---|---|
| Public research UX | 65% | PARTIAL | Core pages load and disclose gaps, but search is broken at the audited responsive breakpoint and comparison semantics are mismatched. |
| Data pipeline and freshness | 55% | PARTIAL / STALE | Scheduled refresh exists; raw NAV reaches 2026-09-06 while public bundles shown on the site remain at 2026-09-04 and monthly flow data is 68 days old. |
| Research-data completeness | 42% | PARTIAL | Identity is strong; 1Y+ history, factsheet metadata, holdings and expense ratios are sparse. |
| Financial calculations | 60% | PASS WITH OBSERVATION | XIRR/CAGR/risk code is deterministic and tested, but portfolio XIRR uses today rather than the latest NAV date and valuation/report totals can diverge. |
| Portfolio intelligence | 35% | INCOMPLETE | Authentication, CAS normalization and analytics exist; live-user DB validation was not possible and the response persists mixed valuation sources. |
| API/backend | 55% | PARTIAL | 99 production route files and broad auth/user-scoped families exist; integration execution was blocked by DB DNS/network failure. |
| Security and privacy | 60% | PASS WITH OBSERVATION | Server-side user scoping and internal-secret gates are present; auth rate limiting explicitly fails open when Postgres is unavailable. |
| Database readiness | 55% | UNVERIFIED | Migrations and user-scoped schema are extensive; live schema/RLS/drift checks could not be run. |
| Commercial/investment readiness | 25% | INCOMPLETE / PLACEHOLDER | All five investment provider slots are mock; no real KYC, payment, custody/order execution or binary document storage. |
| Overall production readiness | **45%** | **PARTIAL — not launch-ready as a real investment platform** | Suitable for public research beta; not suitable for live-money execution or a “complete” data terminal without the P0/P1 work below. |

### Final verdict

**Public research beta: PASS WITH OBSERVATION.**

**High-trust investment research terminal: PARTIAL / STALE.**

**Real-money investing platform: INCOMPLETE / PLACEHOLDER.**

**Production launch: NO-GO until the P0/P1 issues are closed and live DB isolation, integration journeys and delivery monitoring are verified.**

## 2. Status and severity taxonomy

Statuses used in this report: `PASS`, `PASS WITH OBSERVATION`, `PARTIAL`, `INCOMPLETE`, `PLACEHOLDER`, `BROKEN`, `INCORRECT`, `STALE`, `UNSAFE`, `UNVERIFIED`, `DEAD CODE`.

Severity: `P0` blocks safe operation or creates a material correctness/security risk; `P1` blocks a core journey or commercial trust; `P2` is a meaningful quality or usability defect; `P3` is polish, documentation or low-risk cleanup.

## 3. Architecture map

```text
AMFI daily NAV / monthly reports / AMC factsheets / news feeds
             |
             v
Python ingestion + parsers + dbt + scheduled GitHub Actions
             |
             +--> Postgres / Neon migrations and operational tables
             |
             +--> committed public bundles (funds.json, daily.json,
                  fieldCoverage.json, metadata/derived artifacts)
             |
             v
Next.js App Router (frontend/app)
  |-- public research pages: funds, fund, AMC, categories, compare,
  |   signals, brief, news, data-status, stocks/markets
  |-- authenticated personal pages: dashboard, portfolio, profile,
  |   sync, watchlists, investor workspace
  |-- server API: /api, /api/v1, /api/internal, webhooks
  |-- deterministic JS calculation layer: health, risk, CAGR, XIRR,
      portfolio revaluation, overlap and allocation
             |
             +--> Auth.js / session user scoping
             +--> Neon reads and writes
             +--> mock investment-provider registry
             +--> Sentry / observability / scheduled pipeline status
```

Primary code anchors: [root layout](/Users/shubhaang/MFworking/frontend/app/layout.js:12), [AuthGate](/Users/shubhaang/MFworking/frontend/app/components/AuthGate.jsx:21), [provider registry](/Users/shubhaang/MFworking/frontend/app/lib/invest/providers/index.js:1), and [production refresh workflow](/Users/shubhaang/MFworking/.github/workflows/production-refresh.yml:1).

## 4. Feature inventory

| Feature area | Evidence | Status | Assessment |
|---|---|---|---|
| Fund universe | 14,339 schemes in current bundle | PASS WITH OBSERVATION | Universe/routing coverage is broad; “scheme tracked” and “priced” are not the same denominator. |
| Latest NAV | AMFI daily bundle and live data-status view | PASS WITH OBSERVATION | Raw latest rows reach 2026-09-06; public complete bundle is 2026-09-04. |
| Fund screener | `/funds`, filters, sorting, 80-row page | PASS WITH OBSERVATION | Working UI; only 29.17% of universe has 90d history and 0% has 1Y+ in current artifact. |
| Fund detail | `/fund/[scheme_code]` | PASS WITH OBSERVATION | Route and detail engine exist; deeper factsheet/portfolio fields are sparse. |
| AMC research | `/amc`, `/amc/[amc]`, `/compare` | PARTIAL | AMC comparison works as an AMC view, but product copy and homepage imply fund-level comparison too. |
| Category research | `/categories`, dynamic category pages | PASS WITH OBSERVATION | Category labels contain malformed plural variants. |
| Signals/brief/news | `/signals`, `/brief`, `/news` | PASS WITH OBSERVATION | Monthly flow data is explicitly lagged and not AMC-level; absence is disclosed. |
| Portfolio import/CAS | parser, normalizer, reconciliation, upload APIs | PARTIAL | Strong static implementation and tests; live DB/integration path unverified. |
| Portfolio valuation | revaluation, XIRR, health, allocation | INCORRECT | Portfolio report and persisted metrics mix stored current values with live NAV valuation. |
| Watchlists/saved research | sync and watchlist APIs, local fallback | PASS WITH OBSERVATION | Anonymous local-only fallback is useful but can hide cloud persistence failure. |
| Stock intelligence | `/stocks/*`, sectors, markets, commodities | PARTIAL | Broad route surface; not the main MF audit focus and live depth was not fully benchmarked. |
| Investor onboarding | `/invest/*`, compliance APIs | PLACEHOLDER | UI/service architecture exists, but provider registry is mock-only. |
| Orders/SIPs/redemptions/switches | invest APIs and services | PLACEHOLDER | The order lifecycle is a simulation; it cannot move money or units. |
| Documents | upload/generate/download/share APIs | PLACEHOLDER | Download returns JSON metadata/synthetic storage reference, not document bytes. |
| Notifications | in-app notification API, provider abstraction | INCOMPLETE | In-app persistence exists; SMS/push/email delivery is not real. |
| Operations/admin | role-gated pages and internal APIs | PASS WITH OBSERVATION | Role/secret gates are present; live authorization and monitoring need environment verification. |

## 5. UI control inventory

| Surface/control | Observed behavior | Status |
|---|---|---|
| Header search at 1200px | Launcher dispatches an event; dialog opens inside a hidden desktop nav, with zero-size/non-focusable input. | **BROKEN P1** |
| Header responsive navigation | Mobile/tablet header shows Search, Dark, Sign in and Menu; primary desktop nav is hidden below `xl`. | PASS WITH OBSERVATION |
| Funds filters | Search, plan, option, category, AMC, AUM, expense, sort and Apply filters are present. | PASS |
| Funds result evidence | Displays Health, 1M, 1Y, 90d volatility, drawdown and NAV date; missing 1Y is visible. | PASS WITH OBSERVATION |
| Category selector | Includes malformed/duplicate labels such as `Childrens'`/`Children’s`, `Debts`, `Equitys`, `Indexs`. | **PARTIAL P2** |
| Compare controls | AMC search/add, 2–4 selection, Clear, Copy link, Save workspace. | PASS WITH OBSERVATION |
| Compare methodology | Explicitly says AMC score is unavailable and fund families are approximated by scheme names. | PASS WITH OBSERVATION |
| Portfolio anonymous state | Clear sign-in gate; no sensitive portfolio data shown. | PASS |
| Freshness/status | Shows operational state, dates, source labels, bundle-vs-raw explanation and pipeline runs. | PASS WITH OBSERVATION |
| Missing-data disclosure | Site says NFOs, mergers, SEBI circulars and AMC announcements are not wired; flow/news gaps are disclosed. | PASS |
| Investment UI | Pages and services exist, but copy such as “submitted to the investment service” can sound more production-real than the mock provider warrants. | **INCOMPLETE P1** |

## 6. Route matrix

### Code-defined page inventory

67 page route files were found under `frontend/app`, including:

`/`, `/about`, `/advisor`, `/advisor/workspace`, `/amc`, `/amc/[amc]`, `/analytics`, `/benchmark/[slug]`, `/brief`, `/categories`, `/categories/[category]`, `/compare`, `/dashboard`, `/data-quality`, `/data-status`, `/discover`, `/forgot-password`, `/fund/[scheme_code]`, `/funds`, `/help`, `/internal/data-completeness`, `/internal/neon-status`, `/internal/system-health`, `/invest`, `/invest/advisor`, `/invest/compliance`, `/invest/documents`, `/invest/more`, `/invest/notifications`, `/invest/onboarding`, `/invest/orders`, `/invest/portfolio`, `/invest/redeem`, `/invest/sips`, `/invest/switch`, `/invest/transactions`, `/learn`, `/learn/stocks`, `/login`, `/management`, `/manager/[slug]`, `/market-map`, `/markets`, `/markets/raw-materials`, `/methodology`, `/news`, `/operations`, `/performance`, `/portfolio`, `/profile`, `/profile/setup`, `/register`, `/research`, `/reset-password`, `/signals`, `/signals/[amc]/[cat]`, `/status`, `/stocks`, `/stocks/[id]`, `/stocks/company/[identifier]`, `/stocks/demo`, `/stocks/research-desk`, `/stocks/screener`, `/stocks/sectors`, `/stocks/sources`, `/stocks/strategies`, `/stocks/universe`.

### Live production sample

| Route | Result | Status |
|---|---|---|
| `/` | Public page loaded; 14,339 schemes, 53 fund houses, latest bundle 2026-09-04; explicit missing-feed disclosure. | PASS WITH OBSERVATION |
| `/data-status` | Page loaded; “Degraded / stale”; raw latest 2026-09-06, site bundle 2026-09-04, flow month 2026-07-01. | STALE P1 |
| `/funds` | Screener loaded; 14,098 priced, 4,237 with risk, 0 with 1Y history; malformed category options visible. | PARTIAL P1/P2 |
| `/compare` | AMC comparison loaded; 47 AMCs, no frontend AMC score, approximated fund families, 1Y averages unavailable. | PARTIAL P1 |
| `/portfolio` | Correct anonymous sign-in gate. | PASS |
| `/login`, `/register` | Auth routes exist and are wired to Auth.js credentials/magic-link flows. | UNVERIFIED end-to-end |
| `/invest/*` | Code-defined private surfaces; not exercised with a real account because that would require credentials and live state. | PLACEHOLDER / UNVERIFIED |
| `/operations`, `/management`, `/advisor/workspace` | Server page code uses role gates/notFound. | PASS WITH OBSERVATION |
| `/internal/*` | Internal status surfaces exist; secret/role behavior not live-tested. | UNVERIFIED |

## 7. API matrix

99 production route files were found under `frontend/app/api`: 85 under `/api/v1`, 6 under `/api/internal`, plus auth, freshness, search, watchlist-intelligence and webhook routes. The tree also contains 49 route test files, excluded from the production count.

| API family | Scope | Auth posture | Status |
|---|---|---|---|
| `/api/auth/*` | Auth.js, register, forgot/reset password | Auth-provider flow plus rate limiting | PASS WITH OBSERVATION |
| `/api/search` | Public fund/search lookup | Public by design; parameterized DB/query paths | PASS WITH OBSERVATION |
| `/api/freshness` | Public freshness JSON | Public aggregate data | PASS |
| `/api/v1/stocks/*`, sectors, commodities | Public research data | Public by design | PASS WITH OBSERVATION |
| `/api/v1/sync/*` | User comparisons, notes, history, collections, watchlists | `requireUser()` found throughout | PASS WITH OBSERVATION |
| `/api/v1/portfolio/*` | Upload, holdings, intelligence | `requireUser()` found | PARTIAL; live isolation unverified |
| `/api/v1/invest/*` | Compliance, profile, orders, SIP, docs, portfolio | `requireUser()` found throughout | PLACEHOLDER; all providers mocked |
| `/api/v1/internal/alerts/run` | Cross-user alert evaluation | Shared internal secret | PASS WITH OBSERVATION |
| `/api/internal/*` | Jobs/providers/events/reconciliation/webhook status | Shared internal secret or role gate | PASS WITH OBSERVATION |
| Webhooks | Provider callback endpoint family | Signature/replay logic present in code/tests | UNVERIFIED in production |

Static auth inventory found 85 `/api/v1` route files in the examined set; 14 are intentionally public research/data routes and 71 use `requireUser()` or `requireRole()`. This is a code-level result, not proof of deployed behavior.

## 8. Database report

### Schema strengths

- Neon migration set spans 001–039 and covers users, portfolios, holdings, transactions, notifications, orders, compliance, provider registry, jobs, events, webhooks and reconciliation.
- Financial columns in the reviewed Neon schemas use numeric/decimal types rather than floating-point storage for core money values.
- User-scoped tables have `user_id` columns and supporting indexes; server route code generally scopes reads/writes with the authenticated user ID.
- The Neon schema comments explicitly state that Neon is server-only and does not use Supabase RLS; correctness therefore depends on route-level authorization and query scoping.
- Supabase-era schemas include RLS policies, but the application’s current Neon path is a distinct security model and must not be assumed to inherit those policies.

### Database risks

| Finding | Status |
|---|---|
| Live Neon connectivity/DNS | UNVERIFIED: read-only query could not run because the environment could not resolve the test-branch host; the requested escalated check was rejected by the environment reviewer. |
| Migration drift | UNVERIFIED: static migration review is not a replacement for `schema_version`, indexes, constraints and row counts from the deployed branch. |
| RLS/isolation | UNVERIFIED: Neon’s documented server-only/no-RLS model is acceptable only if every route remains user-scoped. Needs live negative tests. |
| Data count labels | PARTIAL: `/data-status` shows `847,395` as “Total schemes” and “NAV rows”, while the public bundle says 14,339 schemes; likely historical NAV-row count, but the label is ambiguous and can mislead. |
| Transactional writes | PASS WITH OBSERVATION: portfolio intelligence inserts metrics/events/reports and updates portfolio state in one request without an explicit transaction visible in the route. Failure mid-request could leave partial cache rows. |

## 9. Data coverage report

Current artifacts: [coverage dashboard](/Users/shubhaang/MFworking/data/warehouse/coverage_dashboard.json:1), [field coverage](/Users/shubhaang/MFworking/data/warehouse/field_coverage.json:1), [coverage KPIs](/Users/shubhaang/MFworking/data/warehouse/coverage_kpis.json:1), and [trust dashboard](/Users/shubhaang/MFworking/data/warehouse/trust_dashboard.json:1).

| Field/metric | Current coverage | Verdict |
|---|---:|---|
| Scheme universe | 14,339 / 14,339 (100%) | PASS WITH OBSERVATION |
| AMC/category/asset class identity | 100% | PASS |
| Latest NAV | 14,098 / 14,339 (98.32%) | PASS WITH OBSERVATION |
| 90-day NAV history | 4,183 / 14,339 (29.17%) | PARTIAL |
| 1M return | 4,218 / 14,339 (29.42%) | PARTIAL |
| 3M return | 4,164 / 14,339 (29.04%) | PARTIAL |
| 6M/1Y/3Y/5Y fields in current artifact | 0% | **INCOMPLETE P1** |
| Volatility/drawdown | 29.17% universe; 97.62% investable denominator | PARTIAL; denominator-sensitive |
| Benchmark | 75.49% universe; 62.60% investable | PARTIAL |
| AUM | 884 / 14,339 (6.17%) | PARTIAL |
| Expense ratio | 171 / 14,339 (1.19%) | PARTIAL / materially sparse |
| Manager | 772 / 14,339 (5.38%) | PARTIAL |
| Riskometer | 665 / 14,339 (4.64%) | PARTIAL |
| Holdings | 241 / 14,339 (1.68%) | PARTIAL / weak for portfolio research |
| Sector allocation | 110 / 14,339 (0.77%) | PARTIAL |
| Factsheet/documents | 884 / 14,339 (6.17%) | PARTIAL |
| SIP minimum | 0% | INCOMPLETE |
| Lock-in, turnover, debt maturity, duration, YTM | No populated field in current evidence | INCOMPLETE |

The denominator matters: investable-scheme coverage is substantially better for recent returns, but the public screener still shows high health grades for funds where 1Y is unavailable. The data is not fabricated; the ranking design does not sufficiently prevent short-history funds from looking like fully researched leaders.

### Conflicting internal artifacts

`data/warehouse/coverage.json` is dated 2026-06-23 and reports materially different readiness and coverage numbers from the current 2026-09-06 dashboard. `docs/TRUST_AUDIT.md` explicitly says its 100/100 score is superseded. This is good historical disclosure, but stale artifacts remain discoverable and could be mistaken for current truth.

## 10. Freshness and source lineage

Production observations from the public site on 2026-09-08:

- Homepage: latest NAV bundle shown as 2026-09-04; 14,339 schemes tracked; 53 fund houses.
- `/data-status`: raw/latest NAV available through 2026-09-06, with 8,680/8,701 funds carrying that date; complete public site bundles remain 2026-09-04.
- `/data-status`: monthly flow reporting is 2026-07-01, shown as 68 days old and degraded/stale.
- Pipeline monitor: `nav_daily` displayed 100% success, 210 total runs, zero consecutive failures and no last failure.
- Homepage itself discloses that NFOs, mergers, SEBI circulars and AMC announcements do not have a clean automated feed.

**Assessment:** freshness logic is unusually transparent, but the product still presents two dates—raw warehouse freshness and bundle freshness—without making the distinction equally prominent on every research page. The current public research contract should choose one primary “as-of” date per metric family and show raw-vs-complete-bundle status consistently.

## 11. Financial validation

### Positive findings

- XIRR uses dated cash flows, checks for sign change, handles non-convergence/null results and has a passing 10% test vector.
- CAGR conversion is separated from shorter-period cumulative returns.
- Risk code documents required history and uses daily returns for volatility/drawdown; missing history is generally surfaced rather than invented.
- Portfolio performance leaders exclude unresolved, unreconciled, missing-cost or too-stale holdings in the dedicated leader engine.

### Material findings

1. **P1 INCORRECT — XIRR terminal date is today, not the latest NAV date.**  [revaluation.js](/Users/shubhaang/MFworking/frontend/app/lib/portfolioImport/revaluation.js:61)–[revaluation.js](/Users/shubhaang/MFworking/frontend/app/lib/portfolioImport/revaluation.js:66) appends current market value with `new Date().toISOString()` even when the valuation is based on an older official NAV. Weekend/holiday/stale-data portfolios can therefore receive a different XIRR purely because the clock moved.
2. **P1 INCORRECT — portfolio report mixes valuation sources.**  [portfolio intelligence route](/Users/shubhaang/MFworking/frontend/app/api/v1/portfolio/intelligence/route.js:62)–[route.js](/Users/shubhaang/MFworking/frontend/app/api/v1/portfolio/intelligence/route.js:115) persists metrics and `portfolio.total_value` from `buildHealthReport(rawHoldings)` while storing invested value, gain/loss and XIRR from live `revaluePortfolio`. A user can see a live-valued XIRR beside a stored/upload-time current value.
3. **P2 OBSERVATION — XIRR is Newton-only.**  [xirr.js](/Users/shubhaang/MFworking/frontend/app/lib/portfolioImport/xirr.js:1) has sensible rejection guards but no bracketed fallback or multiple-root selection. This is acceptable if “not available” is the contract, but edge-case coverage should be explicit.
4. **P2 OBSERVATION — risk-free rate is a hardcoded methodology input.**  The risk engine uses 6.5% by default; that needs an as-of date and governance policy if Sharpe/Sortino become public metrics.
5. **P2 OBSERVATION — no live transaction/account test.**  The static test suite is not evidence that production holdings, dates, duplicate rows, switch flows or provider callbacks behave correctly against the deployed DB.

## 12. Portfolio/CAS audit

| Area | Finding | Status |
|---|---|---|
| CAS parsing | Parser, normalization, matching and reconciliation modules exist with focused tests. | PASS WITH OBSERVATION |
| User scoping | Portfolio APIs call `requireUser()` and use the session user ID. | PASS WITH OBSERVATION; live isolation unverified |
| Unresolved holdings | Returned explicitly by intelligence response; excluded from valuation/health totals. | PASS WITH OBSERVATION |
| NAV freshness | Holding-level date/stale badges exist; value can still use an older NAV and is flagged. | PASS WITH OBSERVATION |
| Current value source | Raw holding current values continue to feed health/allocation persistence while revaluation feeds summary. | **INCORRECT P1** |
| XIRR | Correct sign convention for purchases/SIPs/switches/redemptions; terminal date bug above. | PARTIAL |
| Dividends | Dividend reinvestment is treated as unit conversion; payout is an inflow. | PASS WITH OBSERVATION |
| Portfolio overlap | Bounded by holdings/sector coverage; not a universal fact across the 14,339-scheme universe. | PARTIAL |
| Account/portfolio UI | Anonymous gate works; authenticated path unverified without credentials/live DB. | UNVERIFIED |

## 13. Security and privacy

### Strengths

- Server APIs use session-derived user IDs rather than trusting client-supplied user IDs in the reviewed personal routes.
- Internal status and alert-run routes use a shared-secret/timing-safe gate or explicit role checks.
- Admin/operations/advisor pages use role checks and `notFound()` rather than exposing their contents to anonymous users.
- Local-only storage is used for anonymous saved research, reducing the need to create an account for public browsing.

### Risks

1. **P1 UNSAFE — auth rate limiter fails open.**  [rate-limit core](/Users/shubhaang/MFworking/frontend/app/lib/platform/rateLimit/core.js:24)–[core.js](/Users/shubhaang/MFworking/frontend/app/lib/platform/rateLimit/core.js:45) returns `{allowed: true}` on any Postgres query error. The test run reproduced the consequence: expected blocked attempts were all allowed when DB resolution failed. This is a deliberate availability tradeoff in code comments, but it leaves credential stuffing, reset-email bombing and account-enumeration volume controls absent during a DB incident.
2. **P1 UNVERIFIED — no live cross-user negative test.**  Neon has no RLS by design, so every route-level query must be proven to reject user A reading user B’s records against the deployed branch.
3. **P2 OBSERVATION — global robots metadata is index/follow.**  [layout metadata](/Users/shubhaang/MFworking/frontend/app/layout.js:16)–[layout.js](/Users/shubhaang/MFworking/frontend/app/layout.js:24) applies index/follow globally, while private gating is client-side. Private page metadata/robots handling should be route-specific and verified from server-rendered HTML.
4. **P2 OBSERVATION — SSL warning.**  The test run emitted a PostgreSQL SSL-mode alias warning recommending `verify-full`; this should be resolved or documented explicitly.
5. **P2 OBSERVATION — cloud sync failure transparency.**  The local fallback is user-friendly, but authenticated users need a visible “saved locally / cloud sync pending” state when persistence falls back.

## 14. Performance and reliability

| Area | Evidence | Status |
|---|---|---|
| Build/lint | `npm run lint` passed. | PASS |
| Frontend unit tests | 72/107 files passed; 35 failed; 416 passed/54 failed/273 skipped tests. | BROKEN P1 for CI confidence |
| Backend/stateless tests | 57 targeted Python tests passed. | PASS |
| Migration tests | 12 skipped because DB was unavailable. | UNVERIFIED |
| Production navigation | Homepage, data-status, funds, compare and portfolio loaded in browser audit. | PASS WITH OBSERVATION |
| Search | Zero-size hidden dialog at 1200px. | BROKEN P1 |
| DB-dependent reliability | DNS failure caused integration failures and exposed fail-open limiter behavior. | UNSAFE / UNVERIFIED |
| Query/performance budget | No trustworthy network waterfall or live DB plan was available in this audit. | UNVERIFIED |

The most important reliability issue is not raw page speed; it is graceful degradation semantics. The app can continue displaying stale bundles and can allow auth traffic when DB-backed protections fail. Those states need explicit operational policy and tests.

## 15. Incomplete, placeholder and stale feature register

| ID | Feature | Status | Severity |
|---|---|---|---|
| I-01 | Real KYC/CKYC/KRA/FATCA/AML provider | PLACEHOLDER | P0 |
| I-02 | Real payment/NACH/UPI Autopay | PLACEHOLDER | P0 |
| I-03 | Real mutual-fund order routing/custody | PLACEHOLDER | P0 |
| I-04 | Real portfolio provider/account aggregation | PLACEHOLDER | P0 |
| I-05 | Binary document object storage and download | PLACEHOLDER | P1 |
| I-06 | SMS/email/push delivery | INCOMPLETE | P1 |
| I-07 | Portfolio report valuation consistency | INCORRECT | P1 |
| I-08 | XIRR as-of date | INCORRECT | P1 |
| I-09 | Auth limiter DB-outage behavior | UNSAFE | P1 |
| I-10 | Global search responsive behavior | BROKEN | P1 |
| I-11 | 1Y+ performance bundle fields | INCOMPLETE | P1 |
| I-12 | Monthly flow freshness | STALE | P1 |
| I-13 | Fund vs AMC compare semantics | PARTIAL | P1 |
| I-14 | Canonical fund-family identifiers | PARTIAL | P2 |
| I-15 | AUM/expense/manager/holdings completeness | PARTIAL | P1 |
| I-16 | Category label normalization | INCORRECT | P2 |
| I-17 | Private route robots metadata | UNVERIFIED | P2 |
| I-18 | Live DB migration/RLS/isolation verification | UNVERIFIED | P1 |
| I-19 | End-to-end auth and portfolio journeys | UNVERIFIED | P1 |
| I-20 | Current-vs-stale internal audit artifacts | STALE | P2 |

## 16. Hardcoded, mock, fallback and dead-code review

### Confirmed mocks/placeholders

- [provider registry](/Users/shubhaang/MFworking/frontend/app/lib/invest/providers/index.js:6) instantiates `MockKYCProvider`, `MockDocumentProvider`, `MockInvestmentProvider`, `MockPaymentProvider` and `MockPortfolioProvider`; each is registered as `mode: "sandbox"`.
- [document download route](/Users/shubhaang/MFworking/frontend/app/api/v1/invest/documents/[id]/download/route.js:1) states that it returns JSON metadata/synthetic storage reference rather than bytes.
- [order schema](/Users/shubhaang/MFworking/sql/neon/010_order_management.sql:39) identifies the provider as `mock-investment` for this phase.
- [launch blocker report](/Users/shubhaang/MFworking/docs/LAUNCH_BLOCKER_REPORT.md:18) records the commercial/regulatory dependencies and mock order outcome design.

### Honest fallbacks that need clearer product language

- Complete-bundle fallback when raw NAV rows exist for a newer date.
- Local browser persistence when cloud sync is unavailable.
- Missing expense/AUM/factsheet inputs omitted and weights renormalized in Fund Health.
- `null`/“Not available” for unsupported XIRR/history conditions.

### Potentially stale/dead evidence

- `data/warehouse/coverage.json` and older docs use earlier dates and scores; they should be clearly archived or generated only as dated snapshots.
- Static comments and old launch documents are useful provenance but should not be treated as current production claims without a current-as-of marker.

## 17. End-to-end journey audit

| Journey | Result | Status |
|---|---|---|
| Anonymous: landing → fund research | Observed working; data provenance and omissions visible. | PASS WITH OBSERVATION |
| Anonymous: landing → screener → fund detail | Screener works; 1Y missing and category labels need cleanup. | PARTIAL |
| Anonymous: header search at 1200px | Event fires but dialog is hidden/zero-size. | BROKEN P1 |
| Anonymous: AMC comparison | AMC comparison works; not equivalent to promised mutual-fund comparison. | PARTIAL P1 |
| Anonymous: portfolio | Correctly gates personal data. | PASS |
| User: register/login/reset | Code and route tests exist; live journey unavailable without DB/network. | UNVERIFIED |
| User: upload CAS → reconcile → value | Static components/tests exist; live DB and full browser journey not verified. | UNVERIFIED |
| User: portfolio report | Code path mixes raw holding totals with live valuation. | INCORRECT P1 |
| User: invest onboarding → KYC → payment → order | UI/service flow exists, but every provider is a mock. | PLACEHOLDER P0 |
| User: document upload → download | Metadata-only synthetic storage; no binary artifact. | PLACEHOLDER P1 |
| Operations: run alerts/status | Secret/role gates are present in code; live invocation unverified. | UNVERIFIED |

## 18. Top 25 problems

| # | Problem | Severity | Status |
|---:|---|---|---|
| 1 | All investment providers are mocks; no real money/order rail. | P0 | PLACEHOLDER |
| 2 | No real KYC/KRA/bank/payment execution. | P0 | PLACEHOLDER |
| 3 | Portfolio total value comes from a different source than live revaluation. | P1 | INCORRECT |
| 4 | XIRR terminal date uses today instead of latest official NAV date. | P1 | INCORRECT |
| 5 | Auth rate limiter fails open when Postgres errors. | P1 | UNSAFE |
| 6 | Search is unusable at audited 1200px responsive width. | P1 | BROKEN |
| 7 | Current bundle has 0% 1Y/3Y/5Y fields in the recorded coverage artifact. | P1 | INCOMPLETE |
| 8 | Monthly flow signal is 68 days old in production. | P1 | STALE |
| 9 | Raw latest NAV and public complete bundle use different dates without a universal primary date contract. | P1 | PARTIAL |
| 10 | AMC comparison route does not match fund-comparison product promise. | P1 | PARTIAL |
| 11 | Live DB schema/RLS/isolation was not verified. | P1 | UNVERIFIED |
| 12 | Authenticated integration suite cannot run because Neon DNS/network is unavailable. | P1 | BROKEN/UNVERIFIED |
| 13 | 273 tests are skipped and 54 fail in the configured frontend suite. | P1 | BROKEN |
| 14 | Short-history funds can receive high Health scores through weight renormalization. | P1 | PARTIAL / MISLEADING |
| 15 | Factsheet metadata covers only 1.19–6.17% for key fields. | P1 | PARTIAL |
| 16 | Portfolio/sector/holdings data covers under 2% of universe. | P1 | PARTIAL |
| 17 | Document download returns JSON/synthetic reference, not bytes. | P1 | PLACEHOLDER |
| 18 | Notifications are in-app only; external delivery is not real. | P1 | INCOMPLETE |
| 19 | Data-status “Total schemes” label likely describes rows, not schemes. | P2 | MISLEADING |
| 20 | Category option normalization produces duplicate/malformed labels. | P2 | INCORRECT |
| 21 | Canonical fund family identifier is missing; scheme-name approximation is used. | P2 | PARTIAL |
| 22 | Global index/follow metadata may apply to private client-gated pages. | P2 | UNVERIFIED |
| 23 | Hardcoded 6.5% risk-free rate lacks current-as-of governance. | P2 | OBSERVATION |
| 24 | Local/cloud fallback can hide failed authenticated persistence. | P2 | OBSERVATION |
| 25 | Historical coverage/trust docs remain discoverable with older scores/dates. | P2 | STALE |

## 19. Quick wins

1. Mount the search dialog in the responsive nav or move it to a shared portal outside the hidden desktop container; add a 768/1024/1200/1440px browser test.
2. Use the latest official NAV date as the terminal XIRR date and expose that date in the response.
3. Make the portfolio route derive every persisted summary field from one valuation snapshot; use a DB transaction for the cache writes.
4. Add a circuit-breaker/secondary edge limiter for auth endpoints; fail closed for repeated abuse while preserving a carefully bounded emergency path for legitimate traffic.
5. Gate or visually downgrade Health rankings when 1Y history is absent; show confidence and history depth beside the score, not only on detail pages.
6. Rename row-count cards (`NAV observations`, not `NAV rows`/`Total schemes`) and standardize raw-vs-complete-bundle terminology.
7. Normalize category labels at ingestion and add a no-duplicate display-label assertion.
8. Mark the investment UI everywhere as sandbox/demo until real providers are connected; prevent any copy that implies a real order was placed.
9. Add an explicit “document bytes unavailable in sandbox” response and UI state.
10. Archive or date-stamp older coverage/trust reports so current dashboards are the only default reference.

## 20. Structural issues

- **Two data planes:** committed static bundles power most public research while live/Neon data powers freshness and personal features. The architecture is workable, but the product needs a first-class reconciliation contract between raw rows, complete snapshots and displayed dates.
- **Mixed denominator model:** universe, active, investable, priced and history-covered funds are all legitimate populations, but many UI labels do not make the denominator obvious.
- **Factsheet pilot bottleneck:** AUM, expense, manager, holdings and documents are concentrated in a very small subset, so “full research” is not a universe-wide capability.
- **Server-only Neon security:** removing RLS places the burden on every route and every future contributor. Negative authorization tests must be mandatory CI, not optional integration tests.
- **Mock provider architecture:** the interface boundary is a good seam, but commercial/regulatory onboarding is external work and should be treated as a launch gate rather than a near-term code-completion item.
- **Persisted derived state:** portfolio metrics, reports, events and portfolio rows are written from multiple analytic layers in one request; without a single valuation snapshot and transaction, drift is likely.

## 21. Commercialization blockers

1. Licensed distribution/order-routing relationship and production KYC/KRA/CKYC/AML/FATCA operations.
2. Direct investor payment rail with no pooling, mandate support, reconciliation and provider webhooks.
3. Real folio/account/portfolio provider or a clearly defined non-custodial import-only product boundary.
4. Production document storage, retention, access-control and audit trail.
5. Real transactional email/SMS/push providers and delivery observability.
6. Legal/compliance review of investment advice language, suitability/risk profiling, disclosures, records and grievance handling.
7. Verified data licensing/source contracts for any third-party history, benchmarks or market data used in commercial claims.
8. Live DB isolation test suite, backup/restore, incident runbooks and SLOs.

## 22. Remediation roadmap

### Phase A — stop unsafe and misleading states (0–3 days)

- Fix responsive search.
- Fix portfolio terminal date and unify valuation source.
- Correct data-status labels and primary freshness language.
- Gate Health ranking visibility by history depth/confidence.
- Mark every investment action as sandbox/mock in UI and APIs.

### Phase B — restore CI and security evidence (3–7 days)

- Restore DB DNS/connection in the test environment or provide a controlled test branch.
- Run all 107 frontend files, migration tests and negative cross-user authorization tests.
- Decide and implement auth rate-limit outage policy with an edge-level fallback.
- Verify private route robots metadata and production headers.

### Phase C — data-contract hardening (1–2 weeks)

- Establish one generated source-of-truth freshness manifest for raw, complete and displayed datasets.
- Extend 1Y/3Y/5Y history and explicitly separate cumulative rolling returns from annualized CAGR.
- Normalize categories, canonical fund families and plan/option keys.
- Publish field-level coverage by denominator on each affected page.

### Phase D — research completeness (2–6 weeks)

- Expand factsheet ingestion beyond the current pilot; prioritize expense, AUM, manager, holdings, sector, riskometer, exit load, SIP minimum and debt metrics.
- Add benchmark/benchmark-return coverage where licensed and validated.
- Add portfolio and overlap confidence gates based on actual holdings coverage.

### Phase E — production portfolio trust (parallel, 2–4 weeks)

- Make valuation snapshot the sole source for all persisted portfolio metrics.
- Add idempotent transactional writes, stale-data banners, audit events and reconciliation reports.
- Add live browser journeys for login, CAS upload, reconciliation, valuation and export.

### Phase F — commercial investment rail (external dependency, gated)

- Select and contract real KYC, RTA/custody, payment/mandate and order-routing providers.
- Implement provider adapters, webhook signatures/replay protection, reconciliation, 2FA, consent, record retention and operational controls.
- Replace metadata-only documents and mock notifications.
- Do not enable live order UI until end-to-end UAT, legal/compliance sign-off and incident runbooks pass.

## 23. Recommended test plan

### Must-have automated tests

- Responsive search at 320/768/1024/1200/1440px: open, focus, type, select, Escape and route.
- Data-date contract: raw latest, complete bundle, page as-of and API freshness must agree or explain the relationship.
- Portfolio valuation snapshot: stored current value, report summary, portfolio row, metrics and XIRR all derive from one valuation date.
- XIRR vectors: positive return, loss, same-day flows, long gaps, negative return, no sign change, duplicate dates, stale NAV date and non-convergence.
- Fund ranking fairness: no fund with missing 1Y can outrank a fully covered fund without a visible confidence penalty or separate cohort.
- Cross-user negative tests for every personal GET/POST/PATCH/DELETE route against Neon.
- Rate-limit outage tests: DB down, high concurrency, IPv4/IPv6/proxy header handling and bounded fallback.
- Document contract: sandbox response cannot be mistaken for a downloadable binary.
- Provider mode guard: production environment cannot boot with mock investment/payment/KYC providers.
- Category normalization and duplicate display-label tests.

### Must-have manual/UAT tests

- Anonymous research journey on desktop, tablet and mobile.
- Real account registration/login/reset with the deployed auth provider.
- CAS upload with a redacted statement, unresolved scheme, duplicate holding and stale NAV.
- Portfolio report reconciliation against an independently calculated spreadsheet.
- Admin/advisor/operator role boundary checks.
- Production incident drill for stale raw data, stale bundle, DB outage, provider outage and partial pipeline completion.

## 24. Evidence and limitations

- Browser evidence came from the live production site `https://mf-pulse.vercel.app` using the browser-audit skill, including homepage, `/data-status`, `/funds`, `/compare` and `/portfolio`.
- Static evidence came from the repository at the audit date and is linked to local files above.
- `npm run lint` passed.
- Targeted stateless Python tests passed: 57 passed.
- Frontend suite with explicit test-branch environment: 35/107 files failed, 72 passed; 54 tests failed, 416 passed, 273 skipped. Most failures were Neon DNS/network failures; rate-limit failures also demonstrated the fail-open behavior.
- Migration tests were skipped because the DB was unavailable.
- No secrets or credential values are included in this report.
- Live DB row counts, deployed migration state, RLS/isolation, production auth sessions, authenticated portfolio journeys, response latency percentiles, backup/restore and real provider behavior remain **UNVERIFIED**.

## 25. Final conclusion

MF Pulse has a credible research foundation and unusually candid disclosure of missing feeds and data gaps. The repository is not a shallow demo: it contains real ingestion, validation, deterministic analytics, user-scoped APIs, tests and operational concepts.

However, “complete end-to-end production” is not supported by the current evidence. The public bundle is stale relative to raw NAV, important research fields are sparse, the responsive search is broken at a common viewport, portfolio calculations can disagree, rate limiting fails open during DB errors, and all investment execution/provider integrations remain simulated. The appropriate release posture is a **public research beta with explicit limitations**, not a fully commercial investment platform. Close P0/P1 items, restore live DB verification, and repeat the browser + integration audit before enabling or marketing real-money investment functionality.
