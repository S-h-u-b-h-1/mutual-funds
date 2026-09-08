# MF Pulse complete production, database, data, API, UI, security and financial audit

**Audit date:** 8 September 2026 (Asia/Kolkata)

**Production target:** `https://mf-pulse.vercel.app`

**Mode:** Evidence-first, read-only. No application code, database content, cloud settings, or deployment was changed.

**Status vocabulary:** PASS, PASS WITH OBSERVATION, PARTIAL, INCOMPLETE, PLACEHOLDER, BROKEN, INCORRECT, STALE, UNSAFE, UNVERIFIED, DEAD CODE.

**Severity:** P0 critical, P1 high, P2 medium, P3 low.
**Confidence:** High unless explicitly stated otherwise.

## 1. Executive summary

### Release decision

**MF Pulse is not production-ready for a general public launch and is not commercially deployable as an investment platform.** The public research shell has substantial real data and several sound controls, but the core fund-detail journey is completely broken in production, the investment stack is explicitly mock/sandbox-only, the portfolio valuation/reporting path can produce internally inconsistent financial values, and the data architecture has diverged across Neon, Supabase, and static bundles.

The strongest part is raw daily NAV ingestion: five sampled AMFI schemes matched the official source exactly and the current production date is 7 September 2026. The weakest parts are core product completion, deterministic fund-page availability, portfolio accounting integrity, security hardening, and operational testability.

| Dimension | Readiness | Why |
| --- | ---: | --- |
| Overall production | **45%** | Public discovery pages mostly render, but all sampled fund pages fail and mobile search can freeze navigation. |
| Frontend | **48%** | 67 route samples returned an HTTP response and major public pages render; core drilldown and sub-1280px search are broken. |
| Backend/API | **55%** | 99 route files and broad guarded workflows exist; internal status APIs are unhealthy and stock/commodity depth is largely empty. |
| Database | **68%** | Strong PK/FK/check coverage and no sampled orphans; production branch hardening, migration drift, duplicate uploads, test data, and split stores remain. |
| Data pipelines | **62%** | NAV is current and accurate; flows/factsheets/news have divergent stores, stale segments, parser risk, and high news failure volume. |
| Financial calculations | **50%** | Some short-window results and raw NAVs validate; long returns are absent, one 1-month result disagrees with independent calculation, and portfolio totals can mix valuation bases. |
| Portfolio/CAS | **40%** | Schema and parser/report workflow exist, but valuation timestamping and report persistence are financially unsafe; authenticated end-to-end isolation could not run. |
| Security | **42%** | Protected API samples correctly reject unauthenticated calls and no committed live secret was found; critical/high dependency advisories and Supabase/privacy/cloud hardening issues remain. |
| Performance | **58%** | Build succeeds and no live DB lock/long-query crisis was found; cold page responses reached 9.65s and data/index inefficiencies remain. |
| Commercial | **20%** | Investment providers, portfolio connect, documents, exports, and task workflows are mock, synthetic, or disabled. |

### Highest-priority outcomes

1. **P0 BROKEN:** Every sampled `/fund/[scheme_code]` page crashes with `ReferenceError: canonicalKey is not defined`.
2. **P0 INCORRECT:** Portfolio history appends terminal market value at the current wall-clock date instead of the latest available NAV date.
3. **P0 INCORRECT:** Portfolio reports persist raw holding total value while gain/loss and XIRR come from revalued holdings.
4. **P0 PLACEHOLDER:** Investment/order/redemption/SIP/switch/document-provider integrations are mock-only; no real money movement exists.
5. **P1 BROKEN:** Global search creates an invisible modal below the `xl` breakpoint and can block all pointer interaction.
6. **P1 UNSAFE:** The production dependency set contains 2 critical and 3 high advisories.
7. **P1 INCORRECT:** Data Status shows 855,633 “Total schemes” instead of about 14.3k and hardcodes 51 AMCs while the live catalog has 53.
8. **P1 PARTIAL:** Neon, Supabase, and deployed static bundles are separate, diverging data planes without a single authoritative publication contract.

## 2. Actual architecture map

```text
Official/external sources
  AMFI NAVAll + NAV history ─────┐
  AMFI monthly MCR/flows ────────┼─> Python ingestion/build scripts ─> static JSON bundles ─┐
  AMC factsheets (HDFC/ICICI/SBI)│                                                    Next.js UI
  News/RBI/SEBI/business feeds ──┘                                                           │
                                                                                            │
Browser ──> Next.js 14 App Router on Vercel ──> public and authenticated route handlers ────┤
   │                      │                              │                                    │
   │                      │                              ├─> Neon Postgres: auth, user data,
   │                      │                              │   portfolio, jobs, investments,
   │                      │                              │   news and a second copy of facts
   │                      │                              │
   │                      │                              └─> Supabase REST/Data API: public
   │                      │                                  schemes, NAV, flows, factsheets,
   │                      │                                  news, public analytics views
   │                      │
   └─ newsletter component ───────── direct anon Supabase INSERT into `alerts`

Investment UI ─> guarded APIs ─> provider abstraction ─> mock providers only
```

Architecture status: **PARTIAL, P1.** The server-only Neon design and RLS-protected Supabase design can each be valid, but the same public financial domains exist in both stores and differ materially. Publication freshness, lineage, and rollback are therefore not controlled by one release artifact.

## 3. Feature inventory

| Feature | Route | Status | Severity | Evidence |
| --- | --- | --- | --- | --- |
| Homepage market/research summary | `/` | PARTIAL | P1 | Renders live NAV/flow/news; cold response 9.65s; links to broken fund pages. |
| Fund catalog | `/funds`, `/discover` | PASS WITH OBSERVATION | P2 | Renders 14k+ schemes; long-horizon metric coverage is absent. |
| Fund detail/research | `/fund/[scheme_code]` | BROKEN | P0 | 5/5 sampled funds show server exception, digest `2520567853`. |
| Global fund search | Header and `/api/search` | BROKEN | P1 | API works; modal is invisible and blocks clicks at 1200px/390px. |
| Fund/AMC comparison | `/compare` | INCORRECT | P1 | Homepage promises fund comparison; destination is AMC comparison. |
| AMC intelligence | `/amc`, `/amc/[name]` | PARTIAL | P2 | Pages render; underlying factsheet depth varies sharply by AMC. |
| Category intelligence | `/categories`, `/categories/[name]` | PARTIAL | P2 | Rendered equity sample; implementation intentionally excludes non-equity category detail. |
| Rankings/performance | `/performance` | PARTIAL | P1 | UI works, but long-horizon returns are 0% covered in local publication bundle. |
| Research hub | `/research` | PASS WITH OBSERVATION | P3 | Renders; dependent fund drilldown is broken. |
| News and regulatory updates | `/news` | PARTIAL | P1 | Current articles exist; 18.7% of last-7-day ingestion runs failed. |
| Morning brief | `/brief` | PASS WITH OBSERVATION | P2 | Correctly discloses July 2026 flow month. |
| Market signals | `/signals`, `/signals/[amc]/[class]` | PARTIAL | P2 | UI route renders; Neon copy has only a May run. |
| Market map/breadth | `/market-map`, `/markets` | PASS WITH OBSERVATION | P2 | Current breadth renders; upstream scope/benchmark validation still needed. |
| Raw materials | `/markets/raw-materials` | INCOMPLETE | P2 | Commodity API returns an empty dataset. |
| Data status | `/data-status` | INCORRECT | P1 | Shows 855,633 schemes and hardcoded 51 AMCs; correct total is about 14.3k/53. |
| Data quality | `/data-quality` | PARTIAL | P2 | Rich UI and checks; some published aggregates are still wrong. |
| Public platform status | `/status` | PASS WITH OBSERVATION | P2 | Renders, while several internal status APIs return 503. |
| Stock universe/search | `/stocks`, `/stocks/universe` | PARTIAL | P2 | 100 companies and search exist. |
| Stock company research | `/stocks/company/[symbol]` | INCOMPLETE | P1 | Shell renders; financials, metrics, peers, timeline, valuation and commodities are empty. |
| Stock screener | `/stocks/screener` | PARTIAL | P2 | Renders and validates missing filter; underlying attributes are sparse. |
| Stock sectors/strategies/sources | `/stocks/sectors`, `/strategies`, `/sources` | PARTIAL | P2 | Pages render; sector API payload is empty. |
| Authentication | `/login`, `/register`, password routes | PARTIAL | P1 | Credentials-only auth; input/error behavior good; vulnerable dependency version remains. |
| Profile/setup | `/profile`, `/profile/setup` | PARTIAL | P2 | Client-gated and redirects unauthenticated users. Authenticated flow not verified. |
| Watchlists/cloud sync | API + UI surfaces | PARTIAL | P2 | APIs are guarded; authenticated persistence journey unverified. |
| Portfolio/CAS upload | `/portfolio` | INCORRECT | P0 | Protected; valuation/report basis defects can create wrong financial output. |
| Portfolio intelligence | `/api/v1/portfolio/intelligence` | INCORRECT | P0 | Mixed raw/revalued totals in persisted report. |
| Investment onboarding/compliance | `/invest/*` | PLACEHOLDER | P0 | Mock OTP/provider and sandbox semantics. |
| Orders/SIPs/redemption/switch | `/invest/orders`, `/sips`, `/redeem`, `/switch` | PLACEHOLDER | P0 | APIs/schema exist; all providers are mock and execution is blocked. |
| Document vault | `/invest/documents` | PLACEHOLDER | P1 | Synthetic storage references; “download” is JSON rather than a real document. |
| Advisor landing | `/advisor` | PASS WITH OBSERVATION | P2 | Public page renders. |
| Advisor workspace | `/advisor/workspace` | INCOMPLETE | P1 | Soft 404 for unauthenticated user; code says search/pagination/task creation incomplete. |
| Management/operations | `/management`, `/operations` | UNVERIFIED | P2 | Client redirects to login; role workflows not tested. |
| Internal system pages | `/internal/*` | PARTIAL | P2 | Client-gated/noindex; public status endpoints are unhealthy. |
| Newsletter/alert signup | Homepage | PARTIAL | P1 | Direct anon Supabase insert; RLS limits reads, but no server rate limit/captcha/unique evidence. |
| SEO | sitemap/robots/metadata | INCORRECT | P2 | Sitemap and robots advertise obsolete `frontend-six-beta-20.vercel.app`. |

## 4. Meaningful UI control inventory

| Page | Element | Action | Works? | Backend connected? | Notes |
| --- | --- | --- | --- | --- | --- |
| Global header | Search launcher | Open command palette | No below 1280px | Yes | Invisible dialog can intercept all clicks. |
| Global header | Desktop navigation | Navigate public routes | Yes | N/A | Core fund destination still fails. |
| Global header | Mobile menu | Open/close menu | Yes on clean load | N/A | Becomes blocked after broken search overlay opens. |
| Homepage | Fund/research cards | Open fund detail | No | Yes | Destination crashes server-side. |
| Homepage | Compare CTA | Compare funds | No, semantic mismatch | Yes | Opens AMC comparison. |
| Homepage | Newsletter email | Submit subscription | Partial | Direct Supabase | Native invalid-email validation works; abuse controls are weak. |
| Homepage | Export action | Export report | No | No | Explicit clipboard/mock alert. |
| Funds/discover | Search/filter/list | Explore schemes | Yes | Static/public data | Metric coverage limitations apply. |
| Compare | AMC selectors | Compare AMCs | Yes | Public data | Does not fulfill fund-to-fund promise. |
| News | Filters/research links | Explore stories | Partial | Supabase/static | Some feeds stale/failing; fund links can crash. |
| Stocks | Search/company links | Open company | Partial | Neon/API | Company shell works, depth mostly empty. |
| Stock screener | Filters | Run screen | Partial | API | Sparse data limits meaning. |
| Login/register | Forms | Authenticate/create account | Partial | Neon/Auth.js | Runtime malformed-input behavior is sound; full successful login not performed. |
| Protected pages | AuthGate | Redirect unauthenticated user | Yes | Auth.js | Seven sampled protected pages redirected. |
| Portfolio | CAS upload | Import holdings | Unverified end-to-end | Neon | Protected; accounting defects found statically and in data model. |
| Invest onboarding | OTP verification | Verify identity | Mock only | Mock provider | UI instructs use of `123456`. |
| Invest portfolio | Connect holdings | Link portfolio | Mock only | Neon + deterministic demo insert | Not a live registrar connection. |
| Orders/SIP/switch/redeem | Submit transaction | Execute investment action | Safely blocked/mock | Mock provider | Good that live execution is blocked; not a product-ready capability. |
| Documents | Upload/download/share | Manage documents | Synthetic | Metadata DB only | No genuine binary object lifecycle. |
| Advisor workspace | Add task | Create advisor task | No | No | Disabled/incomplete. |
| Transaction screens | Export | Download records | No | No | Explicitly disabled/not connected. |

## 5. Route matrix

All routes below were requested against production. HTTP 200 means only that the route shell responded; browser rendering and functionality are separate columns.

| Route(s) | HTTP | Render | Functional | Mobile | Errors | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 200 | Yes | Partial | Broken after search | Cold 9.65s | PARTIAL |
| `/funds`, `/discover`, `/research`, `/performance` | 200 | Yes | Partial | Basic responsive render | Fund destination fails | PARTIAL |
| `/fund/100033`, `/100046`, `/120503`, `/125497`, `/135762` | 200 shell | No | No | No | `canonicalKey` ReferenceError | BROKEN |
| `/compare` | 200 | Yes | Wrong product | Yes | Semantic mismatch | INCORRECT |
| `/amc`, `/amc/quant Mutual Fund`, `/manager/r-srinivasan` | 200 | Yes | Partial | Not exhaustively tested | None observed | PARTIAL |
| `/categories`, `/categories/Equity Savings` | 200 | Yes | Partial | Not exhaustively tested | Non-equity category gap | PARTIAL |
| `/benchmark/crisil-banking-and-psu-debt-index` | 200 | Yes | Partial | Not exhaustively tested | None observed | PARTIAL |
| `/brief`, `/news`, `/signals`, `/signals/Axis/Equity` | 200 | Yes | Partial | Basic render | Source freshness gaps | PARTIAL |
| `/market-map`, `/markets`, `/markets/raw-materials` | 200 | Yes | Partial | Basic render | Commodity payload empty | PARTIAL |
| `/data-quality`, `/data-status`, `/status` | 200 | Yes | Mixed | Basic render | Data Status count wrong | INCORRECT |
| `/stocks`, `/stocks/company/ADANIENT`, `/stocks/screener`, `/stocks/sectors`, `/stocks/sources`, `/stocks/strategies`, `/stocks/universe`, `/stocks/research-desk`, `/stocks/demo`, `/stocks/ADANIENT` | 200 | Yes/soft shell | Partial | Basic render | Sparse data; duplicate route concepts | INCOMPLETE |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | 200 | Yes | Partial | Basic render | No successful-account test | PARTIAL |
| `/profile`, `/profile/setup`, `/dashboard`, `/portfolio` | 200 then client redirect | Gate works | Auth flow unverified | Basic render | No authenticated session | UNVERIFIED |
| `/invest` plus `/account`, `/advisor`, `/compliance`, `/documents`, `/more`, `/notifications`, `/onboarding`, `/orders`, `/portfolio`, `/redeem`, `/sips`, `/switch`, `/transactions` | 200 then client redirect | Gate works | Mock-only | Basic shell | No live providers | PLACEHOLDER |
| `/management`, `/operations`, `/internal/system-health`, `/internal/neon-status` | 200 then client redirect | Gate works | Role flow unverified | Basic shell | No role account | UNVERIFIED |
| `/advisor` | 200 | Yes | Public landing works | Basic render | None observed | PASS WITH OBSERVATION |
| `/advisor/workspace` | 200 soft 404 | No workspace | No | Unverified | Route obscured/incomplete | INCOMPLETE |
| `/about`, `/analytics`, `/help`, `/learn`, `/learn/stocks` | 200 | Yes | Informational | Basic render | None material | PASS WITH OBSERVATION |
| `/internal/data-completeness` | 200 shell | Auth-dependent | Unverified | Unverified | Protected | UNVERIFIED |
| Nonexistent control | 404 | Correct | Correct | N/A | None | PASS |

Measured warm route responses were typically 0.9–3.2s, with AMC detail at 4.39s and the cold homepage at 9.65s. Cross-browser behavior in Firefox and Safari is **UNVERIFIED**; Chromium was used for browser interaction.

## 6. API matrix

The exhaustive static endpoint/method inventory is in [MF_PULSE_API_INVENTORY_2026-09-08.md](./MF_PULSE_API_INVENTORY_2026-09-08.md). Summary: **99 route files, 124 explicit method handlers plus NextAuth; 72 files have a directly detected auth/role guard and 27 are public/framework/status routes.**

| Endpoint/group | Purpose | Auth | Measured latency | Validation | DB/data | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `/api/freshness` | NAV/publication status | Public | 4.53s cold | N/A | Supabase + bundle | PASS |
| `/api/search?q=axis` | Global search | Public | 3.60s cold | Short/script-like input safely empty | Static/public | PASS WITH OBSERVATION |
| `/api/auth/register` | Account creation | Public | Not load-tested | Empty body 400 | Neon | PASS WITH OBSERVATION |
| `/api/auth/forgot-password` | Reset request | Public | Not load-tested | Generic 200 prevents enumeration | Neon/mail path | PASS WITH OBSERVATION |
| `/api/auth/reset-password` | Password reset | Public | Not load-tested | Empty body 400 | Neon | PASS WITH OBSERVATION |
| `/api/auth/providers` | Provider discovery | Public | Normal | N/A | Credentials only | PASS WITH OBSERVATION |
| `/api/internal/*/status` | Jobs/events/providers/reconciliation/webhooks health | Public | One timeout; others returned | JSON 503 | Database unavailable | BROKEN |
| `/api/v1/commodities`, `/sectors` | Research taxonomies | Public | Normal | N/A | Empty | INCOMPLETE |
| `/api/v1/stocks`, `/search`, `/universe` | Company catalog | Public | Normal | Query handling works | 100 companies | PARTIAL |
| `/api/v1/stocks/[id]/*` with symbol | Detail | Public | Normal | UUID mismatch becomes 500 | Neon | BROKEN |
| Same with valid UUID | Detail family | Public | Normal | Accepts UUID | Most depth tables empty | INCOMPLETE |
| `/api/v1/watchlists`, `/portfolio/*`, `/invest/*`, `/sync/*` samples | User data/mutations | Required | Normal | 16/16 negative samples returned 401 before write | Neon | PASS for unauth guard |
| `/api/watchlist-intelligence` missing list | Public helper | Public | Normal | Returns empty 200 | Static/public | PASS WITH OBSERVATION |
| `/api/v1/stocks/screener` missing filter | Screen stocks | Public | Normal | 400 | Neon | PASS WITH OBSERVATION |
| `/api/webhooks/bogus` | Provider webhook | Provider-specific | Normal | 404 | N/A | PASS |

Production response to an untrusted `Origin` did not include `Access-Control-Allow-Origin`, so broad browser CORS read access is not enabled: **PASS**.

## 7. Database report

### Neon production

- Project is Postgres 18 in `aws-us-east-1`; production branch is ready but **not protected**.
- 112 base tables, 2 views, 109 foreign keys, 47 checks, 53 unique constraints, and a primary key on every table.
- No table grants to `PUBLIC`. RLS count is zero by intentional server-only architecture, so all tenant isolation depends on route-level scoping.
- No non-null user orphans found in `portfolio_holdings`, `portfolio_uploads`, `portfolio_metrics`, `portfolio_reports`, `audit_log`, `user_events`, or `investment_orders`.
- No orphan schemes, non-positive units, negative cost, or duplicate logical holding groups were found in 28 current holdings.
- `fact_nav_daily`: 855,501 rows, 14,425 schemes, 2008-10-02 through 2026-09-07. There are 5,013 non-positive historical rows across 263 schemes and 108 non-positive values on the latest date. The loader intentionally permits zero values for wound-up pools; downstream performance code filters them, but the table itself has no positive-value check or scheme FK.
- Upload integrity: 44 uploads (13 success, 8 partial, 23 failed); four duplicate `(user_id, content_sha256)` groups contain 28 extra rows, with one group repeated 16 times. The checksum index is not unique.
- User contamination: 33 users, 21 `@mfpulse.test`, 24 obviously test-named, and zero verified. Much investment/compliance content is test data in production.
- Migration ledger contains only 022, 033, 035, 036, 037 and 038 while 39 migration files exist and 039-like objects are live. The migration history is not a reliable schema provenance record.
- Test branch `test` is archived. This is the direct cause of all database integration-test DNS failures.
- Recovery/security posture: 6-hour history retention, public connection endpoints, no IP allowlist, production branch not protected, and organization MFA not required.

Largest/important Neon row counts:

| Table | Rows | Observation |
| --- | ---: | --- |
| `fact_nav_daily` | 855,501 | Current; 14,425 schemes |
| `news_sentiment` | 180,733 | Substantial content |
| `news_articles` | 20,480 | 674 missing `published_at` |
| `dim_scheme` | 14,425 | Every row still marked active |
| `news_ingestion_runs` | 13,655 | Recent failure rate is high |
| `job_events` | 9,571 | Operational platform populated |
| `audit_log` | 7,794 | Audit data present |
| `domain_events` | 3,956 | Event layer active |
| `portfolio_events` | 1,503 | Mostly/test activity |
| `jobs` | 743 | Job layer populated |
| `portfolio_metrics` / `portfolio_reports` | 167 each | Derived portfolio artifacts |
| `companies` | 100 | Stock detail child tables mostly empty |
| `portfolio_uploads` | 44 | Duplicate files and high failure/partial share |
| `users` | 33 | Mostly test identities |
| `portfolio_holdings` | 28 | Referential sample is clean |

About 50 tables are empty, especially stock intelligence depth, watchlists, alerts, and live SIP/order capability tables. This is not corruption; it demonstrates implementation breadth without production content.

### Supabase production

- Project is healthy on Postgres 17 in `ap-southeast-2`.
- 23 base tables, 17 views, 2 materialized views. All 23 tables have RLS enabled.
- Main counts: `dim_scheme` 14,445; `fact_nav_daily` 855,633; `fact_flow_monthly` 273; `factsheet_archive` 1,584; `news_articles` 29,596; `news_sentiment` 220,933; `user_events` 4,529.
- User-owned policies generally enforce `auth.uid() = user_id`; public data tables are intentionally readable.
- Four anonymous-accessible views are `SECURITY DEFINER`: `v_event_summary`, `v_top_searches`, `v_flow_headline`, `v_amc_flows`.
- Both materialized views are exposed through the Data API.
- `v_top_searches` exposes raw top `payload->>'q'` values from analytics events to anonymous readers. Search terms can contain personal information; this is a privacy issue even if current rows are benign.
- Six foreign keys are unindexed; nine policies trigger RLS init-plan performance warnings; eight indexes are reported unused.
- The newsletter `alerts` table permits public inserts when email contains `@` and alert type is present. RLS blocks reads/other writes, but there is no evidenced server-side throttling, captcha, or uniqueness control.

### Integrity and source-of-truth conclusion

Database structural quality is **PARTIAL (68%)**. Constraints and current referential integrity are better than the product state suggests. The structural risk is control-plane divergence: Supabase and Neon hold different row counts for the same financial domains, while static bundles form a third publication layer.

## 8. Data coverage report

### Static fund publication bundle

Local bundle snapshot: 14,339 schemes as of 2026-09-04. Production displays 14,347 schemes as of 2026-09-07.

| Field/metric | Covered | Coverage | Status |
| --- | ---: | ---: | --- |
| Current NAV | 14,098 / 14,339 | 98.32% | PASS WITH OBSERVATION |
| Active schemes | 8,601 / 14,339 | 59.98% | Observation |
| 1-day return | ~4,218 / 14,339 | 29.42% | PARTIAL |
| 1-month return | ~4,218 / 14,339 | 29.42% | PARTIAL |
| 3-month return | 4,164 / 14,339 | 29.04% | PARTIAL |
| 6-month return | 0 / 14,339 | 0% | INCOMPLETE |
| 1-year return | 0 / 14,339 | 0% | INCOMPLETE |
| 3-year return | 0 / 14,339 | 0% | INCOMPLETE |
| 5-year return | 0 / 14,339 | 0% | INCOMPLETE |
| Risk metrics | ~4,183 / 14,339 | 29.17% | PARTIAL |
| Category rank | 1,273 / 14,339 | 8.88% | INCOMPLETE |

### Latest NAV coverage

8,226 of the 8,701-scheme baseline carry the latest market date: **94.54%**, classified CURRENT by the existing 85% threshold. Five sampled scheme values matched official AMFI exactly.

### Factsheet coverage

Supabase contains 1,584 records covering 1,010 schemes. The deployed/local metadata bundle contains 884 verified schemes from three AMC engines:

| Source | Bundle schemes | Source dates | Manager | Expense | Holdings | Status |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| SBI | 106 | 2022-12-31 to 2023-05-31 | Sparse | 0 | Partial | STALE |
| HDFC | 171 | 2026-06-30 | Strong | 171 | 0 | PARTIAL |
| ICICI | 607 | 2026-08-31 | Strong | 0 | 241 combined across bundle | PARTIAL |

Across all 884 bundle records: benchmark 669 (75.68%), manager 772 (87.33%), launch date 749 (84.73%), expense ratio 171 (19.34%), AUM 884 (100%), riskometer 665 (75.23%), exit load 672 (76.02%), minimum SIP 0 (0%), minimum lump sum 519 (58.71%), holdings 241 (27.26%), sectors 110 (12.44%).

### Stock and user-feature coverage

- 100 companies are present, but company financials, metrics, peers, management, ownership, subsidiaries, business segments, results, timelines, valuation, and commodity links are empty for the valid sampled company.
- Most user-facing watchlist, alert, SIP, and investment tables are empty. This is **INCOMPLETE**, not a clean production baseline.

## 9. Data freshness report

| Source/domain | Latest valid data | UI claim | Assessment |
| --- | --- | --- | --- |
| AMFI daily NAV | 2026-09-07 | Correctly states no 8 Sep NAV yet | PASS |
| Deployed static fund bundle | 2026-09-07 | Caught up | PASS |
| Neon latest NAV pipeline | 2026-09-07; 14,347 ingested; 37.5s | Current | PASS |
| Supabase monthly flow | 2026-07-01 | Shows July and 69d age | STALE but disclosed |
| Neon monthly flow/signals | 2026-05-01, last run 2026-06-24 | Not the live homepage source | STALE/divergent |
| News latest fetch | 2026-09-08 04:56 UTC | Current overall | PARTIAL |
| News source-specific feeds | Several at Aug 10/Sep 1/Sep 4/Sep 7 | All 11 still marked active | STALE/PARTIAL |
| Factsheet bundle build | 2026-09-05 | Homepage aggregate appears current | INCORRECT framing |
| SBI factsheet source data | 2022-12 to 2023-05 | Hidden by aggregate build date | STALE |
| HDFC factsheet source data | 2026-06-30 | Per-record date available | PARTIAL |
| ICICI factsheet source data | 2026-08-31 | Per-record date available | PASS WITH OBSERVATION |

In the last seven days, news ingestion recorded 465 successful and 107 failed runs: **18.71% failed**. Eighty-six failures had no source ID and reported remote connection closure; 21 NDTV runs returned HTTP 400. Some “active” sources have not yielded fresh content for weeks.

## 10. Financial calculation validation

| Metric | Formula | Implementation | Independent result | Status |
| --- | --- | --- | --- | --- |
| Current NAV | Official scheme NAV for date | AMFI ingestion/static publication | 5/5 samples exactly matched AMFI on 2026-09-07 | PASS |
| 1-month point return | `(NAV_now / NAV_anchor - 1) × 100` | `build_performance.py` anchor/history path | Scheme 100033: 962.33 vs 964.51 on 5 Aug = **-0.23%**; local bundle says **+2.73%** | INCORRECT, P1 |
| 3-month point return | Same at 3-month anchor | Same pipeline | Scheme 100033 independently **7.54%**, bundle **7.54%** | PASS sample |
| 1-month second sample | Same | Same | Scheme 100038 independently **-0.40%**, bundle **-0.30%** | PARTIAL |
| 6m/1y/3y/5y returns | Point-to-point/CAGR as applicable | Anchor fetch | 0% bundle coverage | INCOMPLETE |
| Volatility/downside volatility | Std. dev. of daily returns × √252 | `risk_from_series` | Formula is conventional; population limited to ~29% | PASS WITH OBSERVATION |
| Max drawdown | Min of `(NAV - running peak)/peak` | `risk_from_series` | Formula inspected; sample set not independently exhaustively recomputed | PASS WITH OBSERVATION |
| XIRR | Annualized irregular cash-flow root | Portfolio engine | Unit tests exist, but authenticated DB integration did not run | UNVERIFIED production |
| Portfolio market value | Units × latest valid NAV | Revaluation engine | Terminal value date uses `new Date()` rather than latest NAV date | INCORRECT, P0 |
| Portfolio total/gain/XIRR basis | All report values must use same revalued holdings | Intelligence route | `total_value` persisted from raw holdings while gain/XIRR use revaluation | INCORRECT, P0 |
| Industry AUM | Sum of all industry scheme categories | Supabase July category rows | UI ₹85.5904L Cr; official AMFI end-July ₹85.75657L Cr; short by ₹16,615.59 Cr (0.194%) | INCORRECT label/scope, P1 |
| Fund health | Weighted risk/return/quality components | Available components are renormalized | Missing long history can still receive a high grade | INCORRECT interpretation, P1 |

The AMFI historical parser currently reads NAV from semicolon field index 4, while the current official response places NAV at index 6. Old-format compatibility is due to end in September 2026. Combined with chunk skipping when **any** date exists in a 45-day window, this can suppress valid history and explains the long-return and sampled 1-month reliability problems.

Official comparison sources: [AMFI NAV download](https://www.amfiindia.com/net-asset-value/nav-download), [AMFI monthly data](https://www.amfiindia.com/research-information/other-data/mf-industry-data), and [SEBI mutual-fund data curation](https://www.sebi.gov.in/statistics/mutual-fund.html).

## 11. Portfolio/CAS audit

Workflow inspected: upload → parse/normalize → resolve scheme → persist upload/holdings/transactions → revalue from NAV → calculate cash flows/XIRR → derive metrics/intelligence → persist report → render protected UI.

Positive controls:

- Portfolio APIs require a concrete authenticated `session.user.id`.
- Current holdings have no orphan scheme references, non-positive units, negative cost, or duplicate logical groups.
- Upload checksum exists, transactions have idempotency work, and audit/event tables are populated.
- Unauthenticated holdings/upload/intelligence calls returned 401 before writes.

Blocking findings:

- **P0 INCORRECT:** Revaluation appends terminal market value on the wall-clock date, not the NAV valuation date. This changes XIRR timing and can overstate data recency.
- **P0 INCORRECT:** Portfolio report totals mix raw holdings and revalued results, so displayed totals, gain/loss, and XIRR are not guaranteed to reconcile.
- **P1 PARTIAL:** Duplicate statement uploads are persisted despite a checksum: 28 extra rows across four duplicate groups.
- **P1 UNVERIFIED:** Cross-user negative authorization, successful CAS parsing, and full encrypted/storage lifecycle could not run because the test database branch is archived and no test login was used.
- **P2 PARTIAL:** `folio_number` is nullable in the logical uniqueness key, leaving a theoretical duplicate gap even though no current duplicate was found.

Privacy conclusion: unauthenticated access is correctly blocked in tested routes, but safe upload for general users is **CONDITIONAL** on fixing the two P0 financial defects and restoring tenant-isolation integration tests.

## 12. Security report

| Severity | Status | Finding | Evidence and impact |
| --- | --- | --- | --- |
| P1 | UNSAFE | Vulnerable production dependencies | `npm audit --omit=dev`: 2 critical, 3 high across `next-auth`, `@auth/core`, `next`, `nanoid`, `postcss`. |
| P1 | UNSAFE | Supabase raw search-query analytics exposed through anonymous `SECURITY DEFINER` view | `v_top_searches` reads `payload->>'q'`; search text can contain PII. |
| P1 | UNSAFE | Four Supabase `SECURITY DEFINER` views and two Data API-exposed materialized views | Official database linter errors/warnings. |
| P1 | UNSAFE | Rate limiter fails open when Neon is unavailable | `rateLimit/core.js` returns `allowed: true`; integration test allowed 5/5 and 20/20 during DB outage. |
| P1 | UNSAFE | Production database governance weak | Neon production branch unprotected, org MFA not required, public endpoints, no IP allowlist, 6h recovery history. |
| P1 | PARTIAL | Newsletter endpoint can be spammed | Direct anonymous browser insert; only simple RLS email check, no server throttle/captcha/unique evidence. |
| P2 | UNSAFE | Missing browser hardening headers | HSTS exists, but no CSP, X-Frame-Options/frame-ancestors, Referrer-Policy, or Permissions-Policy was observed; `X-Powered-By` leaks Next.js. |
| P2 | PARTIAL | No database RLS in Neon | Intentional server-only design, but makes every user route and query-scoping regression security-critical. |
| P2 | PARTIAL | Internal status endpoints are public | They currently return generic 503 data, but provider/job/reconciliation metadata should be explicitly reviewed for exposure. |
| P2 | PASS WITH OBSERVATION | Auth.js fail-open advisory mitigated in route code | Installed beta.31 is affected, but code checks concrete `session.user.id`, matching the advisory workaround. Upgrade remains required. |
| P2 | PASS WITH OBSERVATION | Magic-link homoglyph advisory inactive | Production exposes credentials provider only. |
| P2 | PASS | Unauthorized mutation/read controls | 16/16 sampled protected calls returned 401 before mutation. |
| P2 | PASS | CORS | Untrusted Origin received no broad ACAO header. |
| P2 | PASS | Secret scan | No live-looking committed DB/API/service-role secret found; environment variable references only. |

Dependency advisory source: [Auth.js critical fail-open advisory](https://github.com/advisories/GHSA-8fpg-xm3f-6cx3). Supabase remediation references: [security-definer views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [materialized views in API](https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api), [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS init-plan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

## 13. Performance report

| Area | Measurement | Status |
| --- | --- | --- |
| Production pages | Warm samples mostly 0.9–3.2s; AMC detail 4.39s; cold homepage 9.65s | PARTIAL, P2 |
| Public APIs | Freshness 4.53s cold; search 3.60s cold | PARTIAL, P2 |
| Build | Next build completed; 121 static pages generated | PASS |
| Neon live activity | No long-running query and no blocking lock found | PASS |
| Neon bloat | NAV est. 1.2/14MB; news 1.8/5.7MB; schemes 2.0/2.9MB | PASS WITH OBSERVATION |
| Dead tuples | `fact_nav_daily` 58,663; last autovacuum 5 Sep | PASS WITH OBSERVATION |
| Index utilization | 72 low-scan non-unique indexes; several high sequential-scan counts on small tables | PARTIAL, P2 |
| Supabase FK indexes | Six foreign keys unindexed | PARTIAL, P2 |
| Supabase RLS | Nine init-plan warnings | PARTIAL, P2 |
| Caching | Homepage emits `private, no-cache, no-store`; public search is revalidated but a cache miss in sample | PARTIAL, P2 |
| Client bundle | Large static financial datasets are imported server-side in key paths; exact JS transfer audit not completed | UNVERIFIED |

The immediate performance priority is not index churn. Fix correctness, restore health endpoints and integration tests, then profile slow public server rendering with request traces. Many high sequential-scan counts occur on tiny tables and are not independently evidence of a problem.

## 14. Incomplete feature register

| Feature | Current state | Missing work | UI? | Backend? | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Fund detail | Built but crashes | Import/call correctness and regression test | Yes | Yes | Fix first and smoke-test representative funds. |
| Long-horizon returns | Fields and marketing exist | Reliable AMFI parser/history backfill | Yes | Partial | Correct parser, backfill, gate publication on coverage. |
| Fund comparison | AMC comparison delivered | True scheme-to-scheme comparison | Misleading CTA | No matching implementation | Rename immediately or build promised flow. |
| Stock research depth | Rich shell | Financials, metrics, ownership, peers, valuation, events | Yes | Tables/APIs empty | Populate source-backed data before promotion. |
| Commodities/raw materials | Route and provider seam | Real source ingestion | Yes | Empty API | Hide or label beta until data exists. |
| Advisor workspace | Shell/role concept | Search, pagination, task creation | Partial | Partial | Finish one end-to-end workflow. |
| Investment execution | Full route/schema surface | Real KYC/broker/RTA/order providers | Yes | Mock only | Keep sandbox label and execution block. |
| Document vault | Metadata lifecycle | Object storage, binary download, access lifecycle | Yes | Synthetic | Integrate secure object storage and malware scanning. |
| Portfolio connect | Deterministic demo holdings | Real registrar/account aggregation | Yes | Mock | Remove production-facing connect claim. |
| Transaction export | Disabled | Real export generation/audit | Yes | No | Implement or remove control. |
| Newsletter alerts | Direct insert works | Abuse prevention, verified subscription lifecycle | Yes | Partial | Add server endpoint, rate limit, confirmation, uniqueness. |
| Role journeys | Gates exist | Test accounts and E2E coverage | Yes | Yes | Restore test branch and automate. |
| Cross-browser/accessibility | Basic semantics present | Firefox/Safari and automated accessibility suite | Yes | N/A | Add permanent release-gate coverage. |

## 15. Hardcoded, mock and fallback register

| Item | Status | Evidence/risk |
| --- | --- | --- |
| All five investment providers | PLACEHOLDER, P0 | Provider index selects mock implementations. |
| OTP `123456` | PLACEHOLDER, P0 | Onboarding text explicitly instructs mock code. |
| Portfolio connect | PLACEHOLDER, P1 | Inserts deterministic demo holdings. |
| Document storage/download | PLACEHOLDER, P1 | Synthetic `storage_ref`; download returns JSON. |
| Homepage export | PLACEHOLDER, P2 | Alert says “mock placeholder action.” |
| Advisor add-task | INCOMPLETE, P2 | Disabled and awaiting backend. |
| Transaction/document export | INCOMPLETE, P2 | Explicitly not connected. |
| AMC count `51` | INCORRECT, P1 | Hardcoded in `data-status/page.js`; current data has 53. |
| Sitemap/robots hostname | INCORRECT, P2 | Hardcoded old Vercel deployment host. |
| Password-reset trusted-origin fallback | PARTIAL, P2 | Defaults to obsolete deployment hostname if env missing. |
| Rate limit DB-error fallback | UNSAFE, P1 | Allows requests on database failure. |
| Health score component renormalization | INCORRECT, P1 | Missing metrics can still produce high grade. |
| Empty commodities/sectors | INCOMPLETE, P2 | Valid 200 response can look like a real empty market rather than missing ingestion. |

Static marker scan outside tests found `mock` in 57 files, `synthetic` in 18, `stub` in 4, and `not implemented` in 3. These counts are discovery signals, not all defects; the table above lists the production-relevant cases confirmed by flow inspection.

## 16. User-journey results

| Journey | Steps tested | Outcome | Status |
| --- | --- | --- | --- |
| 1. New public researcher | Home → discover/search → fund detail | Discovery works; fund detail crashes | BROKEN, P0 |
| 2. Fund comparison user | Homepage compare CTA → `/compare` | Arrives at AMC comparison, not fund comparison | INCORRECT, P1 |
| 3. Portfolio user | Protected portfolio → upload/revalue/report | Auth gate works; successful run unverified; two accounting defects make output unsafe | INCORRECT/UNVERIFIED, P0 |
| 4. Watchlist/account user | Protected API without login | All sampled calls denied 401 | PASS for negative auth; positive journey UNVERIFIED |
| 5. Stock researcher | Stocks → company → financial/peer/valuation detail | Company shell opens; research depth empty | INCOMPLETE, P1 |
| 6. Investor | Onboarding → compliance → order/SIP/redeem/switch → documents | Mock provider and synthetic artifacts; live execution intentionally blocked | PLACEHOLDER, P0 |
| 7. Mobile user | Home at 390px → search → menu | Search opens invisible overlay and blocks menu until reload | BROKEN, P1 |
| 8. Operations/admin | Protected page → internal status | UI redirects; public health APIs return 503 | UNVERIFIED/BROKEN, P1 |

## 17. Top 25 problems

| # | Sev/status | Feature and user impact | Root cause/evidence | Recommended fix | Size |
| ---: | --- | --- | --- | --- | --- |
| 1 | P0 BROKEN | All fund-detail research is unavailable | `marketImpact.js:159` calls unimported `canonicalKey`; 5/5 production funds fail | Import correctly, add representative production smoke tests | XS |
| 2 | P0 INCORRECT | Portfolio XIRR timing can be wrong | Terminal value dated `new Date()` instead of latest NAV date | Use explicit valuation date and show it in UI/report | S |
| 3 | P0 INCORRECT | Portfolio totals may not reconcile | Report stores raw total but revalued gain/XIRR | Build every report field from one immutable valuation snapshot | M |
| 4 | P0 PLACEHOLDER | Users cannot actually transact | All provider adapters are mocks | Keep sandbox-only; integrate regulated provider and reconciliation before launch | XL |
| 5 | P1 BROKEN | Search can freeze desktop/tablet/mobile UI | Invisible `<dialog>` below `xl`; click interception reproduced at 1200/390 | Correct dialog display/breakpoints, focus trap and close handling | S |
| 6 | P1 UNSAFE | Known dependency vulnerabilities | 2 critical + 3 high audit findings | Upgrade Auth.js/Next and regression-test auth/cache/RSC | M |
| 7 | P1 INCORRECT | Data Status misstates catalog by ~60× | Supabase materialized-view `schemes` counts NAV join rows; UI sums it | Count distinct/current schemes or use health total | S |
| 8 | P1 PARTIAL | No single financial source of truth | Neon/Supabase/static counts diverge | Define authoritative store, publication manifest and reconciliation gate | XL |
| 9 | P1 INCORRECT | Published 1-month return sampled wrong | AMFI parser field mismatch plus coarse chunk skip | Parse schema by header/current index; require date-complete anchors | M |
| 10 | P1 INCOMPLETE | 6m/1y/3y/5y results absent | Historical anchor acquisition fails; 0% coverage | Fix parser, backfill, fail publication on required coverage | L |
| 11 | P1 UNSAFE | Rate limiting disappears during DB outage | Explicit fail-open catch; tests prove unlimited calls | Add independent durable limiter/fail-closed tier for auth abuse | M |
| 12 | P1 BROKEN | Integration/authorization tests cannot run | Neon test branch archived/DNS ENOTFOUND | Restore disposable test branch and CI lifecycle | S |
| 13 | P1 UNSAFE | Search analytics may expose PII | Anonymous `SECURITY DEFINER v_top_searches` returns raw queries | Remove Data API access; aggregate/redact server-side | S |
| 14 | P1 UNSAFE | Supabase view privilege posture | Four definer views; two materialized views exposed | Convert to invoker or revoke anon/API exposure | M |
| 15 | P1 INCORRECT | “Total industry AUM” is understated | Category sum is 0.194% below official total, likely scope omission | Label scope or ingest complete total and reconcile | S |
| 16 | P1 INCORRECT | Health grade can look strong without history | Available components renormalized | Add minimum evidence gates and “insufficient history” grade | M |
| 17 | P1 PARTIAL | News reliability is poor by run count | 107/572 recent runs failed; stale active sources | Fix NDTV/remote errors, source SLA, deactivate/quarantine stale feeds | M |
| 18 | P1 STALE | Factsheet freshness aggregate is misleading | Build date hides 2022–2023 SBI data | Show field/source date and stale badge per fund; gate aggregate wording | M |
| 19 | P1 INCOMPLETE | Stock research promises unsupported depth | 100 shells, detail tables/metrics empty | Populate verified fundamentals or narrow product claims | XL |
| 20 | P1 PARTIAL | Production DB change/recovery governance is weak | Unprotected branch, 6h retention, MFA not required | Protect branch, require MFA, extend recovery, restrict networking | S/M |
| 21 | P1 PARTIAL | Duplicate CAS files persist | Non-unique checksum; 28 extra uploads | Enforce idempotent upload key and user-visible duplicate handling | M |
| 22 | P2 INCORRECT | SEO points crawlers to obsolete domain | Hardcoded sitemap/robots hostname | Derive one canonical site URL and test generated metadata | XS |
| 23 | P2 UNSAFE | Missing browser security headers | HSTS only; no CSP/frame/referrer/permissions policy | Add tested response-header baseline | S |
| 24 | P2 PARTIAL | Internal observability is unreliable | Multiple status endpoints return 503 | Repair DB configuration and add external synthetic monitors | M |
| 25 | P2 PARTIAL | Public cold latency is high | Homepage 9.65s, freshness 4.53s, search 3.60s | Trace SSR calls, cache public aggregates, set budgets | M |

## 18. Quick wins

1. Import `canonicalKey` and add five fund-detail smoke tests.
2. Fix the search dialog breakpoint/display behavior and add 390px, 1200px, 1280px tests.
3. Replace Data Status scheme count with `fact_system_health.total_schemes`; derive AMC count instead of hardcoding.
4. Replace sitemap/robots/reset-origin host constants with the canonical environment URL.
5. Remove anonymous access to `v_top_searches`; convert the four definer views to invoker semantics where appropriate.
6. Upgrade Auth.js to at least the patched beta and plan the supported Next.js upgrade.
7. Restore or recreate the test branch so the existing integration suite runs.
8. Add CSP/frame/referrer/permissions headers and disable `X-Powered-By`.
9. Mark all investment screens unmistakably “sandbox/demo” and remove production-like execution language.
10. Label July AUM as the covered category subtotal until it reconciles with official total AUM.

## 19. Structural issues

- Three publication planes—Neon, Supabase, static JSON—lack a single versioned release manifest and atomic promotion step.
- Portfolio calculations are not centered on one immutable, date-stamped valuation snapshot.
- The platform exposes a very broad route/schema surface before data/provider depth exists, increasing security and maintenance cost.
- Tenant isolation in Neon is entirely application-mediated; permanent cross-user negative tests are therefore mandatory.
- Financial metric availability is treated as optional input to scoring instead of a trust gate.
- Pipeline success is measured per job, but source freshness and publication completeness are not uniformly enforced at release time.
- Mock provider abstractions are interwoven with production UI rather than isolated behind an explicit demo environment.

## 20. Commercialization blockers

1. Core fund pages do not work.
2. Portfolio reports can contain financially inconsistent values.
3. No live transaction, KYC, registrar/broker, payment, order-status, or reconciliation provider is connected.
4. Documents are synthetic, not a secure user document vault.
5. Long-horizon return claims have no published coverage.
6. Current security advisories and Supabase/privacy findings are unresolved.
7. Integration tests are operationally disabled by the archived test database.
8. Data lineage and freshness differ across production stores.
9. Stock research is a shell without the claimed analytical depth.
10. Production monitoring endpoints themselves are unhealthy.

## 21. Remediation roadmap

### Phase A — Critical correctness and security

- Fix fund-detail crash; deploy with representative production smoke suite.
- Correct portfolio valuation dates and one-basis report persistence; add golden reconciliation fixtures.
- Upgrade vulnerable dependencies and test Auth.js/Next behavior.
- Revoke unsafe Supabase view exposure and protect raw search analytics.
- Replace auth limiter fail-open behavior with a resilient independent control.
- Restore the test DB branch and make database tests a required check.

### Phase B — Core feature completion

- Decide whether `/compare` is AMC or fund comparison and align all promises.
- Complete/hide stock depth, commodities, advisor tasks, exports, and document workflows.
- Keep investment capability explicitly sandbox-only until regulated providers pass certification.

### Phase C — Data reliability

- Fix AMFI history parsing and chunk completeness; backfill long horizons.
- Establish one authoritative store and a versioned publication manifest covering source date, row count, checksum, and schema version.
- Reconcile flows against official total AUM and display scope.
- Add per-source news SLAs and per-field factsheet freshness.
- Correct active-scheme lifecycle and Data Status aggregation.

### Phase D — Performance

- Add request tracing and budgets for homepage/search/freshness.
- Cache immutable/public aggregates appropriately.
- Add the six missing FK indexes after workload validation; tune RLS init plans.
- Remove demonstrably unused indexes only after a complete traffic window.

### Phase E — Product quality

- Test responsive behavior at 390/768/1200/1280/1440 and add Firefox/Safari runs.
- Add accessibility automation plus keyboard/dialog/focus tests.
- Standardize loading, empty, degraded and stale states; distinguish “no data” from “pipeline absent.”
- Repair SEO canonical generation and private-page indexing policy.

### Phase F — Commercial readiness

- Complete live provider due diligence, consent, suitability, audit, retry/idempotency and reconciliation controls.
- Protect production branches, require MFA, improve recovery retention, and document incident response.
- Add external synthetic monitors for core journeys and source freshness.
- Conduct financial-model validation, privacy review, penetration test, and operational launch rehearsal.

## 22. Recommended permanent test suite

### Release-blocking browser tests

- Home → search → fund detail for at least five AMCs/categories.
- Search open/type/escape/click-outside/focus restoration at 390, 1200, 1280 and desktop.
- Fund catalog → detail → compare → back-navigation.
- All public route smoke tests with assertion against Next.js application-error text, not only HTTP status.
- Auth redirect and successful login/logout/password-reset journey.
- Portfolio upload → parsed holdings → valuation date → totals/gain/XIRR reconciliation.
- Cross-user attempts for every user-owned object.
- Firefox, Chromium, and WebKit; automated accessibility scan and keyboard-only journey.

### Financial/data tests

- Daily random AMFI sample reconciliation by value and date.
- Header/schema-aware NAV-history parser contract test using a current official fixture.
- 1m/3m/6m/1y/3y/5y golden calculations with trading-day anchor policy.
- Publication gate: required metric coverage, no future dates, no mixed as-of dates, and source checksum.
- Official total AUM reconciliation and category-sum scope test.
- Fund-health “insufficient evidence” gates.
- Portfolio XIRR golden cases, duplicate transactions, same-day flows, missing NAV, stale NAV, redemptions and terminal value date.

### Database/API tests

- Every migration from empty DB and from prior production snapshot; ledger must exactly match applied schema.
- PK/FK/check/unique/orphan and duplicate-upload tests.
- API schema/validation tests for every method in the 99-route inventory.
- UUID/symbol invalid identifiers must return 400/404, never 500.
- Rate limit enforcement during primary DB outage.
- RLS policy tests for anonymous, authenticated owner, non-owner and service roles.
- Webhook signature, replay, idempotency and retry tests.

### Operations/security tests

- Dependency/security audit as a required CI gate.
- Secret scanning, SAST, CSP evaluation and security-header assertions.
- Synthetic production checks for home, search, fund detail, freshness and internal health.
- Source-specific freshness SLOs and alert tests.
- Backup/restore and branch-protection verification.

### Current test evidence

- Python suite: **138 passed, 12 skipped**; every skip was caused by missing `DATABASE_URL`, so live schema/migration checks did not execute.
- Frontend test suite with the configured test DB: **35 failed / 72 passed files; 54 failed / 416 passed / 273 skipped tests**. Database tests failed with DNS `ENOTFOUND` because the Neon test branch is archived.
- Lint: **PASS**.
- Production build: **PASS**, 121 static pages generated.
- Production dependency audit: **FAIL**, 2 critical and 3 high vulnerabilities.

## 23. Final verdict

### Is MF Pulse currently production-ready?

**NO.** A core product route is deterministically broken, portfolio accounting has critical inconsistencies, and required integration tests are disabled.

### Is MF Pulse currently commercially deployable?

**NO.** It is a research/demo platform with mock investment infrastructure, not a transaction-ready financial product.

### Can users trust its financial calculations?

**PARTIALLY.** Current sampled NAV values and some short-window formulas validate, but long returns are absent, a sampled 1-month return is wrong, health scoring overstates incomplete evidence, and portfolio outputs can be inconsistent.

### Can users trust its data freshness?

**PARTIALLY.** Daily NAV and current news are generally fresh and date-disclosed; flow is old but disclosed, while factsheet/source-level staleness and cross-store divergence are not communicated consistently.

### Can users safely upload financial portfolio data?

**CONDITIONAL.** Unauthenticated API access was correctly denied and current relational integrity is good, but the two P0 valuation/report defects and missing cross-user integration run must be resolved before public use.

### Biggest technical risk

Uncontrolled divergence across Neon, Supabase, and static publication bundles, compounded by missing release-gate integration tests.

### Biggest financial/data risk

Financial outputs can combine different valuation dates/bases while presenting one authoritative portfolio result.

### Biggest security risk

Known critical/high dependencies plus public Supabase definer-view exposure, with auth rate limiting designed to fail open.

### Biggest incomplete-product risk

The investment platform looks broad and production-like but every provider and several downstream artifacts are mock or synthetic.

### Single highest-priority fix

**Restore every fund-detail page immediately by fixing the missing `canonicalKey` dependency and place a real browser smoke test for representative funds in the deployment gate.** It is the smallest fix with the largest direct impact on the core research product.

## Evidence index and limitations

- Root-cause code: `frontend/app/lib/marketImpact.js:5-7,159`; fund route import at `frontend/app/fund/[scheme_code]/page.js:27`.
- Search UI: `frontend/app/components/Search.jsx:55-71,320-350`.
- Data Status: `frontend/app/data-status/page.js:29-33,57-58,99-102`.
- AMFI parser/gap logic: `scripts/build_performance.py:53-91,118-157`.
- Rate limiter: `frontend/app/lib/platform/rateLimit/core.js:24-45`.
- SEO: `frontend/app/sitemap.js:3`, `frontend/app/robots.js:1`, `frontend/app/layout.js:12-23`.
- Browser console evidence: `output/playwright/deep-audit/.playwright-cli/console-2026-09-08T08-59-23-356Z.log`.
- Chromium snapshots are under `output/playwright/deep-audit/.playwright-cli/`.
- Vercel’s connected project-management API returned team-scope 403, so deployment history, environment-variable inventory, and platform logs are **UNVERIFIED**. Production HTTP and browser behavior were still tested directly.
- No real user login, paid transaction, email delivery, or destructive write was performed. Authenticated success-path, role and cross-user tests remain explicitly **UNVERIFIED** rather than assumed.
