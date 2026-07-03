# Fund History Engine

**History begins from first archived factsheet: 2026-07-03.** Nothing before this date is
tracked, inferred, or backfilled — there is no historical snapshot data anywhere in this system
prior to today (confirmed by SQL schema review and git history of the data bundles during the
previous sprint). Any claim of a fund event before 2026-07-03 would be fabricated; this system
will never produce one.

## What exists today

- **`factsheet_archive`** (Supabase, public-read, service-role-write) — a versioned, checksummed
  snapshot of every parsed factsheet field (manager, expense ratio, benchmark, AUM, riskometer,
  exit load, holdings, sector allocation) per scheme, per ingestion run. Unique on
  `(scheme_code, content_checksum)` — re-archiving unchanged data is a no-op; a new row only
  appears when something genuinely changed.
- **`fund_history_events`** — populated ONLY by diffing two consecutive `factsheet_archive` rows
  for the same scheme. `detect_changes()` in `scripts/archive_factsheets.py` never infers, never
  estimates a date, never backfills — a change is recorded only when two real archived snapshots
  disagree, with both snapshot IDs stored for full traceability.
- **8 real schemes backfilled today** (2026-07-03) as the day-1 snapshot — a genuine, checksummed
  proof that the mechanism works end-to-end, not a placeholder. The remaining 144 currently-parsed
  schemes are a mechanical follow-up (same script, same data, not blocked on anything) rather than
  something requiring new design work.
- **Wired into the existing pipeline**: `scripts/ingest_factsheets.py` now calls
  `archive_snapshot()` at the end of every run, gated on `SUPABASE_SERVICE_ROLE_KEY` being present
  (same graceful-skip pattern as every other pipeline here). `.github/workflows/factsheets.yml`
  (runs monthly, 5th of each month) now passes that secret through. Once the secret is configured
  (see [[mfpulse-ci-secret-missing]]), **the very next scheduled factsheet run will be this
  system's first real second data point** — and `detect_changes()` will have something genuine to
  compare against for the first time.

## What does NOT exist yet

- Change detection only runs when explicitly called per scheme — it is not yet wired to run
  automatically across all schemes after each archive step, or surfaced on the fund page. Both are
  small, well-scoped follow-ups once there are at least two real snapshots to make them meaningful
  (there's no value in building a UI for an events table that will show nothing for at least a
  month).
- Only the 4 fields with the clearest single-value semantics (manager, benchmark, expense ratio,
  riskometer) have dedicated `event_type`s wired into `detect_changes()`. AUM milestones, category
  changes, objective changes, and holdings/concentration changes are real columns in
  `fund_history_events`'s schema (the `event_type` check constraint already includes them) but the
  diff logic to populate them isn't written yet — AUM and holdings changes in particular need a
  materiality threshold (a milestone, not every rupee of AUM drift) that's a product decision, not
  just an engineering one.

## Reproduction

```bash
.venv/bin/python -m scripts.archive_factsheets   # requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
```

Or automatically via `.github/workflows/factsheets.yml` once the secret is configured.
