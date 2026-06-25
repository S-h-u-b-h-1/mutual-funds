# MF Pulse — Explanation Engine

Turns daily intelligence from *what changed* into *why it matters* — **deterministically**.
No LLM, no market opinions, no predictions. Every statement cites a metric with a previous
and current value.

## Movement signal (Phase 2)
A fund's **rank by 1-month return vs its rank by 3-month return** within its category cohort
(≥10 funds, so deciles are meaningful). The gap is the movement:
- ranked far higher on 1-month than 3-month → **accelerating** (climber / entered top decile)
- the reverse → **decelerating** (faller / left top decile)

This is real and available today from `funds.json`; a separate `rank_snapshots.jsonl` also
accrues true day-over-day rankings for the future.

## Explanation structure (Phase 1)
Each item carries: `what` · `why` · `care`, plus `metric`, `previous_value`, `current_value`.

> **ITI ELSS Tax Saver Fund entered the top decile**
> what: now top-10% in ELSS on 1-month NAV return
> why: category rank improved from #15 (3-month) to #1 (1-month) of 107
> care: recent momentum is accelerating — monitor for sustained outperformance
> `category rank (3M→1M): #15 → #1`

## Category rotation (Phase 3) & AMC momentum (Phase 4)
Categories / AMCs are ranked by avg 1-month vs avg 3-month return; the rank movement is the
rotation (e.g. *Flexi Cap 3M-rank #8 → 1M-rank #4 = rotating in*). Stored historically.

## Research value (Phase 7 — noise suppression)
Only high-value changes survive: decile crossings and rank moves ≥15 places. Each item is
tagged `actionable` (decile crossing / leadership change) or `interesting` (notable climb).
Flat cohorts (no real movement) produce **zero** items — no manufactured insights (tested).

## Daily Investor Brief (Phase 6)
`daily.json.brief` is a deterministic structure: winners, losers, category rotation, AMC
movement, risk warnings — built from the same engine. Rendered on the homepage "What changed
today" section.

## Trust
`fund_movements` / `explain_funds` / `rotation` are pure functions, unit-tested for
traceability, dedup (one item per fund across plan variants), determinism, and noise
suppression. Nothing is fabricated; everything reduces to a rank computed from real AMFI NAV.
