# MF Pulse — Product-Market Fit Report (2026-07-01)

> Core question for every change this sprint: *does this help an investor completely
> understand a fund faster, or does it just add noise?* The benchmark is Bloomberg
> Terminal / Morningstar Direct / Value Research, not another dashboard startup.

## What changed this sprint (evidence, not vibes)
- **Data was 8 days stale in production** (`asOf: 2026-06-23` while today is 2026-07-01).
  Refreshed against the live AMFI feed → `asOf: 2026-06-30` (1 day behind live, the honest
  floor given AMFI's own publish lag). Trust score moved **81.5 → 86.3** from this alone.
- **A real data-quality bug found and fixed**: 19 dormant funds had "1-year return" figures
  computed against their *last published* NAV (190–361 days stale), silently mislabeling a
  shorter, stale window as "1Y". Fixed at the source (`build_performance.py`), permanent
  regression test added (`test_long_window_returns_imply_current_nav`).
- **Sitewide freshness/market-status strip** (`lib/marketStatus.js` + `Nav.jsx`) — every page
  now honestly states latest-NAV date, staleness, exchange-hours fact, and next scheduled
  update. Zero added network cost. Never claims "live" data it doesn't have.
- **Fund page restructured** to the explicit institutional order: Executive Summary above the
  fold → Health → Performance → NAV trend + real rolling-volatility chart → Risk/Peers →
  Benchmark → Portfolio → Documents → Completeness (last). Duplicate freshness badge removed.
- **Homepage decluttered**: redundant TrustBar removed (superseded by the sitewide strip), a
  real Category Rotation panel surfaced (data existed, was never shown), sample-only flow
  visuals collapsed behind a disclosure so real intelligence isn't competing with sample data.
- **A correctness bug in cross-page dedup avoided**: the audit flagged `gradeTone` as
  duplicated between `amcIntel.js` and `fund/[scheme_code]/page.js`. Verified they're
  *different 6-band vs 5-band scales* — blindly merging would have misclassified AMC grade
  "B+" as negative. Fixed correctly by giving each scale one owner instead.
- **12-page audit** (Explore agents, real code read, not guessed) → `PRODUCT_AUDIT_BACKLOG.md`
  — what shipped, what was checked and rejected, what's genuinely deferred and why.
- **Adversarial QC pass** over every changed surface before calling this sprint done —
  see `docs/PMF_QC_REPORT.md` for the independent verification findings.

## Scores (honest, evidence-grounded; 0–100)

| Metric | Score | Why |
|---|---:|---|
| **Investor Usefulness** | **72** | Real returns/risk for the full investable universe, Health Score, Sharpe/Sortino, executive summary answering "why care" in one paragraph, sitewide freshness so an investor knows if data is current, category rotation, daily gainers/fallers. Capped by: expense ratio/AUM/manager/holdings missing for ~99% of schemes — the exact fields a serious allocator checks before writing a check. |
| **Advisor Usefulness** | **66** | AMC-level intelligence with peer rank and category-strength breakdown, canonical-fund grouping (saves reconciling Direct/Regular/IDCW variants), knowledge-graph queries (funds by manager, by holding, AMCs by sector). Capped by: no client-ready export, Compare page still lacks multi-year returns and a health-score column (flagged, deferred). |
| **Research Quality** | **79** | The platform's real strength: deterministic, zero-LLM-fabrication engine; every number traceable to AMFI NAV or a real factsheet; Research Completeness explicitly shows *why* a score isn't 100 rather than hiding the gap; a genuine data-quality bug was caught and fixed this sprint, not just cosmetics. Capped by the same factsheet-metadata ceiling as above. |
| **UI Quality** | **75** | Consistent institutional dark-glass design system, reduced duplication this pass (TrustBar removed, sample viz deferred), clearer information hierarchy. Several secondary pages (Compare, Analytics, Brief) weren't touched this sprint and still carry cataloged duplication. |
| **Data Richness** | **55** | 100% scheme coverage, real NAV/returns/risk/ISIN/structure, 86% benchmark coverage, a working knowledge graph — but factsheet-sourced fundamentals (expense ratio 0%, manager 0.08%, holdings 0.18%, AUM 1.07%) are the honest, well-documented bottleneck. This is the single number that most separates MF Pulse from Morningstar/Value Research today. |
| **Information Density** | **78** | This sprint's explicit target: exec summary first, category rotation surfaced, sample data deferred, redundant elements removed. Real gains, but not every page was audited-and-fixed (see backlog). |
| **Trust Score** | **86.3** | Computed, reproducible (`scripts/market_coverage_audit.py`): 100% live-AMFI coverage, 9/9 production gates, fresh data, full lineage on every dataset. |
| **Retention Score** | **58** | Watchlist and alert-signup infrastructure are real and wired; category rotation and a genuinely fresh daily brief give a reason to return. But the proactive loop (emails actually firing on a schedule) is gated, not confirmed live-and-sending this session — the mechanism exists, the habit-forming loop isn't yet proven. |
| **Product-Market Fit Score** | **50** | Strong, honest technical foundation (100% coverage, real trust engine, no black-box) and a clear differentiated positioning (completeness + trust vs. feature count) — but PMF requires validated *user pull*, and this session has no evidence of external usage/retention data, only internal event-tracking infrastructure. Technically excellent, market-unproven. |
| **Production Readiness** | **100%** *(gates)* | 9/9 internal correctness gates pass, 108/108 tests pass, clean build across 25 routes, verified live post-deploy. This measures internal correctness, not uptime/SLA/incident history, which is outside this session's visibility. |

## If an investor spends 30 seconds on MF Pulse today, what do they learn?
In order, as the restructured homepage now presents it:

1. **Exactly how current the data is** — "Latest NAV: 2026-06-30 (1d ago)" + market-session
   fact, stated honestly, not implied as live.
2. **Whether today is risk-on or risk-off** — breadth (advancers/decliners), a risk-regime badge.
3. **Which specific funds are gaining attention right now** — the deterministic explanation
   engine's rank-improvement cards (e.g. a fund moving from rank #69→#7), each with an
   attention score and a one-line "why" — the single most actionable line on the page.
4. **Which categories are rotating** — 1-month vs 3-month rank movement, newly surfaced this
   sprint (the data existed since an earlier build but was never shown).
5. **Today's best and worst performing funds**, with AMC and category context one click away.

## The honest gap
None of the above requires trusting an opaque model — every figure traces to AMFI NAV or a
labelled factsheet. That is a real differentiator. The gap to "replaces Morningstar" is not
UI polish; it is the factsheet-metadata bottleneck (expense ratio, manager, holdings, AUM),
which is infrastructure-blocked (Python 3.13 PDF worker), not a data-availability problem, and
is tracked with full honesty in `AMC_ADAPTER_ROADMAP.md`.
