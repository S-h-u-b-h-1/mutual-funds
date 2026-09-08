# MF Pulse controlled remediation — release-candidate report

Date: 8 September 2026. Target: https://mf-pulse.vercel.app. This is **not a production-completion certificate**. Local results do not close a production finding until the same release is verified live.

**Latest checkpoint, after user approval:** migrations 029–032 and 034 committed at 13:03:48 UTC; fresh preflight, historical-row fingerprint checks and the immediate read-only production schema/integrity gate passed. No production rows were deleted or rewritten. **Release remains held because the existing test credential also authenticates to production.** No GitHub test secret was uploaded and no application deployment occurred. The remaining sections preserve the earlier candidate-report checkpoint; their pending-schema/approval labels are superseded by [Approved release actions](APPROVED_RELEASE_ACTIONS_2026-09-08.md), which records the current state and new credential-separation approval request.

## 1. Executive summary

The remediation branch repairs the reproduced fund crash, responsive search, inconsistent portfolio valuation/XIRR dates, AMFI history parsing and return anchors, evidence-free health grades, count semantics, fail-open rate limiting, dependency vulnerabilities, news lookups, and sandbox disclosure. It adds publication checksums/coverage gates, tenant tests, browser tests, and a read-only schema release gate.

Independent recomputation from newly fetched official AMFI history matches **11/11 schemes across six AMCs**. All 11 sampled latest NAV values and dates also match both live warehouses. Production user/holding/upload/transaction counts remain **33/28/44/6**; no historical production rows were deleted.

Final candidate verification: **858/858 frontend unit/integration tests across 116 files, 179/179 Python tests, 42/42 browser checks**, zero failures/skips in those passing runs. Build, lint, publication checksums and the production dependency audit pass. An earlier full run failed with DNS/setup errors and is retained below rather than erased.

Already applied live: production Neon branch protection; migration 040 (newsletter-interest and schema-baseline storage) with its actual checksum on production and test; a schema baseline marker; Supabase security-invoker/public aggregate view migration and removal of anonymous raw-search access.

**Release blocker:** production lacks migrations 029–032 and 034, although the isolated test database has their objects. The safety reviewer rejected applying them and requested explicit approval. The transaction was not executed. Deploying the candidate first would introduce missing-table/column failures. Separately, uploading `TEST_DATABASE_URL` to the two GitHub Actions secret stores was rejected pending explicit approval of the credential/destinations.

No application deployment, promotion, main-branch push, or real-money integration has been performed by this remediation. A live browser recheck at 11:36 UTC still showed the fund-detail application error (digest `2520567853`). An HTTP 200 did not mean that page worked.

Code handoff: changes remain uncommitted on `codex/mf-pulse-remediation-2026-09-08`, based on local HEAD `4621516403d6cbe918823fe5c14bf7c3f6f5624e`. Existing unrelated local artifacts were preserved. Do not treat this working tree or its publication manifest as an immutable release.

## 2. P0/P1 closure matrix and before/after status

IDs correspond to the top-25 table in the deep audit. “Candidate” means implemented in this branch, not deployed.

| ID | Severity | Before / root cause | Candidate fix | Evidence | Current closure status |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | Fund detail crashes: missing `canonicalKey` import | Canonical dependency imported, regression added | Seven representative browser pages, including new/sparse and discontinuity cases | Candidate verified; live open |
| 2 | P0 | Terminal XIRR value dated at wall clock | Explicit common NAV valuation date; future flows suppress XIRR | Date fixtures, weekend/stale/mixed-date cases, portfolio goldens | Candidate verified; live open |
| 3 | P0 | Raw totals persisted alongside revalued gain/XIRR | One valuation object; transactional report/metrics/events/header writes; unresolved/incomplete totals unavailable | Reconciliation and real-DB upload rollback tests | Candidate verified; prerequisite migration blocked |
| 4 | P0 | Mock investing can appear operational | Persistent sandbox layout, demo OTP, simulated document access, API mode metadata, provider guard, mixed-demo portfolio warning | Authenticated local browser; provider/service tests | Safely limited in candidate; live release pending |
| 5 | P1 | Search dialog inside hidden desktop navigation | Body portal, focus restoration, early-open event handoff | Ten widths 320–1920; Escape/backdrop/reopen; keyboard/resize/back | Candidate verified; live open |
| 6 | P1 | Critical/high production dependencies | Targeted Next/Auth/PostCSS/nanoid updates | Final production dependency audit: zero advisories; build/lint pass | Candidate fixed; deployed dependency set unchanged |
| 7 | P1 | NAV observation count labelled schemes; hardcoded AMC count | Distinct catalog counts and invoker summary views | Candidate 14,347 catalog schemes; 53 AMCs; live distinct-view checks | Views live; UI release pending |
| 8 | P1 | Diverging public data stores | Ownership matrix, versioned checksum manifest, coverage and schema gates | Data ownership contract; sampled cross-store NAV equality | Partial: full-domain row reconciliation and mirror repair deferred |
| 9 | P1 | Wrong historical field and inconsistent anchors | Header/schema parser; calendar-month nearest-prior anchors within seven days | Independent official observations, including scheme 100033 | Candidate fixed; publication not promoted |
| 10 | P1 | No long-horizon coverage | Reconcile requested history windows; restore 6m/1y/3y/5y; coverage regression gate | 4,018 / 3,775 / 2,861 / 2,056 eligible schemes respectively | Candidate fixed; publication not promoted |
| 11 | P1 | Limiter allows unlimited requests on DB error | Bounded fail-closed response, retry interval; existing sessions unaffected | Concurrent outage regression; auth tests | Candidate fixed; independent fallback store deferred |
| 12 | P1 | Integration suite unavailable/skipped | Isolated branch verified ready; fail-loud CI credential preflight; production-host guard | Final network-verified full run 858/858, zero skips, including 73 tenant-boundary cases; earlier DNS failure retained | Local verification passes; CI secret approval blocked |
| 13 | P1 | Anonymous raw search queries | Revoke public raw-query view; remove consumers | Live anonymous grant check false | Live privacy fix applied |
| 14 | P1 | Definer views/public materialized views | Invoker views and replacement distinct summaries | Advisor: zero definer errors, two remaining legacy materialized-view warnings | Partial; revoke old grants only after app cutover |
| 15 | P1 | Subtotal labelled industry AUM | “Covered category AUM” and source-month disclosure | Homepage/brief code and local UI | Candidate scope label fixed; complete-industry reconciliation deferred |
| 16 | P1 | Sparse history gets strong grade | Minimum 1y/risk/freshness eligibility, missing evidence/confidence | New fund and discontinuity browser checks, scoring tests | Candidate fixed |
| 17 | P1 | CNBC/NDTV ingestion always fails after articles arrive | Encode and bound PostgREST URL filters; exact inserted count; source health; RBI timezone parsing | Both old lookups 400; both corrected read-only lookups succeed; all 11 feeds readable | Candidate fix verified read-only; new scheduled ingestion not run |
| 18 | P1 | Build timestamp hides old factsheets | Document dates, historical/stale warning, unknown fetch/parse timestamps disclosed | SBI 2022–2023 dates preserved; per-record source links | Trust labelling improved; fresh SBI acquisition still missing |
| 19 | P1 | Stock depth largely empty | Beta/capability disclosure; unsupported sectors/commodities unavailable; UUID error contract | Valid/invalid API tests and browser routes | Safely narrowed candidate, not complete stock intelligence |
| 20 | P1 | Weak DB recovery/change governance | Production branch protected; real baseline/checksum; schema prerequisite gate | Live protection and baseline verification; drift report | Partial: retention/MFA/network/restore exercise remain |
| 21 | P1 | Exact duplicate CAS uploads | Per-user checksum transaction lock, duplicate 409, atomic rollback | Concurrent duplicate test: one 201/one 409; injected write failure rolls back | Candidate verified; production uniqueness migration blocked |
| 22 | P2 | Obsolete SEO/reset domain | Shared canonical configuration; preview/private robots policy | Origin tests, local generated routes | Candidate fixed |
| 23 | P2 | Missing browser hardening headers | CSP/frame/nosniff/referrer/permissions, powered-by removed | Browser/API header assertions, build | Candidate fixed |
| 24 | P2 | Internal status 503 | Verified fail-closed missing `INTERNAL_STATUS_SECRET`; synthetic workflow and schema gate added | Configuration inspection, negative access checks | Secret configuration/internal positive health still blocked; not masked as healthy |
| 25 | P2 | Slow public cold responses | Correctness first; bounded before-release measurements recorded | Three samples each for six routes | Measured; hosted after-release comparison pending |

Additional newsletter closure: server validation, normalization, per-IP/email throttling, atomic duplicate-safe pending-interest insert, and safe errors are implemented. Seven focused endpoint tests pass. Email delivery is explicitly inactive. The legacy Supabase anonymous `alerts` insert grant must remain an open item until the old client is replaced and that grant is revoked.

## 3. Code changes

- Frontend: global-search portal/lifecycle; accurate fund-health states; distinct counts; factsheet provenance; AMC comparison labels; portfolio sandbox warning; stock beta and investment demo boundaries.
- Backend: single-date valuation adapters, repeatable-read transactions, CAS serialization/idempotency/rollback, request-size bounds, newsletter endpoint, UUID validation, safe correlation IDs, private response cache headers.
- Financial logic: common-date totals, NAV-dated XIRR terminal value, severe-loss bisection fallback, incomplete/unresolved value suppression, exclusion of old cost-basis snapshots from market-value history.
- Ingestion/publication: schema-driven AMFI history parser, gap/window reconciliation, bounded prior anchors, long-horizon CAGR, 90-day risk window, discontinuity quarantine, coverage regression thresholds, checksum manifest; encoded/batched news lookups and explicit source health.
- Security/platform: Next 15.5.25, next-auth beta.32, PostCSS 8.5.28/nanoid override; fail-closed limiter; response headers; branch protection and privacy-safe Supabase views.
- Testing/CI: real DB tenant isolation, independent official fixtures, CAS failure/concurrency tests, browser width and signed-in checks, credential/schema preflight, public synthetic workflow. Workflows are prepared locally, not enabled by a push.

The Next.js, database, browser-verification, deployment, and React-review skills guided compatibility checks, isolation precautions, and the decision to hold promotion on schema drift. No broad architecture replacement was performed.

## 4. Database changes and migration provenance

### Applied

Neon production and test: `040_research_remediation.sql`, SHA-256 `c8bc625d774f5fd7e95f88a0bf9bcc8821579c89610c92a38c1de0f44f696e6b`.

- `newsletter_subscriptions`: UUID primary key, normalized unique email/check, pending/confirmed/unsubscribed status check; PUBLIC privileges revoked.
- `schema_baselines`: primary-key marker, capture time, `schema_checksum`, JSON details; PUBLIC privileges revoked.
- Baseline marker `production-remediation-2026-09-08` captures actual branch-specific columns/constraints/index definitions. It is **not** a database backup or proof that historical migrations ran.
- Production ledger retains original rows 022, 033, 035, 036, 037, 038 and adds only the truly applied 040. No fabricated historical ledger entries.
- Production branch protection enabled. No deletion, deduplication cleanup or financial-row repair performed.

Supabase: `research_security_invoker_views`, mirrored by `sql/remediation_supabase_security.sql`.

- `v_top_searches`, `v_event_summary`, `v_flow_headline`, `v_amc_flows` use invoker semantics.
- Anonymous/authenticated raw-search view grants revoked.
- `v_public_amc_summary` / `v_public_asset_class_summary` count distinct schemes and expose public research data.
- Legacy materialized-view reads and old newsletter insert are intentionally not revoked before replacing their deployed clients.

### Blocked, not applied

029 transaction description/balance; 030 unresolved holdings; 031 transaction fingerprint uniqueness; 032 statement NAV/value provenance; 034 sandbox compliance records/nominee slot/provider metadata. Exact file checksums and preflight are in the schema drift report. Zero duplicate fingerprint groups and zero duplicate nominee-user groups were observed in preflight. That reduces migration risk but does not waive the outstanding approval.

## 5. Financial validation

Independent comparator does not import the publication parser or calculation functions. It freshly downloads official AMFI windows, parses with a separate CSV/Decimal path, and saves source URLs, response hashes, dated observations, expected values and differences in `tests/fixtures/financial/amfi_golden.json`. Eleven cases span Groww, Tata, Kotak Mahindra, Canara Robeco, Aditya Birla Sun Life and Franklin Templeton.

All NAVs below are as of **2026-09-07**. Returns are percentages. 1y and shorter are cumulative; 3y/5y are CAGR using actual elapsed days / 365.25. Anchors are nearest prior official NAV, at most seven calendar days before target. Missing eligible history remains null.

| Scheme | NAV | 1m | 3m | 6m | 1y | Independent difference |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 123711 | 1027.6662 | -0.03 | -0.10 | 0.22 | 0.01 | None |
| 153425 | 11.1295 | -4.96 | -1.24 | 2.44 | 1.07 | None |
| 119757 | 114.1036 | -0.72 | 2.40 | 2.38 | 3.22 | None |
| 144545 | 22.4525 | -2.86 | 1.92 | -4.41 | -7.38 | None |
| 118273 | 124.2000 | -3.01 | 5.82 | 4.63 | -3.35 | None |
| 119750 | 48.5027 | 0.63 | 2.08 | 3.51 | 6.71 | None |
| 151307 | 17.8392 | -0.79 | 3.50 | 4.16 | 14.79 | None |
| 148815 | 24.5653 | 0.74 | 12.80 | 24.08 | 18.34 | None |
| 144461 | 17.0149 | -0.32 | 1.94 | 1.71 | 3.50 | None |
| 126687 | 22.8834 | 0.05 | 1.74 | 2.33 | 4.66 | None |
| 100033 | 958.1300 | -1.06 | 7.07 | 7.64 | 7.46 | None |

3y/5y where available, volatility and drawdown also match the independent comparator. Both live databases match all eleven NAV/date pairs. This is sample evidence, not proof of equality of every warehouse row. A **post-deployment** comparison to rendered production values remains pending.

Portfolio fixtures cover +20%, -20%, -80% one-year returns, monthly SIP at an independently constructed 12%, partial/full redemption, dividend payout/reinvestment, same-day switch legs, missing NAV, stale NAV, mixed dates, duplicate uploads and rollback. Individual holding values round to paise, total is their sum, and gain is total minus cost. XIRR uses actual cash-flow days / 365. Solver range is -99% to 5,000%; unsupported/nonconvergent cases remain unavailable. Unadjusted >40% adjacent NAV discontinuities suppress computed returns/risk; no corporate-action adjustment was invented.

## 6. Coverage before / candidate

The baseline and candidate have slightly different catalog snapshots; figures are not a controlled same-date performance comparison. Eligible means active, non-IDCW; the candidate denominator is **4,251**, not the full catalog. “All” includes inactive/history-bearing records.

| Metric | Audit baseline all-universe count | Candidate all count | Candidate eligible count / 4,251 |
| --- | ---: | ---: | ---: |
| Catalog | 14,339 | 14,347 | — |
| Priced | — | 14,106 | — |
| Active | 8,601 | 8,609 | — |
| 1m | ~4,218 | 4,224 | 4,177 |
| 3m | 4,164 | 4,108 | 4,108 |
| 6m | 0 | 4,018 | 4,018 |
| 1y | 0 | 3,775 | 3,775 |
| 3y | 0 | 2,861 | 2,861 |
| 5y | 0 | 2,056 | 2,056 |
| 90-day risk | ~4,183 | 4,230 | 4,180 |
| Factsheet records in bundle | 884 | 884 | Not a return-eligible denominator |

Coverage floors for eligible schemes are 50/45/40/35/20/10/40% for 1m/3m/6m/1y/3y/5y/risk, plus a maximum 15% relative coverage drop per publication. Those conservative floors do not prove historical completeness. Manifest `2026-09-07-d55ad5f47447` checksums six published files. Its current `buildCommit` identifies the baseline HEAD at generation time; the working-tree candidate is not misrepresented as an immutable deployed commit.

## 7. Freshness and source ownership

| Domain | Observed source date / scope | Candidate disclosure / remaining limit |
| --- | --- | --- |
| NAV / returns | 2026-09-07 | Source NAV dates, not today's clock |
| SBI factsheets, 106 schemes | 2022-12-31 through 2023-05-31 | Historical/stale warning; retained, not fabricated as current |
| HDFC factsheets, 171 schemes | 2026-06-30 | Actual source date; no new source acquisition claimed |
| ICICI factsheets, 607 schemes | 2026-08-31 | Actual source date |
| Factsheet bundle | Generated 2026-09-05 | Generation explicitly distinguished from document date; fetch/parse timestamps absent from bundle are disclosed as unrecorded |
| Coverage inventory | 2026-09-06 | Separate older inventory; full regeneration remains release follow-up |
| Supabase flows | July 2026 | Source month and covered-category subtotal |
| Neon legacy flows/signals | May 2026 | Stale mirror; never promoted as authoritative fallback |
| News | All 11 configured feeds returned articles on 8 Sep | Per-source healthy/degraded/stale/disabled states; date-only SEBI timestamps remain unavailable; historical RBI timestamp rows not rewritten |

See `DATA_OWNERSHIP_CONTRACT.md`: Supabase public-source archives and publisher documents are authoritative; Neon owns users/portfolios and has explicit legacy public mirrors; bundles are derived publications. No blind synchronization was attempted.

News preflight showed 74/74 sampled failures for each of CNBC and NDTV despite existing articles. Read-only reproduction proved malformed/oversized lookup URLs, not dead feeds. New source health uses each source's 20 most recent runs, one-hour success window and 48-hour article-age threshold. New-article counts now use actual inserted rows. Older run counts/history are preserved. News sentiment mirror deduplication and complete historical timestamp repair remain follow-up work, not claimed fixed.

## 8. Security closure and residual risk

Production dependency audit of the candidate: **0 critical, 0 high, 0 moderate, 0 low**. The full dependency tree still has eight development-tooling findings: 1 critical, 4 high, 3 moderate. No test/dev server is deployed as a production service. Dev-tool upgrades remain separate compatibility work; this is not a claim of zero repository-wide vulnerabilities.

73 permanent tenant-boundary tests passed in the full run. They cover user-owned portfolios/uploads/reports, sync objects, investment sandbox records, documents and notifications with separate users and spoofed IDs. They are not a substitute for a full independent penetration test or every role's positive UI workflow.

Supabase raw search access is closed live. Latest security advisor retains only two legacy public materialized-view warnings; remediation reference: [Supabase materialized-view exposure](https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api). New invoker semantics were checked after applying the migration.

Residuals: production app still uses old dependencies/limiter until released; old newsletter insert remains; CSP allows inline scripts/styles for Next compatibility (not nonce-hardened); no independent rate-limit fallback store; no verified backup restore; organization MFA/retention/network governance need owner decisions. No real KYC or banking details should be submitted to demo screens.

## 9. Test results and honest scope

| Run | Passed | Failed | Skipped | Meaning |
| --- | ---: | ---: | ---: | --- |
| Earlier full Vitest checkpoint | 829 | 0 | 0 | Earlier candidate, not latest file state |
| Expanded full Vitest, 115 files | 849 | 1 | 0 | Failure was the mixed fixture expecting a numeric value after creating negative holdings; test isolation corrected afterward |
| Newsletter focused endpoint tests | 7 | 0 | 0 | New validation/throttle/outage contract; these were not in the 850-test run |
| Corrected portfolio-service integration rerun | 20 | 0 | 0 | Valid common-date fixture isolated; negative-unit fixture explicitly returns unavailable |
| Subsequent full Vitest, 116 files / 858 tests | 597 | 43 | 218 | Exit 1; test DB DNS errors and failed setup. Not a passing release gate |
| Final network-verified full Vitest, 116 files | 858 | 0 | 0 | Clean exit 0 in 9.6 minutes; same final candidate, explicitly isolated test database |
| Final Python suite | 179 | 0 | 0 | Includes real schema reads, financial goldens, parser, coverage and news tests |
| Independent AMFI comparator | 11 | 0 | 0 | Fresh source downloads; not application-derived expected values |
| Browser first expanded run | 40 | 2 | 0 | Transient streamed duplicate headings; assertions now wait for final DOM |
| Browser corrected assertion pass | 42 | 0 | 0 | Node/installed-Chrome runner stalled at shutdown and was interrupted (exit 130); not counted as a clean process gate |
| Final browser suite, rebuilt candidate, bundled Node 24 | 42 | 0 | 0 | Clean process exit 0; 6.5 minutes including slow worker teardown; no forced exit |
| Pinned Chromium / CI configuration confirmation | 42 | 0 | 0 | Clean exit 0 in 26.6 seconds; same assertions and isolated positive login |

The subsequent full integration run failed with `ENOTFOUND` for the test database host; setup failures left 218 tests skipped/pending. Earlier passing results did not override that failed gate. Follow-up diagnostics found the Neon test branch ready, DNS failing inside the restricted environment but resolving outside it, and an outside-sandbox read-only database connection succeeding. A fresh network-verified run started at 12:36:59 UTC and passed all 858 tests with clean exit 0 in 9.6 minutes. No product or assertion changes were made between these last two full runs; only the access conditions were rechecked. Its exact result is retained separately as `output/remediation-vitest-network-verified.json`. The failed run remains available for infrastructure diagnosis.

The existing test-only stale-fixture sweep removed 25 old test jobs and two synthetic test users on the isolated branch before the final run. This was not production cleanup; no recovery/export of those disposable fixtures was taken or claimed.

Build generates 118 static routes and passes lint/type validity. Standalone lint and publication checksum verification pass. No integration skip is being concealed as success. A mistaken `schema_baselines.checksum` assertion introduced during gate development was corrected to the actual migration column `schema_checksum`; the final 179-test Python run passed. Repeating the browser checks with Chromium 145 matched to Playwright 1.58.2 eliminated the observed shutdown delay (26.6s versus 6.5m using installed Chrome 152). The local default now uses the pinned browser just like CI; installed Chrome remains opt-in. No browser package was installed as a production component.

Clean-database replay was **not completed**: Docker is installed but its daemon is unavailable, and the historical migration chain has missing/parked provenance. Existing live-schema tests and a baseline marker are not claimed to replace a restore/replay test. CI was not pushed or run with the new workflow because credential approval remains pending.

## 10. Browser and accessibility scope

Search widths: 320, 375, 390, 768, 1024, 1200, 1279, 1280, 1440, 1920. Input focus, results, Escape, backdrop, repeated opening, focus restoration, arrow/Enter navigation, resize and browser back were tested. Seven fund pages: 100033, 100046, 120503, 125497, 135762, 150523, 154658.

Fund/category coverage includes equity, liquid/debt IDCW, tax saver, small cap, children's/solution-oriented, passive silver and a newly launched sparse-history FOF. Catalog, compare, data status, news, brief, signals, login, portfolio, invest and stocks were checked at 390/1440. Unauthenticated private APIs deny access. Positive credentials login and sandbox API mode were tested with one disposable user exclusively on the test branch.

Desktop/mobile fund screenshots were visually inspected. Keyboard dialog/focus and horizontal-overflow assertions are automated. This is **not** a complete WCAG contrast/touch-target certification, Firefox/Safari matrix, or all 99 routes' positive browser coverage.

## 11. Performance measurements

Three sequential fetches per route; milliseconds include body receipt. These are tiny samples, not load tests or Core Web Vitals. Hosted and localhost values are not directly comparable, so no percentage speedup is claimed.

| Route | Existing production before release (ms) | Candidate localhost (ms) |
| --- | --- | --- |
| Home | 4445 / 1047 / 940 | 129 / 25 / 24 |
| Search | 1936 / 612 / 575 | 4126 / 550 / 301 |
| Freshness | 1360 / 295 / 311 | 379 / 294 / 337 |
| Fund 100033 | 3600 / 1013 / 397 | 79 / 47 / 40 |
| Funds | 713 / 939 / 632 | 36 / 29 / 31 |
| Compare | 1616 / 620 / 514 | 15 / 11 / 11 |

The production fund request returned HTTP 200 but failed in the browser; its timings do not represent a successful journey. Candidate first-load JS: home ~128 kB, fund detail ~180 kB, compare ~140 kB. No speculative database index churn was done. Detailed DB/serialization/render spans and hosted after-release sampling remain open.

## 12. Intentionally incomplete features / safe deferrals

- Complete official factsheet acquisition and per-field fetch/parse lineage in publication; SBI is stale and labelled.
- Whole-domain identity/value reconciliation and reliable public mirror synchronization.
- Ten-year/since-inception and adjusted corporate-action returns; no invented results.
- Historical portfolio chart from trustworthy daily common-date snapshots; old cost-basis snapshots are not charted as market value.
- Real stock fundamentals, peers, ownership, valuation, sectors/commodities; beta/unavailable boundaries remain.
- Provider-grade order reconciliation, negative-balance prevention in direct mock reconciliation, exports/advisor tasks and secure binary document storage.
- Independent limiter fallback, nonce CSP, comprehensive accessibility/cross-browser/load testing.
- Migration replay/restore proof and organization security/recovery policy decisions.
- Production user cleanup requires owner classification: 21 of 33 users have the explicit `@mfpulse.test` domain and are candidates, not authorization to delete. The other 12 are unclassified. Preserve all related uploads, reports and audit history until an owner-approved export/retention plan exists.
- Newsletter confirmation and actual email delivery; interest capture only.
- Internal operator status secret and activated external synthetics.

## 13. Remaining mock features

KYC/PAN/CKYC, mobile/email OTP, bank verification, investment-account opening, payments, order routing/status, SIP execution, redemption/switches, registrar portfolio connect, document fetch/share/download. Mock output is labelled; provider live mode is refused. Real-money investing remains outside the authorized implementation scope.

## 14. Readiness assessment

No revised production-readiness percentage is issued before promotion and post-deployment verification. Increasing the original subjective 45% merely because local tests pass would misrepresent the live site.

| Dimension | Candidate assessment | Production assessment |
| --- | --- | --- |
| Public research | Major fixes implemented; source-depth limits remain | Not cleared pending release |
| Fund research | Representative journeys repaired | Crash still reproduced live |
| Financial correctness | Independent sampled returns/valuation fixtures reconcile | Rebuilt publication not promoted |
| Portfolio | Common-date/transactional path implemented | Missing schema blocks release |
| Data | Explicit dates/ownership; incomplete factsheets/mirrors | Partial |
| Security | Patched candidate; live privacy/protection improvements | Partial, old application still serves |
| Database | Test usable, drift identified, safe gate added | Approval/restore/provenance gaps |
| Stock intelligence | Beta/limited | Not complete |
| Investment execution | Sandbox only | 0% real-money readiness claimed |
| Overall | Release candidate, not certification | Blocked |

## 15. Release verdict and next authorized step

| Question | Verdict now |
| --- | --- |
| Public research production-ready? | **NO** — candidate unreleased; live fund error remains |
| Portfolio analytics production-ready? | **NO** — required production schema missing |
| Real-money investing production-ready? | **NO** |
| Financial calculations trustworthy? | **PARTIALLY** — independently validated candidate/sample scope; not production-wide certification |
| Data freshness trustworthy? | **PARTIALLY** — NAV dates verified, old factsheets/mirrors remain explicitly limited |
| Safe for general public portfolio uploads? | **NO for a new general launch** until prerequisite migrations, candidate release and live isolation/reconciliation checks complete |

Approvals needed: (1) exact production Neon migrations 029–032 and 034; (2) existing isolated `TEST_DATABASE_URL` stored as encrypted Actions secrets in `S-h-u-b-h-1/mutual-funds` and `S-h-u-b-h-1/MF-Pulse`.

After approval: recheck collisions and actual schema; apply reviewed migrations transactionally with lock timeout and exact checksum ledger entries; run read-only production schema gate; reconcile with current origin/main without dropping later data commits; run remaining release gates; deploy to the verified Vercel project `prj_YlcwLuyQz0eYd0U90gAZc5dbN0iP`; verify immutable deployment before moving `mf-pulse.vercel.app`; then remove legacy Supabase grants and rerun live smoke/financial/advisor/integrity checks. Never run the entire historical migration directory blindly against production.

### Evidence files

- Original deep audit and API inventory: `docs/MF_PULSE_DEEP_AUDIT_2026-09-08.md`, `docs/MF_PULSE_API_INVENTORY_2026-09-08.md`.
- `output/remediation-vitest.json`, `output/remediation-vitest.log` — expanded 850-test checkpoint, not the latest full-suite output.
- `output/remediation-vitest-final.json`, `output/remediation-vitest-final.log` — failed 858-test run with DNS/setup errors, retained separately.
- `output/remediation-vitest-network-verified.json` — latest full run: 858 passed, zero failed/skipped, clean exit 0.
- `output/playwright/remediation/results.json` and fund desktop/mobile PNGs — browser evidence; check process-exit notes, not just assertion counts.
- `tests/fixtures/financial/amfi_golden.json` — independent observations, expected values and source hashes.
- `output/latency-candidate.json`, `output/latency-production-before-release.json` — separated performance samples.
- `scripts/check_release_schema.py`, `scripts/publication_contract.py`, `scripts/verify_financial_samples.py` — reproducible release checks.

Final live integrity checkpoint: users/holdings/uploads/transactions 33/28/44/6, zero orphan holdings/uploads/transactions, zero waiting locks. Live application still identifies commit `9403eadcc641950358652adc71b6d1d2994f4d3d`, branch main, NAV 2026-09-07 and CURRENT NAV coverage; it does not yet serve the remediation publication manifest.
