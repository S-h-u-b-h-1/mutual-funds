# Stale / Superseded Documentation Audit

Trust Sprint Mission 13. `docs/` has grown to 60+ files across this project's history. This is
not a live-data trust issue (none of these are served to users), but it is a real instance of
exactly what this mission asks to find: old reports that could mislead a future reader (human or
AI) into treating stale numbers as current. Handled conservatively — no history destroyed,
because the audit trail of what was true at each point has real value in a project this size —
but the most actively misleading one is fixed outright, and the rest are catalogued here so nobody
has to rediscover this by reading 60 files.

## Fixed this pass

- **`docs/TRUST_AUDIT.md`** — was headlined "Data Trust Score: 100/100" with no date anywhere in
  the file, conflating data *validity* (the specific checks it runs, which may still be
  legitimately zero-violation) with data *completeness* (which it says nothing about, and which
  `docs/DATA_COVERAGE_AUDIT.md` shows is nowhere near 100% — 0% expense ratio, 1.07% factsheet
  metadata, 0% category rank for 56% of the universe). Now carries an explicit superseded banner
  and points to the current, honest coverage docs.

## Catalogued, not yet individually rewritten (lower urgency — dated or narrowly-scoped, not
## making an unconditional headline claim the way TRUST_AUDIT.md was)

Grouped by topic, oldest-first, with the current authoritative doc on the same subject named so a
reader lands on the right one without cross-referencing 10 files:

**Coverage / completeness** (10 files, all Jun 25–26, all predate the current audit by ~3 weeks):
`FUND_COVERAGE.md`, `FUND_COVERAGE_AUDIT.md`, `MFPULSE_COVERAGE_REPORT.md`,
`MARKET_COVERAGE_REPORT.md`, `COVERAGE_DASHBOARD.md`, `FIELD_COVERAGE_REPORT.md`,
`METADATA_COVERAGE.md`, `METADATA_COVERAGE_REPORT.md`, `DATA_COMPLETENESS_REPORT.md`,
`METADATA_COMPLETENESS_REPORT.md`
→ **Current source of truth: `docs/DATA_COVERAGE_AUDIT.md` (2026-07-13)**, which found and
corrected the specific optimistic-rounding pattern these older docs share (see below).

**AMC / metadata acquisition** (8 files, Jun 25–26):
`AMC_FACTSHEET_AUDIT.md`, `AMC_ACQUISITION_STRATEGY.md`, `AMC_EXPANSION_PLAN.md`,
`AMC_COVERAGE_STATUS.md`, `AMC_ADAPTER_ROADMAP.md`, `DATA_SOURCE_EXPANSION.md`,
`METADATA_SOURCE_MAP.md`, `METADATA_EXPANSION_REPORT.md`
→ **Current: `docs/METADATA_ACQUISITION_PLAN.md` + `docs/AMC_DOCUMENT_SOURCE_MATRIX.md`
(2026-07-13)**, which additionally found the real reason acquisition stalled (the dead-code
ingestion entrypoint — see `docs/METADATA_ACQUISITION_PLAN.md`'s Phase 4 fix plan), which none of
the older docs could have known about.

**Canonical scheme / fund-family mapping** (3 files, Jun 26):
`CANONICAL_MAPPING_REPORT.md`, `CANONICAL_FUND_REPORT.md`, `FUND_FAMILY_MAPPING_REPORT.md`
→ **Current: `docs/SCHEME_MATCHING_AUDIT.md` (2026-07-13)**, evidence-classed against the full
14,216-scheme universe (Classes A–I), materially more rigorous than the June reports' single
variant-reduction percentage.

**Trust / production-readiness snapshots** (2 files, Jun 26):
`PRODUCTION_READINESS_REPORT.md`, `SCORE_VALIDATION_REPORT.md`
→ Same caveat as `TRUST_AUDIT.md`: point-in-time snapshots, not necessarily wrong for their date,
but read them as history, not current state. **Current: this file's own `Trust Sprint` mission
docs plus `docs/DATA_COVERAGE_AUDIT.md`.**

## Recurring pattern found across the older coverage docs

Several of the June reports (e.g. `METADATA_COVERAGE.md`) report coverage as a percentage of an
**already-narrowed denominator** ("active/equity schemes" — 2,546, not the full 14,216-scheme
universe) without the denominator being obvious from the headline number. This isn't
fabrication — the docs do state the narrower base in their own text — but it's the kind of
framing that makes a small real number look larger at a glance. `docs/DATA_COVERAGE_AUDIT.md`
deliberately reports every percentage against the full universe first, with any narrower cohort
called out explicitly in the same sentence, specifically to avoid this pattern recurring.

## What this pass did not do

Did not delete any of the 23 catalogued files (git history preserves them regardless of what a
future cleanup decides), did not individually add a superseded banner to all 23 (that's a lot of
near-identical edits for internal-only docs — flagged here as a single reference point instead),
and did not audit the remaining ~35 docs not listed above (portfolio/auth/pipeline/news-themed —
lower risk of the specific "stale headline number" pattern this pass was hunting for, deferred).
