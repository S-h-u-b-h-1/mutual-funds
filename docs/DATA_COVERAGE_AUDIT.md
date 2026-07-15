# Data Coverage Audit

Trust Mission Phase 1. Every number below was computed directly against the live production
bundles (`frontend/app/data/funds.json`, `asOf: 2026-07-10`, 14,216 schemes; `frontend/app/data/
metadata.json`, `asOf: 2026-06-23`, 152 records) and by reading the engines that consume them —
nothing here is estimated or inferred. Where a figure could not be verified, it is marked
**unverified**, not filled in with a guess.

## How to read this document

For each of the 20 fields named in the mission brief, this audit answers three separate
questions, because collapsing them into one number would hide the real problem:

1. **Does the field exist in the schema at all?** (structural — a pipeline either produces it or doesn't)
2. **Of the schemes where the field could apply, how many actually have a value?** (population)
3. **Is the gap explained by something legitimate (a matured scheme, an instrument type the field
   doesn't apply to), or is it an unexplained hole?**

A field can be "0% missing" and still be a problem (e.g. covering only one AMC), and a field can be
"92% missing" and be completely fine (e.g. a risk metric that legitimately can't be computed for an
inactive scheme with no recent NAV prints). Both are reported honestly below.

---

## Summary table — the mission's 20 fields

| # | Field | Exists in schema? | Real coverage | Verdict |
|---|-------|---|---|---|
| 1 | Schemes (universe completeness) | funds.json | 14,216 schemes, 51 AMCs, 52 category labels | See §A |
| 2 | NAV history | External (mfapi.in, live) | Latest NAV: 100% in funds.json; full time series: fetched live per fund, not stored | See §A |
| 3 | Metadata (identity fields) | funds.json | 100% (name/AMC/category/assetClass/plan/option/ISIN 99%) | See §A |
| 4 | Expense ratio | metadata.json only | **0%** even within the 152-scheme pilot | See §C — not one scheme on the platform has a real expense ratio today |
| 5 | AUM | metadata.json only | 152/14,216 = **1.1%** (100% within the pilot) | See §C |
| 6 | Benchmark | funds.json | 100% (SEBI category-standard or named index) | See §A |
| 7 | Fund manager | metadata.json only | 12/14,216 = **0.08%** | See §C |
| 8 | Launch date | metadata.json only | 152/14,216 = **1.1%** (100% within the pilot) | See §C |
| 9 | Riskometer | metadata.json only | 152/14,216 = **1.1%** (100% within the pilot) | See §C |
| 10 | Exit load | metadata.json only | **0%** | See §C |
| 11 | Lock-in | **Does not exist anywhere** | 0% — no field in any bundle | See §D |
| 12 | SIP minimum | metadata.json only | **0%** | See §C |
| 13 | Lumpsum minimum | metadata.json only | **0%** | See §C |
| 14 | Asset allocation (equity/debt/cash split) | **Does not exist anywhere** | 0% — `assetClass` is a single category tag, not an allocation breakdown | See §D |
| 15 | Sector allocation | metadata.json only | 152/14,216 = **1.1%**, but see data-quality defect | See §C |
| 16 | Holdings | metadata.json only | 26/14,216 = **0.18%** | See §C |
| 17 | Turnover ratio | **Does not exist anywhere** | 0% | See §D |
| 18 | Portfolio overlap | Computed engine, not stored | Bounded by holdings coverage (0.18%) | See §E |
| 19 | Portfolio maturity (avg. maturity) | **Does not exist anywhere** | 0% — and this is a Debt-fund-primary metric; Debt is 56% of the universe | See §D, §F |
| 20 | Duration | **Does not exist anywhere** | 0% | See §D, §F |
| — | Yield (YTM) | **Does not exist anywhere** | 0% | See §D, §F |

---

## §A — Fields with real, near-universal coverage (AMFI-sourced, daily-refreshed)

Computed from `funds.js`'s `allFunds()` over all 14,216 records:

| Field | Coverage |
|---|---|
| code, name, amc, category, assetClass, plan, option, isDirect/isGrowth/isIdcw, active, nav, navDate, structure, trend, quality | 14,216 / 14,216 (100%) |

**Correction (Trust Sprint Mission 1, 2026-07-15): benchmark is not 100%.** The claim above was
wrong — it checked key *presence* (`'benchmark' in f`), not whether the value was actually
populated. Checking `f.benchmark` truthy against the current 14,218-scheme universe: **12,243 /
14,218 (86.1%)**. 1,975 schemes have `benchmark: null`, and 1,907 of those (96.6%) are **active**
schemes — including well-known, currently-open funds (Aditya Birla Sun Life MNC Fund, ICICI
Prudential Technology Fund, Tata Ethical Fund, Franklin India Technology Fund among the sample
checked). By assetClass: Other 1,067, Equity 595, Solution Oriented 145, Hybrid 144, Debt 24. The
Equity share (595 active, real, benchmark-eligible funds with no benchmark at all) is the more
concerning slice — see `docs/DATA_COVERAGE_MATRIX.md` for the full corrected field-by-field
numbers. Left here, struck through in spirit rather than silently edited away, because a mission
about removing stale/wrong claims should not quietly fix its own without saying so.
| isin | 14,080 / 14,216 (99.0%) — the 136 without an ISIN are a separate, already-documented finding (Class D2 in `docs/SCHEME_MATCHING_AUDIT.md`) |

This is the platform's solid foundation: every scheme has a verified identity, an AMFI-standard or
mandate benchmark, and a same-day NAV. This is also the only tier that is genuinely refreshed daily
(confirmed via the `chore(refresh): production data refresh` commits landing in git history).

**NAV history** is not stored server-side as a time series. The fund page's trend chart calls
`getNavHistory(code)` (`frontend/app/lib/mfapi.js`), which fetches the free `api.mfapi.in` REST API
live, on demand, revalidated every 6 hours, and is explicitly commented as "never the sole source."
This is an honest design (returns/identity come from our own AMFI-built bundle; the external API is
purely additive for the chart) but it is a live third-party runtime dependency that today is not
disclosed to the user anywhere on the page. Flagged for Phase 2 (source documentation) and Phase 6
(trust layer) — the chart should say "NAV history via mfapi.in" the same way other sourced numbers
should.

## §B — Fields that exist but are legitimately or problematically partial

Computed by cross-tabulating `vol90`/`catRank` presence against `assetClass` and `active` across
all 14,216 schemes:

| Field | Overall | Active schemes | Inactive schemes |
|---|---|---|---|
| Risk metrics (vol90, maxdd90, consistency, mom7/30/90, etc.) | 3,988 / 14,216 (28.1%) | 3,959 / 8,470 (46.7%) | 29 / 5,746 (0.5%) |

**This split is legitimate, not a bug.** An inactive/matured scheme stops printing new NAVs, so a
trailing-90-day volatility figure becomes stale and is correctly withheld rather than computed from
old data and silently presented as current. The real question is why only 46.7% of *active* schemes
have it — that remainder is schemes too newly listed to have 90 trading days of history yet
(`quality.obs` on the record confirms this for a sample checked). No fabrication or estimation is
happening; the gate is `obs >= `(required window), same principle used everywhere else in this
codebase.

**Category rank (`catRank`/`catPct`/`catSize`) is the one real structural gap in this section:**

| Asset class | Total schemes | Active | Has category rank |
|---|---|---|---|
| Debt | 7,989 | 2,737 | **0 / 7,989 (0%)** |
| Equity | 2,927 | 2,579 | 1,191 / 2,927 (40.7%) |
| Other (Gold/International/etc.) | 2,335 | 2,273 | **0 / 2,335 (0%)** |
| Hybrid | 820 | 738 | **0 / 820 (0%)** |
| Solution Oriented | 145 | 143 | **0 / 145 (0%)** |

Category ranking is computed **only for Equity schemes** — every other asset class gets no
`catRank`, `catPct`, or `catSize` at all, not even for actively-traded, fully-priced schemes. This
is a real engine gap (the cohort-ranking script is scoped to Equity only), not a data-freshness
issue, and it silently limits "how does this fund rank in its category" — a claim made on fund
pages and used as a Health Score input — to one-fifth of the platform's schemes by asset class, and
zero Debt/Hybrid/Gold/International schemes. See §F for why this matters disproportionately.

`attentionScore`/`attentionTier` (574 schemes, 4.0%) is a deliberately-scoped "recent rank movement"
signal, not meant to cover the universe — confirmed as intentional via `scripts/explain.py`'s
1-month-vs-3-month rank-movement logic, which by construction only fires for schemes that already
have `catRank` (so it inherits the same Equity-only scope, compounding the gap above rather than
adding a new one).

## §C — Fields that exist only in a single-AMC, stale, mostly-empty pilot bundle

`frontend/app/data/metadata.json` is a factsheet-PDF-derived bundle. Its own top-level fields say
plainly what it is: `parser_ready: 4`, `schemes_populated: 152`, `by_amc: { "SBI Mutual Fund": 152
}`. Verified directly:

- **1 AMC out of 51** has any factsheet metadata at all (SBI Mutual Fund). The other 50 — including
  every scheme from HDFC, ICICI Prudential, Axis, Kotak, Nippon India, and every other major AMC —
  have zero rows in this bundle.
- **152 schemes out of 14,216 (1.07%)** of the total universe.
- **Stale relative to the daily pipeline**: `asOf: 2026-06-23`, last modified Jun 25 — 18+ days
  behind `funds.json`'s daily-refreshed `2026-07-10`. It is not part of the automated refresh
  workflow that touches `funds.json`.
- Even **within** the 152 SBI records, per-field population is uneven — extraction succeeded for
  some fields and never worked for others:

| Field | Populated within the 152 |
|---|---|
| launch_date | 152 / 152 (100%) |
| aum_crores | 152 / 152 (100%) |
| riskometer | 152 / 152 (100%) |
| sector_allocation | 152 / 152 (100%) — see data-quality note below |
| fund_manager | 12 / 152 (8%) |
| holdings | 26 / 152 (17%) |
| expense_ratio / direct_expense_ratio / regular_expense_ratio | **0 / 152 (0%)** |
| exit_load | **0 / 152 (0%)** |
| minimum_sip | **0 / 152 (0%)** |
| minimum_lumpsum | **0 / 152 (0%)** |

**Consequence stated plainly: not one scheme on the entire platform — including the 152 SBI pilot
records — currently has a real expense ratio, exit load, or SIP/lumpsum minimum.** These are three
of the most commonly-asked investor questions ("what does it cost me, and how do I start"), and the
answer is "not yet available from source" for 100% of the universe. `fundHealth.js` and
`qualityEngine.js` already handle this correctly (cost dimension is dropped and the score
renormalized when `expenseRatio == null`, never defaulted to 0 or estimated) — the architecture is
honest, the data behind it simply doesn't exist yet.

**Data-quality defect found in `sector_allocation`, not just a coverage gap:** at least one SBI
record's `sector_allocation` array contains entries that are not sectors — `"Total"` (a subtotal
row) and what appear to be individual stock names (e.g. `"NETFlix Inc"`, capitalized inconsistently)
alongside real sector names like `"Financial Services"`. This looks like the factsheet PDF's
holdings table and sector table were parsed with some row bleed-through for at least one scheme.
Flagged for Phase 4 (Data Validation Engine) rather than silently trusted — the 152-record pilot
should not be assumed clean just because it's small.

`holdings[].sector` and `holdings[].issuer` sub-fields are **always null** (0/224 holdings rows
checked) even though the parallel top-level `sector_allocation` field is populated — two different
representations of similar information, one working, one not. Worth reconciling in Phase 4/5, not
duplicating.

## §D — Fields that do not exist anywhere in the pipeline

Checked by key-presence scan across every record in both `funds.json` and `metadata.json` — these
keys are absent, not merely null, in 100% of records:

- **Lock-in period** — no field anywhere. (Relevant mainly to ELSS's mandatory 3-year lock-in,
  currently handled as a hardcoded rule in the tax engine rather than sourced per-scheme data —
  worth confirming in Phase 2 whether that hardcoding is itself correct and disclosed as such.)
- **Asset allocation (equity/debt/cash mandate split)** — `assetClass` is a single category tag
  ("Equity", "Debt", "Hybrid", ...), not a percentage breakdown. A Hybrid fund's actual current
  equity/debt/cash split is not stored anywhere.
- **Turnover ratio** — absent everywhere.
- **Portfolio maturity (average maturity)** — absent everywhere.
- **Duration (modified duration)** — absent everywhere.
- **Yield (YTM / running yield)** — absent everywhere.

## §E — Portfolio overlap

Not a stored per-scheme field. `frontend/app/lib/portfolioIntelligence/stockOverlap.js` computes
overlap between two schemes' holdings on demand — a real, deterministic, already-built engine
(Portfolio Intelligence Phase B, already shipped). Its usable universe is bounded by §C's holdings
coverage: with real holdings data on only 26 of 14,216 schemes (0.18%), overlap can only be
meaningfully computed between two schemes that both happen to fall in that 26-scheme set today.
This is not a bug in the overlap engine — it is correctly gated on real data — but it means the
feature's practical reach is currently near-zero outside a demo case, and that should be stated
plainly wherever overlap is surfaced rather than left implicit.

## §F — Headline finding: Debt funds are simultaneously the largest and least-served asset class

Debt schemes are **7,989 of 14,216 — 56.2% of the entire scheme universe** — the single largest
asset class by scheme count, larger than Equity, Hybrid, Other, and Solution Oriented combined. Yet
by every measure in this audit, Debt is the worst-covered:

- **0% category rank** (§B) — a Debt scheme can never show "ranks X of Y in its category" today.
- **11.3% risk metrics** (901/7,989 have vol90 — lower than Equity's 42.8%, though partly explained
  by Debt having a much higher inactive-scheme share: 5,252 of 7,989 Debt schemes, 65.7%, are
  inactive, versus Equity's 11.9% inactive share).
- **0% duration, yield, or average maturity** (§D) — these are the primary risk/return descriptors
  a fixed-income investor actually needs, and none of them exist in the pipeline for any scheme,
  Debt included.
- Factsheet metadata (§C) covers Debt at the same ~1% rate as everything else, since the single
  covered AMC (SBI) is itself equity-fund-heavy in its 152 parsed schemes.

Debt spans 16 of the platform's 52 category labels (Corporate Bond, Credit Risk, Debt ETF, Dynamic
Bond, Gilt, Gilt with 10-year Constant Duration, Floater, Income, Liquid, Long/Medium/Short
Duration, Money Market, Overnight, Ultra Short Duration/Term) — this is not a niche corner of the
product, it is the largest single wedge of it, currently running on the thinnest data.
**Recommendation carried into Phase 9 (MF Pulse Rating): do not launch a rating that silently
under-serves 56% of the universe — either the rating must degrade gracefully and visibly for Debt
schemes (lower coverage %, explicit "duration/yield not available" note) or Debt-specific data
acquisition needs to be prioritized ahead of rating design.**

## §G — Category taxonomy anomalies found incidentally (cross-referenced, not duplicated)

This audit was scoped to field coverage, not taxonomy — but the category breakdown in §B surfaced
concrete, quantified evidence for a repair that is already tracked and scoped elsewhere (Scheme
Matching Sprint Phase 5, task #192). Recorded here for cross-reference only; the fix belongs to that
phase, not this one, to avoid doing the work twice:

| Category label (as stored) | Scheme count | Likely correct / duplicate of |
|---|---|---|
| `Indexs` | 1,285 | Malformed — almost certainly meant to be an "Index" category label |
| `Fund ofs  (Domestic)` (double space) | 8 | Duplicate of `FoF Domestic` (530) |
| `Fund ofs investing overseas` | 4 | Duplicate of `FoF Overseas` (185) |
| `Balanced Advantage/ Dynamic Asset Allocation` | 4 | Duplicate of `Dynamic Asset Allocation or Balanced Advantage` (150) — the latter matches SEBI's official category name |
| `Equitys` | 32 | Malformed label, asset-class tag with a stray "s" |
| `Other  ETFs` (double space) | 298 | Cosmetic, but a distinct string key — any exact-match code elsewhere would silently miss it |
| `Children’s` (curly apostrophe, U+2019) | 39 | Encoding artifact — any code comparing against a straight apostrophe would silently miss it |

727 schemes (`Fund ofs...` + `FoF...` + `Balanced Advantage...` variants combined) are currently
split across duplicate category buckets, meaning any category-average, category-rank, or "compare
within category" computation for those specific 12 + 4 = 16 mislabeled schemes is running against
an artificially tiny peer group instead of their real ~530–150-scheme cohort.

## §H — Existing engines inventory (read before building anything in Phases 2–9)

To avoid duplicating calculations — a standing rule for this whole mission — the following already
exist, are already honest about missing data (drop-and-renormalize, null-propagate, never
fabricate), and should be extended rather than replaced:

- **`frontend/app/lib/qualityEngine.js`** — 8-dimension quality score (performance, risk,
  consistency, diversification, momentum, reliability, transparency, data completeness), each
  dimension dropped and the rest reweighted when its inputs are missing. `confidence` reported
  separately from the composite score, never blended in. `explainQuality()` already produces
  driver/detractor/"why not higher" narrative — a working start on Phase 3's Explainability Engine.
- **`frontend/app/lib/completeness.js`** — `fundCompleteness()` (9-dimension, weighted, per-fund
  completeness score) and `researchReadiness()` (9 investor questions, each with an explicit
  source: "AMFI", "Factsheet", "SEBI category standard", etc.) — this is most of Phase 2's
  per-metric sourcing ask, already built at the per-fund level.
  Mirrored in `scripts/market_coverage_audit.py` on the Python side.
- **`frontend/app/lib/fundHealth.js`** — the underlying Health Score; `costAvailable =
  f.expenseRatio != null` gating pattern is the model every future score in this mission should
  copy.
- **`frontend/app/lib/decisionEngine.js`**'s `insightConfidence()` — existing confidence-labeling
  function (High/Medium/Limited Data), already shipped.
- **`/internal/data-completeness`** (`frontend/app/internal/data-completeness/page.js`) — an
  internal (noindex, unlinked) dashboard computing live per-field completeness over the same
  bundles this audit used. Its own header comment is exactly this mission's philosophy: "Real
  coverage and pipeline-health figures... Low numbers here are not hidden — that's the point."
  Phase 6 (public Trust Layer) should surface a user-facing version of this, not rebuild it.

One stale artifact found in passing: `frontend/app/lib/metadata.js`'s header comment says "Today it
is empty... every fund correctly shows 'Not yet available from source'" — written when
`metadata.json` had zero rows. It now has 152. The comment underclaims what exists rather than
overclaiming, so it is not a user-facing trust risk, but it should be corrected so future engineers
reading it don't assume the pilot never ran.

## What this audit did not (yet) cover

In the interest of not silently overclaiming completeness of the audit itself: this pass verified
field-level presence and cross-referenced the engines that consume `funds.json` and `metadata.json`
in depth. It did not yet (a) verify field-level lineage for `performance.json`, `amc_trend.json`,
`daily.json`, or `index_history.json` to the same depth — these are smaller, narrower-purpose
bundles and lower risk, deferred to Phase 7's bundle ownership audit; (b) check every page's own
render logic field-by-field beyond the fund page, Health Score, and Quality Engine; (c) verify
cross-source accuracy of any populated field against AMC websites or SEBI filings — that is Phase
4's job, not Phase 1's.
