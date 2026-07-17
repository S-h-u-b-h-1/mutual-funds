# Metadata Provenance Schema

Provenance Mission Phase 3. Schema: `sql/013_metadata_provenance.sql` (Supabase) and
`sql/neon/004_metadata_provenance.sql` (Neon mirror, dual-written same as `factsheet_archive`).
**Update 2026-07-17, verified directly against both live databases:** applied to **Neon production**
(all 6 tables + 2 views exist on `br-raspy-glitter-atut1ur7`) but **every table has 0 rows** — the
schema is deployed, nothing has ever written to it. **Not applied to Supabase at all** (none of
these tables exist there). No ingestion, API, or frontend code reads or writes any of these tables
today — `docs/DATA_COVERAGE_MATRIX.md`'s "live on Neon production" phrasing (same date) was easy to
misread as "the provenance chain works"; it means "the schema exists," nothing more, until
Provenance Mission Phase 4 actually re-points the factsheet pipeline at it.

**Update 2026-07-17 (Data Platform Mission 4), later same day:** the schema is no longer empty.
`ingestion/factsheet/provenance.py` now wires `scripts/ingest_factsheets.py` (the one real,
working factsheet pipeline — SBI, 152 schemes) into this schema, and a one-time backfill ran the
real `record_provenance()` function against production using the last successful pipeline run's
already-parsed output (`data/warehouse/source_files.jsonl` + `frontend/app/data/metadata.json` —
no re-fetch, no new fabrication risk). Verified directly against `br-raspy-glitter-atut1ur7`:

| Table | Rows |
|---|---:|
| `parser_versions` | 1 |
| `source_documents` | 41 |
| `source_document_versions` | 41 |
| `source_extractions` | 780 |
| `field_validation_results` | 780 |
| `metadata_quarantine` | 0 (no extraction has failed a check yet — not "unused," just clean so far) |
| `fund_metadata_values` (view) | 780 |
| `fund_metadata_history` (view) | 780 |

Confidence distribution matches `docs/DATA_SOURCE_REGISTER.md`'s per-field policy exactly, not a
new judgment call: `launch_date`/`riskometer`/`aum_crores` 152/152 high; `benchmark` 134/152 high
(18 schemes' factsheets didn't carry it); `holdings` 26/152 high (most schemes' top-10 holdings
table wasn't present in the parsed text); `sector_allocation` 152/152 medium (the known
contamination defect from the Trust Mission audit, not yet fixed); `fund_manager` only 12/152, all
low (SBI's solo-manager line is genuinely ambiguous for most schemes — `normalize.py`'s adapter
correctly left it blank rather than guessing, so a low match count here is the pipeline working
as intended, not a bug).

A real bug was caught and fixed in the same pass: the first version of `record_provenance()`
matched `metadata.json` rows against `source_documents.scheme_hint` using an asymmetric,
partially-normalized comparison (only the AMFI scheme-name side was lowercased/space-stripped;
the hint side — a raw fund name like `"SBI Large & Midcap Fund"` — was left as-is). It matched
0/152 rows every time, wrote 0 extractions, and raised no exception — `ingest_factsheets.py`'s own
graceful-skip-on-error handling would have swallowed it silently in CI forever. Fixed by extracting
the one correct normalizer (`collapse()`, already proven correct in
`scripts/ingest_factsheets.py`'s AMFI-matching path) into `ingestion/factsheet/normalize.py` and
having both call sites share it, so the two can no longer drift apart again.

**What this does *not* yet mean:** this is one AMC's pipeline (SBI), 152 of ~14,224 schemes
(≈1.07% of the universe) — not "every important record" in the sense Data Platform Mission 4's
brief describes. `scripts/ingest_factsheets.py` is still not wired into any scheduled GitHub
Actions workflow (confirmed via grep, unchanged from Phase 1's finding) — the pipeline this schema
now serves still only runs when someone runs it manually with `DATABASE_URL` set. The fix above
guarantees that **when** it next runs, provenance will populate correctly; it does not by itself
make that happen on a schedule.

## Mapping the mission's 9 required concepts to what was actually built

| Mission concept | Implementation | Why |
|---|---|---|
| `source_documents` | Real table | Logical document identity (AMC + type + scheme hint + canonical URL) |
| `source_document_versions` | Real table | One row per actual fetch; content-checksum-deduped so a re-fetch of an unchanged document is a no-op, not a new row |
| `source_extractions` | Real table | The one place a field's value is actually stored — raw text, normalized value, unit, page/table reference, parser, confidence, all together |
| `fund_metadata_values` | **View**, not a table | Current, validated value per (scheme, field) is fully derivable from `source_extractions` + `field_validation_results` + `metadata_quarantine`. Storing it again would be a second copy that could drift from the log underneath it — the same "reuse, don't duplicate" principle this whole mission runs on, applied to storage instead of code. |
| `fund_metadata_history` | **View**, not a table | Same reasoning — it's `source_extractions` unfiltered, ordered by recency. Nothing is ever deleted from `source_extractions` (`is_current` is flipped to `false` on the superseded row, never overwritten), so this view is a complete history by construction. |
| `field_validation_results` | Real table | One row per check per extraction — a field can fail one check and pass another; both need to be visible, not collapsed into a single pass/fail |
| `parser_versions` | Real table | So a future parser bug fix can be scoped ("re-run everything `SBIAdapter` extracted before version X") instead of re-running everything blindly |
| `metadata_ingestion_runs` | **Extends the existing `fact_factsheet_runs`** (`sql/005_factsheet_runs.sql`), not a new table | That table already has the right shape (amc/status/schemes_found/schemes_populated/problems/source_url/started_at/finished_at) and — Phase 4 finding — nothing currently writes to it at all. Creating a same-shaped second table next to an already-unused one would make the duplication problem worse, not better. Two columns added (`document_type`, `parser_version_id`); wiring real writes into it is Phase 4 work. |
| `metadata_quarantine` | Real table, **not publicly readable** (`for select using (false)` on the Supabase side) | Deliberately excluded from `fund_metadata_values`. Quarantined extractions may contain contaminated text (e.g. a stock name mis-parsed into a sector field) that shouldn't be queryable by anything, even accidentally through a generic debug view. |

## What this schema fixes that `factsheet_archive` (011) could not

`factsheet_archive` is a real, working table — it stays exactly as-is, nothing here replaces it.
But it has two structural limits this schema addresses:

1. **One `source_url` per snapshot row, not one per field.** If a scheme's expense ratio and its
   holdings table come from different pages of the same document (or, once portfolio-disclosure
   parsing exists, from a genuinely different document), `factsheet_archive` has no way to say
   so — every field in that row shares the one URL the whole row was stamped with.
2. **Stores only the normalized value.** `factsheet_archive.parsed_expense_ratio numeric` has no
   companion "here is the exact text we matched" field. If a normalization rule turns out to be
   wrong, there is nothing to re-derive from — the raw text is already gone. `source_extractions.
   raw_value` exists specifically so normalization is always replayable.

`factsheet_archive`'s actual strength — one wide, easy-to-diff row per scheme snapshot, which is
exactly what `scripts/archive_factsheets.py`'s `detect_changes()` wants for month-over-month
change detection — is preserved. The two tables serve different, non-overlapping questions ("did
anything about this scheme change since last month" vs "prove exactly where this specific number
came from") and Phase 4 should keep writing to both, not migrate one into the other.

## Stale status is computed, not stored

`fund_metadata_values.is_stale` is a view expression (`current_date - published_date > 45`), not
a column anyone writes. A stored "is this stale" flag would itself need a refresh job to stay
correct — computing it at query time means it is definitionally always correct, with the actual
45-day threshold defined once, in `docs/DATA_SOURCE_REGISTER.md`'s standard policy and mirrored
here as the one place the number is hardcoded in SQL.

## Next dependency

Phase 4's ingestion framework refactor is what will actually populate these tables — this
migration only creates the destination. Until Phase 4 lands, `fund_metadata_values` /
`fund_metadata_history` are correct but empty, the same honest-empty state `metadata.js`'s header
comment already describes for `metadata.json` before the SBI pilot populated it.
