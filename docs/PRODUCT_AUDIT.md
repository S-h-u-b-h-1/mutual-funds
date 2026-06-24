# MF Pulse — Product & Data Audit (PMF lens)

> **Positioning (current):** *Mutual Fund Performance Intelligence* — built entirely on
> real AMFI NAV. Flow features are quarantined as clearly-labelled sample until an
> authoritative SEBI monthly export is connected. No capability claim depends on sample data.
>
> **Performance Intelligence shipped:** multi-window real returns (1W/1M/3M/6M/1Y) for
> 1,269 equity Growth funds (`/performance`), category intelligence (`/categories`),
> AMC Quality Score (45 AMCs), auto research insights, CSV export, and event collection
> (`performance_view`, `category_view`, `export`). Nav + hero + metadata + OG repositioned.



> Core question for every feature: *would a serious investor, advisor, distributor,
> analyst, journalist, or family office open this daily to make better decisions?*

## Phase 1 — Product audit

| Area | Problem solved | Who | Value | Return frequency | Verdict |
|---|---|---|---|---|---|
| Homepage | "What's happening in MF land" at a glance | all | med→high | daily | Was led by **synthetic** flow stats → **fixed**: now leads with real NAV/performance/momentum |
| Search | Find any of 14k schemes / 51 AMCs | all | high | as-needed | Real, fast. Keep |
| Signals | Flag unusual flow moves | analyst | **low (sample)** | — | Built on sample flows → relabelled "sample", not authoritative |
| Compare | AMC side-by-side + saved workspaces | advisor | med | weekly | Real (30d index, scheme mix). Keep |
| Watchlist | Track funds + aggregate 30d move | investor | med | daily | Real. Strong retention hook |
| Analytics | First-party usage (internal) | team | med | — | Real, PII-free. Internal value |
| Research | Hub for reports | advisor/analyst | rising | weekly | **Now anchored by real Fund Performance** |
| Market Brief | Monthly narrative | advisor | **low (sample)** | monthly | Sample flows → labelled |
| Data quality | Trust | all serious users | **high** | first-visit + audit | **New /data-quality** classifies every dataset |
| Trustworthiness | — | all | was the weak point | — | Materially improved this pass |

**Weakest features:** anything built on monthly flows (signals, brief, heatmap, network) — synthetic.
**Strongest real assets:** NAVs, 30-day equity index, **fund performance** (new), search, watchlist.
**Missing (now added):** real per-fund performance/returns — the #1 thing investors actually want.

## Phase 2 — Data quality (summary; live at /data-quality)
| Dataset | Source | Type | Status |
|---|---|---|---|
| Scheme NAVs | AMFI NAVAll daily | **real** | fresh (green), 14,224 schemes |
| 30-day equity index | AMFI NAV history | **real** | 47 AMCs |
| Fund performance | AMFI NAV history | **real** | 1,175 equity Growth funds, true 30d returns |
| User events | first-party | **real** | live, PII-free aggregates |
| Monthly net flows | (none — SEBI PDF-only) | **sample** | quarantined + labelled |
| Signals / brief / heatmap / network | derived from flows | **sample** | quarantined + labelled |

No duplicates / missing NAVs detected (quality gate: negative-NAV, class-set, freshness, coverage floor). Returns use Direct/Growth plans only so IDCW payouts don't distort.

## Phase 8 — Collection coverage
Collected to `user_events` (real-time, indexed, analytics-ready): `page_view, search, search_click, amc_view, watchlist_add/remove, alert_signup`. **Gaps:** category_view, comparison usage, report/export downloads, research_view — recommended next.

## Missing opportunities (ranked by investor value)
1. **Connect one real monthly-flow export** → flips signals/brief/heatmap from sample to authoritative (biggest single lift).
2. **Per-fund return windows** (1w/3m/1y) + **category leaders** from NAV history — pure real-data extensions of what shipped today.
3. **"What changed since yesterday"** at scheme level — needs daily NAV history to accrue (activate the cron).
4. **Client-ready PDF/CSV exports** for advisors.

## Scores (honest)
- **Production readiness: 86/100** — live, observable, alerting, fresh NAV, migrated cleanly.
- **Trust: 78/100** — real data now leads, sample fully quarantined + a public data-quality report; capped until flows are real.
- **Data quality: 70/100** — NAV/performance excellent; flow datasets synthetic (clearly marked).
- **User value: 72/100** — real fund performance + search + watchlist are genuinely daily-useful; flow features are demo until real.
- **PMF assessment:** *Partial.* Real, daily reason to return now exists (fund performance + NAV + watchlist). Full PMF for analysts/advisors is gated on real flow data — the one external dependency.
