# Portfolio Accounting and Daily Valuation Audit

Complete CAS Portfolio Accounting and Daily Valuation Mission, Phase 1. Extends
[PERSISTENT_PORTFOLIO_AUDIT.md](PERSISTENT_PORTFOLIO_AUDIT.md) (the prior mission's audit, still
accurate) with the accounting-specific findings this mission's own scope requires: exact fields
extracted vs. lost, reconciliation gaps, and calculation accuracy — verified directly against the
parser code, the live schema, and one real CAMS statement (figures never logged, printed, or
committed, per the standing privacy rules governing that document; see the git history for the
numbers-only/structure-only verification methodology used throughout).

## 1. Fields currently extracted (casParser.js, as of this mission)

| Field | Ledger CAS | Summary CAS | Notes |
|---|---|---|---|
| Provider (CAMS/KFin/MF Central) | ✅ | ✅ | `detectProvider()` |
| Statement date | ✅* | ✅ | `extractStatementDate()`, new this mission. *Ledger format has no single document-level date the way Summary's "As on" header does — stays null there. |
| Investor name/email/mobile/PAN | ✅ | partial | Summary format's investor block is less structured; name/email extract reliably, mobile/PAN not yet verified against a real Summary sample. |
| Folio number | ✅ | ✅ | Plain text today (Phase 13 gap, see §5). |
| AMC | derived | derived | Not extracted directly — comes from the resolved fund record, not the statement text. |
| Scheme name (source) | ✅ | ✅ | |
| ISIN | ✅ | ✅ | |
| Plan (Direct/Regular) | ✅ | ✅ | `derivePlanOption()`, new this mission — parsed from the already-extracted scheme name text. |
| Option (Growth/IDCW) | ✅ | ✅ | Same function; "Dividend" (pre-2021 AMFI naming) mapped to IDCW. |
| Demat/Non-Demat | ✅ | ✅ | Found and fixed a real bug this mission: the Summary path's scheme-name cleanup strips the "(Non-Demat)" suffix for display, so deriving demat from the already-cleaned name always saw it as absent. Fixed by reading the flag off the pre-strip text. |
| Unit balance | ✅ | ✅ | |
| Statement NAV + NAV date | ✅ | ✅ | |
| Statement market value (per holding) | ✅ | ❌ | The Summary format's glued trailing currency field is Cost Value, not market value — confirmed structurally this mission (see §3). A Summary statement genuinely does not expose a per-holding market value; this is a source-document limitation, not a parser gap. |
| Cost/purchase value (per holding) | ✅ | ✅ | |
| Statement's own declared grand total(s) | n/a | ✅ | `extractStatementDeclaredTotal()`, new this mission — both a market-value total and a cost-value total, glued together in the Summary footer. Not applicable to the ledger format, which has no single document-level total. |
| Entry-load / exit-load disclosure | ❌ | ❌ | Not present in either real sample checked this session. Correctly returns absent rather than guessed — this may exist in other statement variants not yet seen. |
| UCC | ❌ | ❌ | Not attempted; not observed in any real sample. |
| Taxation classification | ❌ | ❌ | Not stated in any real sample seen; would only ever be extracted if explicitly present, never inferred. |

## 2. What's lost after parsing (not persisted anywhere yet)

- Raw text snippet per field, source page number, source line/table region, parser version,
  per-field confidence/validation status — none of this exists today. The current parser returns
  final values only; nothing about *where in the document* a value came from survives past the
  parse call. Page-level provenance (which page a holding's row appeared on) is achievable — the
  underlying PDF.js extraction can be run page-by-page — but line/region-level provenance within a
  page is not achievable without a materially different, layout-aware extraction approach. Not
  built this mission; flagged as a real, disclosed gap rather than attempted and faked.
- The statement's own declared totals (§1, new this mission) are computed at parse time but not
  yet written anywhere — `sql/neon/008_persistent_portfolio.sql`'s `portfolio_import` table has
  columns for them (`declared_cost_value_total`, `declared_market_value_total`), but that
  migration is not yet applied to production (see §6).

## 3. A real discovery this mission: the Summary format's trailing currency field

A prior commit this session (`fix(portfolio): parse CAS summary cost values`) found that the
single currency figure glued after each Summary row's ISIN is the statement's **Cost Value**, not
Market Value — correcting an earlier, wrong assumption. This mission verified that finding
structurally (checked whether a *second* currency-shaped token exists immediately after the first,
across all 8 rows of the real sample checked — none does) and went further: the Summary format's
**footer line** glues two currency totals back to back with no separator, and the second one
matches the independently-computed sum of extracted cost values exactly. This means the first
number is the statement's declared **market-value total**, and the document genuinely carries a
market-value figure — just at the aggregate level, never per holding. `extractStatementDeclaredTotal()`
now captures both.

## 4. Reconciliation gaps found and closed this mission

Before this mission, **no reconciliation existed at all** — a parsed statement's own arithmetic
was never checked against itself. `reconciliation.js` (new) adds two checks:

- **Per-holding** (`reconcileHolding`): units × statement NAV vs. the statement's own reported
  market value. Only meaningful for the ledger format (which reports a per-row market value);
  correctly `not_applicable` for the Summary format, which has none (§1/§3).
- **Portfolio-level totals** (`reconcilePortfolioTotals`): sum of extracted holdings vs. the
  statement's own declared grand totals (§3). Verified against the one real Summary statement
  checked this session: cost reconciled exactly; the market-value total reconciled to a
  few-paise difference on a lakhs-scale base — a relative difference far inside this module's own
  rounding threshold, consistent with the source document itself rounding each row before summing,
  not a parsing error.

`overallReconciliationStatus()` is the gate: `discrepancy` should block automatic approval (Phase
5's own requirement); `rounding` and `matched` should not. Not yet wired into the upload API, since
that requires the Phase 3 review/approve flow, which doesn't exist yet (§6).

## 5. Incorrect / risky calculations found and fixed this mission

- **Floating-point summation risk** (Phase 7's explicit concern): summing many holdings' rupee
  values with plain JS addition can accumulate rounding error. `decimalMath.js`'s `sumCurrency()`
  now sums in integer paise instead — the standard minor-unit accounting technique. Not yet wired
  into the live `/api/v1/portfolio/intelligence` route's own totals, which still use plain
  floating-point `reduce()` (a real, disclosed gap — see §6).
- **The demat-detection bug** (§1) is the other concrete "incorrect calculation" found and fixed
  this mission, via a failing test the fix itself introduced.

## 6. What's disconnected / not yet wired (honest current state)

- The new schema (`sql/neon/008_persistent_portfolio.sql`) is designed and **verified on an
  isolated Neon temp branch this mission** — every table, column, and foreign key confirmed
  correct, existing data confirmed untouched — but **not applied to production**. Nothing in this
  mission's new modules (`reconciliation.js`, `decimalMath.js`, `performanceLeaders.js`,
  `derivePlanOption`/`extractStatementDate`/`extractStatementDeclaredTotal` in `casParser.js`) is
  called from any API route yet.
- `/api/v1/portfolio/intelligence` (existing, live) still computes totals with plain
  floating-point `reduce()`, not `sumCurrency()`.
- No best/poorest-performer, largest-contributor/detractor, or daily-contributor ranking is
  exposed anywhere today — `performanceLeaders.js` exists and is tested but has no caller.
- Best/poorest performer, daily NAV valuation, historical snapshots, and the review/approve flow
  all depend on the same not-yet-applied schema — none of Phases 6, 8, 9 (this mission's
  numbering), 10, 11, or 12 have been started as live, callable functionality.

## 7. Direct answers to this audit's required questions

| Question | Answer |
|---|---|
| Fields currently extracted | See §1's table — materially expanded this mission (plan/option/demat, statement date, declared totals), still missing load disclosures/UCC/taxation (not observed in any real sample, so correctly absent rather than guessed) and per-field provenance metadata. |
| Fields lost after parsing | Raw text/page/line provenance (§2) — never captured at all today. |
| Data kept only temporarily | Same as the prior audit: the Upload History *list* shown in the UI lives in `localStorage`; the underlying holdings do not. |
| Values written to the database | `portfolio_holdings`, `portfolio_transactions`, `portfolio_uploads`, `portfolio` cache row, upload-triggered `portfolio_snapshots`/`portfolio_metrics`/`portfolio_reports`/`portfolio_events` — unchanged from the prior audit; this mission's new tables are designed and verified but not yet live. |
| Values recalculated by the frontend | `assetAllocation()`'s category→asset-class regex bucketing (client-side, in `PortfolioWorkspace.jsx`) — unchanged from before. |
| Values updated after NAV refresh | None, for portfolios — `production-refresh.yml` still has zero references to any `portfolio_*` table (reconfirmed this mission). |
| Values not updated | Everything downstream of a portfolio's value: gain, return, allocation percentages, best/worst performer — all recomputed live on page view from current holdings, never stored as history. |
| Current reconciliation gaps | Closed at the module level this mission (§4); not yet enforced anywhere in the live import path. |
| Incorrect calculations | The demat-detection bug (found and fixed this mission) and the floating-point summation risk in the live intelligence route (found, not yet fixed in that route specifically). |
| Disconnected tables and functions | `reconciliation.js`, `decimalMath.js`, `performanceLeaders.js`, and the new `casParser.js` extraction functions all exist, are tested, and have zero callers in the live application today. |
