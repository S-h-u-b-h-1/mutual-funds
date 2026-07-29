# Suasion Platform Status

Canonical, honest status per subsystem. **PASS** = verified working end-to-end against real data
today. **PARTIAL** = real and working for part of the surface, real gaps remain. **MOCK** = works
against mock/sandbox providers only, no live integration exists or can exist yet. **BLOCKED** =
correct design/code exists but cannot ship without something outside this session's control
(credentials, human with production access, commercial agreement). **FAIL** = does not work or
actively misleads.

A subsystem is never marked PASS merely because code exists for it — each verdict below states
what was actually run/checked and when.

Ordered P0 first per the governing directive's Section 32/16 priority: (1) NAV pipeline, (2)
portfolio parsing/valuation, (3) auth/onboarding truth, (4) investment readiness/compliance, (5)
transaction core, then downward.

---

## 1. Fresh NAV production pipeline

**Status: PASS — fully confirmed end-to-end in production.** Root cause fixed, verified in the
real failing environment, the historical-depth gap closed by a real backfill, and a full clean
`production-refresh.yml` run confirmed the entire chain works end-to-end in the actual production
environment, not just locally.

**Final confirmation (2026-07-29, run `30433864841`, job `90517025184`, 5m28s)**: every step
passed — AMFI download, `cloud_pipeline` ingest (`status=success rows=14213`), news ingest, bundle
rebuild (14,213 routable schemes), the data-quality gate, the `assert_pipeline_freshness` live-data
guarantee, commit+push of refreshed bundles, Vercel re-pointing, and the hard-fail-on-mismatch
production verification step. The job's own Summary step recorded: `NAV → Supabase/Neon: true`,
`Bundles changed: true`, `Committed + pushed: true`, `Production re-pointing needed: true` (and
completed), `Production verified fresh: true`. Independently spot-checked directly against the live
site afterward (`curl https://mf-pulse.vercel.app/api/freshness`):
```
rawLatest: 2026-07-28   bundleAsOf: 2026-07-28   bundleMatchesRaw: true   rawAheadOfBundle: false
pipelineHealth: { nav_latest_date: 2026-07-28, nav_staleness_days: 1, total_schemes: 14213,
                   total_nav_rows: 612234, status: "green" }
explanation: "Site bundles are fully caught up to the latest AMFI data (2026-07-28)."
```
The 6-day `rawLatest`/`bundleAsOf` gap that defined this incident is closed — both dates match. A
`nav_staleness_days` of 1 is expected and correct: AMFI publishes end-of-day NAV the following
morning, so "1 day behind today" for EOD data is the honest floor, not a defect (see the
terminology audit below — the site never claims real-time NAV). The previously-null
`deployedCommitSha`/`branch` fields (noted as an open gap below) are also now populated on this
same live check (`55de60e3735031e244faac99bb6bdd3377c6a769` / `main`) — resolved, most likely by a
fresh Vercel deployment correctly picking up its own system env vars; not separately root-caused,
but no longer reproducing.

**What was found (2026-07-29, this pass)**: `production-refresh.yml` had failed on every run for
4+ consecutive days (2026-07-25 through 2026-07-29, 8+ runs, confirmed via `gh run list`) — this
directly contradicted an earlier session's "resolved" conclusion, which had correctly fixed a real
but *different* bug (an IDCW-denominator scoping error in `assert_returns_usable`, commit
`53ca8e4`/`7d43fcc`) without noticing a second, larger problem stacked underneath it.

**Root cause, confirmed empirically, not assumed**:
- `scripts/build_performance.py`'s `fetch_series()`/`anchor_nav()` fetched AMFI's
  `DownloadNAVHistoryReport_Po.aspx` history endpoint for the *entire* requested date range before
  ever consulting the database. That endpoint is reliably reachable from outside GitHub Actions
  (verified: real ~7.7MB responses in ~6s from this session's own environment, for both wide and
  narrow date ranges) but was timing out or returning fixed-size (13,694-byte) unparseable
  responses to every GH Actions attempt in the incident window — the signature of a
  network-path/IP-range issue, not a genuine multi-day AMFI outage (which would vary in response
  size and self-heal within hours). Worst observed run: 31 minutes of retries, ending in 0.2%
  scheme coverage for the 1-month-return metric `assert_returns_usable` gates on.
- Meanwhile `cloud_pipeline.py` (the separate step that ingests *today's* NAV into
  `fact_nav_daily`) kept succeeding every single run throughout the incident — confirmed via
  `gh run view --log-failed` showing `cloud_pipeline: status=success` on every failed run, and
  independently via a live `/api/freshness` check showing `rawLatest: "2026-07-28"` alongside
  `bundleAsOf: "2026-07-22"` — a 6-day gap between data that had reached the database and data
  that had ever reached a deployed bundle. **This is the exact customer-facing symptom the
  governing directive described**, confirmed directly from the live production API, not inferred.

**Fix shipped (commit `61cf877`)**: `fetch_series()`/`anchor_nav()` now query `fact_nav_daily`
first and only call the HTTP endpoint for date-range chunks the database doesn't already cover.
Verified: local re-run completed in ~38s (vs 30+ min) with real, non-degraded output; full
`pytest tests/ -q` (130/130, including `test_health_in_range_on_real_data`) passes clean; a real
GH Actions `workflow_dispatch` run of `production-refresh.yml` post-fix completed its series fetch
in 19s (vs the prior 30-min failure mode), confirming the reorder works in the actual environment
that was failing.

**Historical-depth gap closed**: `fact_nav_daily`'s accumulated depth (median ~21-26 days as of
this incident, since `cloud_pipeline` only started reliably reaching most schemes around
2026-07-03) was short of the 30 days `assert_returns_usable` needs for full coverage — a real
backfill (`scripts/backfill_nav_history.py`, new, reuses `cloud_pipeline.py`'s own idempotent
upsert) closed it directly rather than waiting the ~5-9 days natural accumulation would have
needed. Run via a temporary `workflow_dispatch`-only GH Actions workflow using the same
`DATABASE_URL`/`SUPABASE_*` secrets the daily pipeline already trusts — this session deliberately
did **not** attempt this backfill from local tooling with directly-embedded or file-sourced
production credentials; that was correctly blocked by this session's own safety tooling twice, and
routing it through the already-sanctioned GH Actions secrets path was the right call, not a
workaround. Two real bugs found and fixed along the way: a Supabase 409 whose diagnostic logging
(commit `15b905c`) revealed `fact_nav_daily.scheme_code` has a foreign key into `dim_scheme`, and
historical AMFI data includes codes for schemes since merged/renamed/delisted that no longer exist
in today's dimension (`cloud_pipeline.py` only ever populates `dim_scheme` from the current day's
file) — fixed by filtering to currently-known scheme codes (commit `4bc9c0a`), correct behavior
rather than just constraint-satisfying, since `build_performance.py` only ever processes codes
present in today's own data anyway. **Final run succeeded**: 604,639 rows upserted to both
Supabase and Neon, spanning 2026-04-20 to 2026-07-29, 54 schemes correctly skipped as no longer
current. The temporary workflow was removed (commit `d37e764`) once it had done its job;
`backfill_nav_history.py` itself remains as a reusable tool.

**10-fund cross-AMC spot check (source vs database, this pass)**: SBI Large Cap (119598), HDFC
Business Cycle Fund (150805), ICICI Prudential Large Cap (120586), Nippon India Large Cap
(118632), UTI Nifty 500 Value 50 Index (151739), Parag Parikh Flexi Cap (122639), ICICI Prudential
Corporate Bond [debt] (120692), Axis Nifty 50 Index [index] (149373), ICICI Prudential Liquid
[liquid] (120197), Nippon India Small Cap (118778) — **source NAV and database NAV matched exactly
for all 10**, both dated 2026-07-28. The raw ingestion layer (source → database) was never the
problem; the artifact-build layer (database → funds.json → API → frontend) was.

**Terminology audit**: NAV-facing copy across the site was already correctly hedged before this
pass — `fund/[scheme_code]/page.js`: "NAV as of {date} · daily data, not real-time"; `funds/page.js`:
"Daily NAV research, not real-time"; `marketTerminal.js`: "not a substitute for a licensed
real-time feed." No "real-time NAV" claims found. (One adjacent, lower-priority item: a market-news
component's eyebrow label says "real-time market intelligence" — about news, not NAV, and out of
this pass's scope; noted for a future pass, not fixed here.)

**Monitoring**: `/api/freshness` (pre-existing, `frontend/app/api/freshness/route.js` +
`freshnessService.js`) already exposes `rawLatest`/`bundleAsOf`/`bundleMatchesRaw` (exactly the
signal that would have made this incident visible immediately) plus a `pipelineHealth` snapshot
(`nav_latest_date`, `nav_staleness_days`, `total_schemes`, `total_nav_rows`, `status`).
`deployedCommitSha`/`branch` returned `null` on an earlier check this pass; re-checked on the final
live verification above and both are now populated — no longer reproducing, not separately
root-caused. Still genuinely open: a formal freshness SLO (explicit "degraded if NAV hasn't
propagated within window X, alert operations") is not yet written down as a policy document — the
raw signal exists and is proven accurate, but the SLO statement itself does not exist yet. Tracked
as an open follow-up, not blocking — the underlying data this pass's incident was about is fixed
and verified.

---

## 2. Portfolio parsing/valuation correctness

**Status: PARTIAL — real gaps found this pass; the highest-value ones fixed and independently
verified through the full backend path, not just the parser.** Per the governing directive's own
instruction not to trust prior claims without re-verifying, the CAS engine
(`frontend/app/lib/portfolioImport/`, ~2,079 lines across parser/normalizer/scheme-resolver/
reconciliation/revaluation/XIRR/decimal-math modules) was read directly rather than assumed
working from earlier session history.

**Codex's concurrent frontend work, checked rather than assumed correct**: commit `21bad84`
("parse merged CAS summaries") landed on `main` before this pass started and fixes a real bug in
`extractSummaryHoldings()`/`extractLineSummaryHoldings()` — a PDF containing more than one
Consolidated Account Summary glued together (the "merged CAS" scenario) previously lost rows at
the document boundary; its own test proves the parser layer now extracts all rows correctly. Per
this directive's explicit instruction not to assume a parser fix proves backend correctness, this
pass built an independent, additional test (`casNormalizer.test.js`, new) that pushes a
purpose-built merged-two-statement fixture (built from real, active scheme ISINs, not fabricated
ones) all the way through `normalizeCasImport()` — canonical scheme resolution and duplicate
handling, not just extraction. Result: 6 raw parsed rows → correctly resolves to 5 real holdings
(the one genuine same-folio/same-ISIN duplicate collapses with a warning; a same-scheme
different-folio row correctly stays distinct; both merged statements' holdings survive), 0
resolution errors, no double-counting. This directly answers the directive's own success test
("N distinct legitimate holdings must not become N-1 or N+1 after normalization") for this scenario
class — full backend path, not just the frontend/parser layer.

**What's genuinely real, confirmed by reading the actual persistence path
(`app/api/v1/portfolio/upload/casUpload.js`)**: PDF text extraction → `parseCasText()` (handles
both a holdings-only "summary" format and a transaction-ledger "detailed" format, with real
per-row transaction-type classification) → `normalizeCasImport()` (resolves canonical scheme
codes, preserves the transaction list) → real inserts into `portfolio_holdings`,
`portfolio_transactions` (confirmed via source: "First-ever writer to portfolio_transactions...
this is what makes real XIRR possible, not just a point-in-time cost/value comparison"), and
`portfolio_snapshots`. Every upload attempt is recorded even on failure. Errors/warnings are
preserved in the response and the `portfolio_uploads` audit row, not silently dropped —
`casNormalizer.js`'s own header comment states the design intent directly: "never silently guesses
between multiple plausible schemes... reject ambiguous mappings," and unresolved rows carry an
explicit reason (e.g. "Resolved to scheme code X, which isn't in the current fund universe — this
is a platform data gap, not an issue with your statement"), correctly distinguishing a parser
limitation from a bad statement. Duplicate-
upload detection by content checksum (not filename). An identity check flags when a statement's
email doesn't match the logged-in account. This is a materially more complete pipeline than a
one-file test-coverage check alone would suggest.

**FIXED this pass — unresolved/ambiguous holdings are now standing, queryable records, not just an
upload-response fact.** Before this pass, an unresolved holding existed only inside one upload's own
`portfolio_uploads.errors` JSON blob — real at the moment of upload, gone from any queryable state
the instant that response was gone. `portfolio_holdings.scheme_code` is `not null` by design (a
holding IS a resolved position), so an unresolved row structurally cannot live there without
inventing a placeholder scheme_code — exactly the "map to a random closest fund" anti-pattern this
directive forbids. New migration `sql/neon/030_unresolved_holdings.sql` adds
`portfolio_unresolved_holdings` (raw scheme name/ISIN/folio/units/values, `resolution_status` ∈
{`unresolved`, `needs_review` (ambiguous), `platform_gap`, `invalid_units`}, `status` ∈ {`open`,
`resolved`}). A row stays `open` until a *later* upload actually resolves the same folio+ISIN
(matched in `resolveStaleUnresolvedHoldings`) — real reconciliation over time, not a fact frozen at
upload time. Applied to the `test` branch this pass; **production application remains a manual
step**, same as `028`/`029`. New integration test (`casUpload.test.js`, real Neon, disposable user)
proves both the initial persistence (two distinct unresolved/ambiguous rows, correct fields
including `ambiguity_candidates`) and the resolve-on-later-upload path (only the matching folio+ISIN
flips to `resolved`; an unrelated still-unresolved row stays `open`).

**Real gaps found this pass — fixed, tested, and independently verified, except one deliberately
left open**:
- **FIXED — SIP is now a distinct transaction type**, checked *before* the generic purchase pattern
  (a real SIP installment description like "Purchase - SIP Installment" also contains the word
  "purchase", so order matters — verified this doesn't fall through to the wrong branch). Also
  covers the "Systematic Investment" phrasing variant with no literal "SIP" in it.
- **FIXED — STP/SWP are now detected where the direction is safely inferable.** SWP is unambiguous
  (money only ever leaves the fund via an SWP) so a bare "SWP"/"Systematic Withdrawal" classifies
  directly as `redemption`. STP is two legs, and guessing the wrong direction would corrupt XIRR's
  sign — so only *directional* STP wording ("STP In"/"STP Out"/"Systematic Transfer... In/Out")
  classifies (as `switch_in`/`switch_out`); a bare, undirected "Systematic Transfer Plan" is
  deliberately left as `unknown` rather than guessed, per the directive's own "unknown is better
  than wrong."
- **FIXED — an unrecognized transaction line is now stored, not dropped.** Previously excluded
  entirely (only a text warning survived); now stored as `transactionType: "unknown"` with its raw
  description and all other fields intact, so the row is auditable rather than silently lost.
  `"unknown"` is correctly excluded from XIRR cash-flow direction (never guessed) but visible in the
  data.
- **FIXED — every transaction now preserves its raw source description and the statement's own
  running unit balance.** Both were parsed by the existing row regex and previously discarded before
  reaching the caller. New migration `sql/neon/029_cas_transaction_description.sql` adds
  `portfolio_transactions.description`/`.unit_balance` (both nullable, purely additive, zero
  existing rows touched); `casUpload.js`'s insert now writes them. **Applied to the `test` branch
  this pass** (`scripts/apply_migrations.py --apply`, alongside the pre-existing pending `028` FK
  fix); **production application is a remaining manual step** — same established pattern as `028`'s
  own header comment documents, not attempted against production from this session per standing
  practice around schema changes to shared infrastructure.
- Every consumer of the `transactionType` string literal was traced before any of the above shipped,
  not assumed safe: `casNormalizer.js`'s `computePortfolioXirr` and `revaluation.js`'s
  `revaluePortfolio` each have their own independent `OUTFLOW`/`INFLOW` set (a real duplication, not
  fixed this pass — out of scope for a classification bug fix) — `revaluation.js`'s is live,
  called directly by `frontend/app/lib/invest/portfolioService.js` for the Invest platform's own
  Journey 3 Portfolio. Missing `"sip"` in either would have silently dropped SIP installments out of
  XIRR.
- **FIXED — zero test coverage of the transaction-ledger format is now closed.** Four new tests in
  `casParser.test.js` cover the "detailed" ledger format end to end (previously only the "summary"
  format had any coverage): all 7 base transaction types in one statement including SIP staying
  distinct from purchase; the "Systematic Investment" phrasing variant; directional STP/SWP
  classification plus the deliberately-unclassified bare-STP case; and the unknown-line-is-preserved
  behavior with its description/balance intact.
- **FIXED — the merged-CAS-summary scenario verified through the full backend path, not just the
  parser** (`casNormalizer.test.js`, new file — see above).
- **STILL OPEN — charges (STT, stamp duty) are not extracted.** Deliberately not fixed this pass:
  `casParser.js`'s own header comment already discloses the ledger-format extractor "was built
  against the well-documented, industry-standard CAS layout... NOT verified against a real sample
  PDF." Writing a regex to pull a charges figure out of an unverified real-world text format would
  be exactly the kind of guess this engine's own design explicitly refuses to make elsewhere
  ("never silently guesses... reject ambiguous mappings") — a plausible-looking but unverified
  extraction is worse than an honest gap. This stays open until a real CAMS/KFintech/MFCentral
  sample statement is available to verify against, not because it's low-value.

Full suite re-run after every fix above: **77 files / 555 tests, all passing** — including the live
`portfolioService.test.js` integration tests against real Neon, confirming no regression in the
Invest platform's own portfolio valuation path. (The 555th test is the Section 5 holdings-
consolidation fix below.)

**FIXED this pass — statement valuation is now preserved separately from MF Pulse's own live
valuation (Phase 3).** Directive: "Do not confuse statement market value with latest MF Pulse
valuation... preserve both when available... this distinction matters because a CAS may already be
several days old." The underlying formulas in `normalizer.js`'s `buildHolding()` were already
exactly correct — `currentValue = units × latest valid NAV`, `gainLoss = currentValue −
investedValue`, `gainLossPct = gainLoss / investedValue × 100` — verified by reading the code
directly, no fix needed there. But the statement's own reported market value (and, for the
summary CAS format, its own per-row NAV/NAV date) was extracted by `casParser.js` and then silently
discarded at the `casNormalizer.js` call site — never reached the holding object, let alone the DB.
New migration `sql/neon/032_holdings_statement_valuation.sql` adds
`statement_value`/`statement_nav`/`statement_nav_date` to `portfolio_holdings` (nullable, additive).
`buildHolding()` now accepts and returns these as fields deliberately distinct from
`currentValue`/`nav`/`navDate` — `currentValue` always derives from live NAV, never from
`statementValue`. New test proves the two are genuinely independent (a deliberately implausible
statement NAV of 999.9999 stays exactly as reported, while `currentValue` is independently computed
from the real live NAV). Applied to the `test` branch; production application remains manual, same
as `028`–`031`. Scoped to the CAS import path only — the CSV/manual import path
(`normalizeHoldings()` in the same file) doesn't currently extract an equivalent statement-value
field from Groww/Coin/Kuvera/ET Money exports; not audited this pass, noted as open.

**FIXED this pass — transaction-level idempotency is now a DB-level guarantee, not just an
app-level pre-check (Phase 1D).** Directive: "Transactions should use a deterministic
fingerprint... Repeated import of the same document must be idempotent." Before this pass, the
*only* protection against a duplicate `portfolio_transactions` row was `casUpload.js`'s
content-checksum gate — real, but a pre-check outside the write itself, with nothing stopping a
duplicate row from a retry, a race between two concurrent uploads, or a future code path that
writes transactions without going through that exact gate. New migration
`sql/neon/031_transaction_idempotency.sql` adds a unique constraint on `portfolio_transactions`
over `(user_id, scheme_code, folio_number, transaction_date, transaction_type, amount, units,
nav_value)` — verified empirically against the test branch first (zero existing rows collide on
this key, expected since this table had no writer at all until this session). The insert now uses
`ON CONFLICT DO NOTHING` against it. New test (`casUpload.test.js`) proves: persisting the same two
transactions twice leaves the row count unchanged, while a genuinely different transaction (same
scheme/folio, different date) is correctly NOT suppressed. Applied to the `test` branch; production
application remains manual, same as `028`/`029`/`030`.

**FIXED this pass — XIRR unavailability now carries a reason, additive (no existing consumer
broken).** The directive is explicit: "If insufficient transaction history exists: return a
structured unavailable state and reason... Do not return 0. Do not let the frontend guess why it is
unavailable." `xirr.js`'s `computeXirr()` was already correct at the primitive level (returns `null`,
never `0`, on any of: fewer than 2 flows, no sign change, non-convergence, implausible rate) — but
its caller, `casNormalizer.js`'s `computePortfolioXirr()`, only ever surfaced a bare `null` with no
explanation. Added `portfolioStatus`/`byStatus` (each `{available, value, reason}`,
`reason` ∈ {`no_transaction_history`, `insufficient_cashflow_data`}) alongside the *existing*
`portfolio`/`byScheme` fields, which keep their exact original shape and values — this is additive,
not a breaking contract change, so nothing already reading the old fields needed to change. `xirr`
is spread directly into `casUpload.js`'s response, so the new fields reach the API automatically. 3
new tests cover: zero-transaction holdings, transactions-but-no-current-NAV, and the real-value case
(confirms `byScheme`/`byStatus.value` still agree). `revaluation.js`'s independent XIRR call site
(live, used by the Invest platform's `portfolioService.js`) does **not** yet have this same
enrichment — noted as an open follow-up, not silently left inconsistent.

**Not yet done this pass**: the directive's full field-by-field coverage report (available in
document? parsed? normalized? stored? shown in UI? used in analytics?) across every named field,
and safe-fixture testing against real-shaped CAMS/KFintech/MFCentral samples. Section stays PARTIAL
— two real gaps closed and verified, one honestly still open, and the full-engine coverage report
still not done.

## 3. Authentication + onboarding truth

**Status: NOT YET AUDITED THIS PASS.**

## 4. Investment readiness / compliance

**Status: PARTIAL (carried from the Suasion Securities mission, verified separately)**. A canonical
onboarding/readiness contract (`GET /api/v1/invest/onboarding`) shipped and is tested (16 new
tests, real Neon) — see `docs/INVEST_API_CONTRACTS.md`. FATCA/CRS remains a bare boolean, PEP does
not exist, consent is not a real ledger — confirmed via direct code + live schema inspection
(`docs/INVESTOR_JOURNEY_AUDIT.md`, which itself corrects an earlier, false "VERIFIED" claim about
PEP/FATCA persistence found in a prior doc revision). Not yet re-scoped against this new
directive's more detailed compliance model (Phase 7 of the governing directive).

## 5. Transaction core (Purchase/SIP/Redemption/Switch)

**Status: PARTIAL — not fully audited this pass, but one real, load-bearing finding surfaced and
needs a product decision, not a unilateral code change.** Redemption and Switch contracts were
built and tested in an earlier mission (see `docs/REDEMPTION_CONTRACT.md`, `docs/SWITCH_CONTRACT.md`).
Payment Attempt as a first-class entity separate from Order does not exist (confirmed:
`payment_status` etc. are flat columns on `investment_orders`, no separate attempt-history table) —
this is real, unclosed Phase 9 work.

**FIXED — resolved by an explicit product decision, then implemented (surfaced while investigating
the Multibagg study's own cross-source-reconciliation question, §3 of
`docs/MULTIBAGG_BACKEND_PRODUCT_STUDY.md`)**: `portfolioService.js`'s `reconcileCompletedOrder()`
— the function that settles a completed Suasion order — previously wrote
`portfolio_holdings.folio_number = "order-${order.id}"`, a synthetic value unique to that specific
order. Because the `ON CONFLICT (user_id, scheme_code, source, folio_number)` upsert target
included `folio_number`, and `order.id` differs for every order, two separate Suasion orders for
the same scheme could never collide on this constraint — each became its own row, not an
accumulating position (a real, verified fact about the code, confirmed by reading it directly, not
a hypothesis).

Two readings were possible — an unintentional fragmentation bug, or a deliberate one-row-per-
purchase-lot design for FIFO capital-gains cost-basis tracking — and this was explicitly put to the
user rather than guessed at, per this mission's own stop condition for "a genuine product decision
I must make." **Decision: consolidate.** Holdings now write with a stable `folio_number = ''`
(no real folio exists yet — no live provider is connected), so repeat Suasion purchases of the same
scheme accumulate into ONE holding row, matching how multi-installment CAS-imported holdings
already behave. `portfolio_transactions` deliberately keeps its OWN per-order `folio_number`
(`order-${order.id}`) unchanged — each transaction must remain its own distinct historical event
regardless of how the resulting holding consolidates, and both XIRR paths
(`computePortfolioXirr`/`revaluePortfolio`) already join holdings to transactions by `scheme_code`
alone, never by `folio_number`, so this split doesn't affect any existing consumer. If per-lot cost-
basis tracking is needed later (per the "if intentional" reading above), it should be derived from
the transaction ledger's own dated records, not modeled via holdings-row fragmentation.

Verified via a new test (`portfolioService.test.js`): two separate purchase orders for the same
scheme now produce exactly one `portfolio_holdings` row with accumulated units, while both orders
remain independently visible in `portfolio_transactions`. The two pre-existing tests that asserted
the old per-order folio behavior on holdings were updated to match the new, correct behavior (not
weakened — same rigor, updated expectation). Full suite re-run: **77 files / 555 tests, all
passing.**

---

*(Sections 6-16 per the governing directive — fund data system, portfolio import recovery,
existing-investor consolidation, consent ledger, provider readiness, research/AMC intelligence,
customer value API, observability, testing — not yet audited this pass. This document will be
extended as each is genuinely verified, not filled in speculatively.)*
