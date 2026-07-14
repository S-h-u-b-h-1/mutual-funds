# Migration Impact Report — 004_metadata_provenance, 005_research_profile

Production Activation Phase 1. Reviewed before either migration touches the live database.

## Verdict: safe to apply, both migrations, no changes required to proceed

One real gap was found and fixed during this review (below) — not a blocker, but worth being
explicit that the migrations reviewed here are not byte-identical to what was drafted last turn.

## 004_metadata_provenance.sql (mirrors sql/013_metadata_provenance.sql on Supabase)

| Check | Result |
|---|---|
| Additive only | Yes — every statement is `create table if not exists`, `create index if not exists`, `create unique index if not exists`, `create or replace view`, or `alter table ... add column if not exists`. No statement modifies or removes anything that exists today. |
| Destructive statements | None. No `drop`, `delete`, `truncate`, `update`. |
| Unsafe table drops | None. |
| Column rewrites | None. The two `alter table fact_factsheet_runs add column if not exists` statements add columns; they don't touch the 6 columns `fact_factsheet_runs` already has. |
| Data loss risk | None — `fact_factsheet_runs` is confirmed empty today (Phase 4 finding from the Provenance Mission: nothing has ever written to it), and every other object is newly created. |
| Foreign keys | Traced all 6: `source_document_versions.source_document_id → source_documents(id)`, `source_extractions.source_document_version_id → source_document_versions(id)`, `source_extractions.parser_version_id → parser_versions(id)`, `field_validation_results.source_extraction_id → source_extractions(id)`, `metadata_quarantine.source_extraction_id → source_extractions(id)`, `fact_factsheet_runs.parser_version_id → parser_versions(id)`. Every reference targets a table created earlier in the same file (or an existing table) — no forward references, no dangling targets. |
| Indexes | 6 supporting indexes, each matching a real query pattern this schema exists to serve (current-value lookup, scheme+field history lookup, document-version lookup, unreviewed-quarantine lookup). **One gap found and fixed during this review**: `source_extractions`'s "current row" index was a plain index, not a unique one — the design doc claims "exactly one current=true row per (scheme_code, field_name)" as an invariant, but nothing enforced it at the database level. Changed to a unique partial index (`ux_source_extractions_current`) in both the Neon and Supabase files, before either has ever been applied — the cheapest possible time to add it, since the table is still empty. |
| Ownership constraints | Not applicable by design — this is public fund-research data (same category as the already-live `factsheet_archive`), not user-owned data. No `user_id` anywhere in this migration, correctly. |
| Timestamps | All `timestamptz not null default now()` except `reviewed_at` (nullable timestamptz — correctly null until an actual review happens) and `published_date` (plain `date`, correctly — it's a calendar date a source document states, not an instant). |
| Nullable fields | Checked all 27 columns individually. Nullable where a field is genuinely optional per-row (`scheme_hint`, `published_date`, `byte_size`, `raw_value`, `page_number`, `table_reference`, `limitations`, `detail`, `resolution`, etc.); `not null` where a row is meaningless without it (`scheme_code`, `field_name`, `extraction_method`, `confidence`, and every FK). Correct in both directions. |
| Consent handling | Not applicable — no personal or user-identifying data in this migration. |
| Idempotency | Every single statement re-runs cleanly with no error and no duplicate side effect: `if not exists` on every `create table`/`create index`, `create or replace` on both views. Confirmed by inspection, not just by convention. |

## 005_research_profile.sql

| Check | Result |
|---|---|
| Additive only | Yes — one `create table if not exists`, nothing else. |
| Destructive statements | None. |
| Unsafe table drops | None. |
| Column rewrites | N/A — new table. |
| Data loss risk | None. |
| Foreign key | `user_id uuid primary key references users(id) on delete cascade` — correct PK-is-FK 1:1-with-users shape, matching the already-live `user_preferences`/`portfolio`/`investor_profile` tables exactly. `on delete cascade` is correct and necessary: if an account is deleted (the existing `DELETE FROM users WHERE id = $1` in `/api/v1/account`), this row must go with it, not orphan. |
| Indexes | None beyond the primary key — correct, since every access pattern is a 1:1 lookup by `user_id`, which the PK already serves. |
| Ownership constraint | The `user_id` FK **is** the ownership boundary. Verified this is enforced at the query layer too, not just the schema: the API route's `WHERE user_id = $1` always uses `requireUser()`'s session-derived id, never a client-supplied one — the two layers agree. |
| Timestamps | `created_at`/`updated_at`, both `timestamptz not null default now()`. Confirmed the API route's upsert actually bumps `updated_at = now()` on every write, not just on insert. |
| Nullable fields | All 7 profile columns are nullable. This is intentional, not an oversight: the API route's upsert uses `coalesce($n, research_profile.column)` per field, which is what makes a **partial** update possible (updating just one field without clobbering the others to null). A `not null` constraint here would break that and force every write to carry every field. Required-ness is enforced client-side (`isProfileComplete()`), which is where it belongs for fields that legitimately fill in over multiple visits. |
| Consent handling | This is the field this migration exists to get right. No `consent_given_at` column — deliberately, and only because the actual fields collected (role, goal, experience, a risk **comfort** label, a horizon **band**, an AUM **band** with an explicit "prefer not to say" default, free-text category names) contain no salary, income, savings, dependents, or identity documents. Re-verified against the live field list in `PROFILE_OPTIONS` (`userProfile.js`) during this review, not just against memory of writing it. If this table's scope ever grows to include anything from that sensitive list, it must move to `investor_profile`'s consent-gated path instead — never quietly added here. |
| Idempotency | `create table if not exists` — clean re-run. |
| Enum-strictness (raised, not a defect) | Unlike 004's new tables, `research_profile`'s text columns (`role`, `experience`, etc.) have no `check (... in (...))` constraint — considered and deliberately left as "soft enums." This matches the documented precedent in `003_investor_intelligence.sql`'s own header comment: user-facing preference fields are comment-documented, not hard-constrained, specifically so a new option value (e.g. a new investor role) never requires a migration. Enforced at the application layer (`PROFILE_OPTIONS`) instead, consistent with how every other preference-shaped table in this schema already works. |

## What this report does not cover

Whether the live Neon database's `users` table actually has the shape both migrations assume
(a `uuid` primary-keyed `id` column) is not re-verified by static file review — it's asserted by
precedent (three other tables already reference `users(id)` successfully in production) rather
than re-confirmed against the live schema. Phase 2's post-apply verification step confirms this
for real before either migration is considered "done."
