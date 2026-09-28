# MF Pulse remediation log

Started 2026-09-08. Branch: `codex/mf-pulse-remediation-2026-09-08`.

## Latest approved-action checkpoint

At 13:03:48 UTC, explicitly approved migrations 029–032 and 034 committed after checksum/collision/schema preflight, guarded locks and historical-row fingerprint checks. The immediate read-only post-commit schema/integrity gate passed; all seven guarded table counts and pre-existing row fields remained unchanged. The earlier approval-hold entries below are preserved as history.

New blocker: the existing test credential authenticated to both test and production. It was **not** uploaded to either GitHub repository. No deployment or promotion occurred. Approval for a new CI-only test-branch role/credential has been requested. Full evidence and current next steps: `APPROVED_RELEASE_ACTIONS_2026-09-08.md`.

## Baseline

- Local commit: `4621516403d6cbe918823fe5c14bf7c3f6f5624e`.
- Production API-reported commit: `9403eadcc641950358652adc71b6d1d2994f4d3d`; deployment-management connector returns team-scope 403.
- Production publication/NAV: 2026-09-07. Coverage 8,565/8,701 (98.44%). Supabase NAV observations 855,972; Neon 855,840. Live ingestion continues during remediation.
- Neon production ledger: 022, 033, 035, 036, 037, 038. Supabase: 12 migrations, latest 20260813151108.
- Neon `test` branch is now ready; previous archived-state hypothesis requires fresh connectivity validation.
- Python baseline: 138 passed / 12 skipped (database URL absent).
- Frontend baseline inside restricted network: 416 passed / 54 failed / 273 skipped; failures are DNS-related. Retrying outside sandbox to distinguish infrastructure from network restrictions.
- Lint and build pass. Fund 100033 production application error reproduced before editing.

## Change ledger

| ID | Finding | Root cause | Files changed | DB change? | Tests | Production verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Fund detail crash | Missing canonicalKey import | marketImpact.js, regression tests | No | Representative fund browser tests | Error still present on old deployment at 11:36 UTC | Candidate fixed, release held |
| 2/3 | Portfolio dates/totals | Wall-clock terminal date; raw/revalued report split | revaluation, casNormalizer, xirr, intelligence route, portfolioService | Uses missing production prerequisites | Golden examples; rollback/concurrency; corrected service integration 20/20 | Production counts preserved | Candidate fixed, schema approval blocked |
| 4 | Sandbox boundary | Mock providers inside production-looking UI | invest layout/providers/observability, onboarding/document UI, portfolio warning | No live-provider integration | Positive isolated login and API mode check | Not deployed | Candidate safely gated |
| 5 | Responsive search | Dialog nested in hidden navigation; early hydration event race | Search.jsx | No | Ten widths, keyboard/resize/back/focus | Not deployed | Candidate fixed |
| 6/11/23 | Dependencies, fail-open limiter, headers | Old packages, allowed=true on DB error, absent hardening | package files, rateLimit, next.config | None | Zero production advisories, concurrent outage tests, header checks | Old app still serves | Candidate fixed |
| 7/13/14 | Counts and public analytics privacy | NAV join counts; definer/raw search view exposure | status/analytics pages, Supabase SQL | Invoker/replacement views applied; raw-query grant revoked | Live privilege/advisor/distinct-count checks | Raw search inaccessible, zero definer errors | Live partial; two legacy matview grants pending cutover |
| 8/9/10/16 | Data correctness and evidence | History parser/index/chunk logic and sparse-score renormalization | amfi_history, build_performance, manifest, health/quality engines | No direct financial-row patch | Independent AMFI 11/11, coverage gates, Python tests | Sample latest NAVs agree in both warehouses; publication unreleased | Candidate fixed with explicit source-depth limits |
| 12/20 | Test infrastructure and governance | Missing CI secret; production/test schema drift | test guard, CI, check_release_schema, 040 | Branch protected; 040/baseline applied | Final network-verified full run 858 passed, zero failed/skipped, exit 0; earlier DNS-failed run retained in report | Five required migrations rejected pending approval | Local verification passes; production/CI blocked on precise permissions |
| 15/18 | AUM/factsheet scope | Subtotal/creation-date semantics | homepage/FundPageClient provenance | Historical data preserved | Source dates/counts checked | New labels not deployed | Candidate labelled; fresh source acquisition deferred |
| 17 | News pipeline | Raw URL query fragments and overlong lookup; runner timezone | ingest_news, newsStatus, source-health UI | No live ingest run in this correction | Both old lookups 400, both new lookups succeed; six parser/lookup tests | Eleven feeds fetched read-only | Candidate corrected; source SLA/history follow-up remains |
| 19/22/24/25 | API scope, SEO, status and performance | UUID cast, missing source providers, obsolete origin, missing status secret | observability, beta layouts, siteUrl, synthetic workflow, latency script | No speculative indexes | Invalid ID contract, origin tests, measured six routes | Internal status deliberately remains fail-closed | Candidate narrowed; operator config/promotion pending |

Detailed closure evidence and limitations: `MF_PULSE_REMEDIATION_REPORT_2026-09-08.md`; exact schema differences/checksums: `SCHEMA_DRIFT_2026-09-08.md`.

## Approval holds

1. The safety reviewer rejected production DDL for 029–032 and 034. No statement from that transaction executed. Explicit user approval requested; no retry/workaround used.
2. The safety reviewer rejected copying TEST_DATABASE_URL into the encrypted Actions secret stores for S-h-u-b-h-1/mutual-funds and S-h-u-b-h-1/MF-Pulse. Explicit credential/destination approval requested; no secrets uploaded by that attempt.

The attached remediation brief authorizes controlled repair/deployment, but these concrete approval holds must be resolved before proceeding. Production promotion is deliberately not attempted while the candidate references missing schema. No historical production row was removed.
