# MF Pulse — Attention Intelligence Layer

Answers *"what deserves investor attention today?"* — not *"what ranked highest?"*. Built on
**canonical funds** (one investment idea, not four scheme variants), **attention scoring**,
and **context** (is the move fund-specific or category-wide?). Deterministic; no LLM.

## 1. Fund-family normalization (`scripts/canonical.py`)
Every scheme maps to exactly one canonical fund (plan/option suffix stripped):
- **14,224 scheme codes → 5,598 canonical funds (60.6% variant reduction).**
- `fund_family.json` stores `canonical_fund_id`, `canonical_fund_name`, `variant_scheme_codes`,
  `variant_count`. Report: `FUND_FAMILY_MAPPING_REPORT.md`.

## 2. Duplicate suppression
Insights dedup by `canonical_key`, so "SBI Small Cap Direct Growth / Regular Growth / IDCW"
collapse to **one** item: *SBI Small Cap Fund — entered top decile*. Plus a max-2-per-category
diversity cap so the brief isn't one category repeated.

## 3. Attention Score (0–100, deterministic)
`novelty` (decile crossing +30 / decline +10) + `magnitude` (rank jump ×2, cap 40) +
`persistence` (3-month base, ≤15) + `category_deviation` (fund 1M return above its cohort
average — fund-specific alpha, ≤15). Tiers: **High ≥70 · Medium ≥45 · Low <45 (suppressed)**.

## 4. Context (Context Layer Phases 1/4)
Each item answers *is this meaningful?* by comparing the fund to its category average:
> Sectoral/Thematic averaged **+2.6%** over 1M, this fund **+8.0%** — outperformance appears **fund-specific**.

vs a category-wide move (whole category up) — so an investor knows whether the fund earned it
or the tide lifted everyone.

## 5. Industry intelligence (Phase 7)
Market-level, deterministic: risk regime (breadth ≥55 Risk-On / <45 Risk-Off / else Neutral),
% categories & AMCs positive, and category leadership shifts (e.g. *Flexi Cap strengthening
#8→#4; Sectoral/Thematic weakening #4→#5*).

## 6. Morning Brief 2.0 (Attention Dashboard)
`daily.json` carries `explained` (attention-scored, context-rich, canonical), `industry`,
`categoryRotation`, `amcMomentum`, and a structured `brief`. The homepage leads with
**"What deserves attention today"** — each item shows what / why / context / metric arrow /
attention score, linking to the fund.

## Trust
`canonical`, `fund_movements`, `attention_score`, `explain_funds`, `rotation` are pure,
unit-tested (collapse, dedup, scoring bounds, determinism, noise suppression). Every statement
reduces to a rank or average computed from real AMFI NAV — no opinions, no predictions.
