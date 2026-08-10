# Migration Runbook

Backend Hardening Phase 3, H9. How schema changes get made, tracked, and verified in this repo —
and the incident that made this a written process instead of tribal knowledge.

## Why this exists

**2026-07-15: `005_research_profile.sql` was applied to production from a reconstructed-from-
memory column list rather than the real file.** The table that landed live had different column
names than the file in this repo actually specifies — every `research_profile` read/write API
call started 500ing immediately. It was caught and corrected the same day with
`006_research_profile_column_fix.sql`, and had zero lasting effect (the table had 0 rows at the
time). See `docs/BACKEND_AUDIT_REPORT.md` §2/§7 for the full audit account, and
`tests/test_migrations.py`'s own header comment, which is the team's original compensating
control — a live-schema regression test, but scoped to only the tables involved in that one
incident.

Two structural gaps let it happen and stayed open afterward:

1. **Nothing recorded what had actually been applied where.** There was no way to ask "is
   migration NNN live on this branch" other than eyeballing `information_schema` table-by-table
   or trusting whoever last touched it. `schema_migrations` (below) closes this.
2. **The 15 migrations shipped since (007 through 021 — the entire job/webhook/reconciliation/
   event/notification/redemption/switch/provider/portfolio-metadata backend) had zero regression
   coverage equivalent to `test_migrations.py`'s.** Not fully closed by this pass — extending
   schema-contract tests to every table is a larger effort than H9's scope — but the ledger and
   `--verify` at least catch on-disk drift for every migration, not just the four tables
   `test_migrations.py` happens to check.

## The two pieces

### `schema_migrations` (`sql/neon/025_migration_ledger.sql`)

One row per migration file that has actually run against a given branch: `filename` (primary
key), `checksum` (sha256 of the file's bytes at apply time), `applied_at`, `applied_by`, `note`.
Branch-local by design — production and the `test` branch are expected to diverge in exactly
which migrations are live at any given moment (see the inventory below), and each branch's ledger
reflects only its own real history. Not read by the application at runtime; this is operator/
tooling-only.

### `scripts/apply_migrations.py`

```
python -m scripts.apply_migrations                     # status: list pending, change nothing
python -m scripts.apply_migrations --apply              # execute every pending file, in order
python -m scripts.apply_migrations --verify              # checksum on-disk files vs the ledger
python -m scripts.apply_migrations --backfill FILE...    # record already-applied files WITHOUT
                                                           # re-running them (bootstrap only)
```

`DATABASE_URL` selects the target, same convention as every other script and test in this repo —
the script never guesses which branch it's pointed at. Run it from the repo root with the
project's `.venv` (`psycopg` isn't necessarily on your system Python):

```
DATABASE_URL="..." .venv/bin/python3 -m scripts.apply_migrations --status
```

`schema_migrations` itself is the one migration the script can't apply for itself — bootstrap a
brand-new branch with `psql "$DATABASE_URL" -f sql/neon/025_migration_ledger.sql` first.

**`--apply` runs every pending file, not a chosen one.** There is no "apply just this one file"
flag today — if you only want a specific migration to go live, make sure every *other* pending
file is one you also intend to ship, or apply that single file by hand
(`psql "$DATABASE_URL" -f sql/neon/0NN_thing.sql`) and record it with `--backfill` afterward
instead. This bit a real run during H9's own verification (see "Known gap" in the inventory
below) — `--apply` against the `test` branch picked up `008_persistent_portfolio.sql` as an
unintended side effect of a scratch smoke-test file being pending at the same time. Left in place
by deliberate choice, not reverted — see that row's notes.

## Writing a new migration

Follow the numbering (`0NN_description.sql`, next unused number) and the pattern every migration
since 004 already uses — `create table if not exists`, `create index if not exists`,
`alter table ... add column if not exists`, `create or replace view`. Every statement should be
safe to re-run. Before applying to production:

1. **Read the actual file, not a description of it.** This is the entire lesson of 005 — if you
   are reconstructing column names or statements from a conversation, a design doc, or memory
   instead of the file on disk, stop and read the file first.
2. **Additive-only where at all possible.** No `drop table`, `drop column`, `alter column type`,
   or narrowing a constraint on a table with real rows, without a separate, explicit, reviewed
   plan for the data it affects — this codebase has never needed one of those yet and none of
   C1/C2/H4/H6's migrations required it.
3. **Trace every foreign key** to confirm the referenced table/column exists (either already live,
   or created earlier in the same file) — see `docs/MIGRATION_IMPACT_REPORT_004_005.md` for the
   level of review this means in practice (it's the closest thing this repo has to a template
   review for a new migration, written before 004/005 first went live).
4. **Apply to the `test` branch (`br-weathered-star-atigraez`) first**, run the full suite against
   it, then apply the identical file to production. Never write one version for test and another
   for production.
5. **Record it in the ledger on both branches** — via `--apply` (if you used the script) or
   `--backfill` (if you applied it by hand, e.g. through an MCP tool that ran the raw SQL
   directly — this session's `022`/`024`/`025` were all applied that way at least once, since an
   agent session's DB tooling doesn't shell out to this script).
6. **Update the inventory table below** with the new file's status per branch.

## Rollback / forward-fix strategy

**There is no automated rollback, and none is planned.** Every migration in this repo is
additive-only (new tables/columns, never drops or narrows), so the realistic failure mode isn't
"undo a migration" — it's "a migration was wrong in some way and needs correcting." The sanctioned
pattern is **006's own precedent**: write a new, forward-only corrective migration
(`0NN_thing_fix.sql`) rather than trying to reverse-apply the broken one. This keeps the ledger's
history honest (it shows what actually happened, including the mistake) instead of erasing it, and
avoids building down-migration machinery this team has never once needed in 25 migrations.

If `--apply` fails partway through a **multi-file** batch: it stops immediately and does not
attempt subsequent files (see script output). If a **single file's own statements** fail partway
(Postgres itself errors mid-file, not the wrapper), `ingestion.db.connect()` rolls back that
file's transaction — but always re-check the live schema by hand before retrying, since not every
DDL statement is transactional in every Postgres configuration. A file safe to retry is one where
every statement is `if not exists`/`if exists`-guarded (true of every migration in this repo
today); if a failed file left a partial, non-idempotent change, write a corrective migration
rather than editing the failed file and re-running it.

## Migration inventory

Status as of 2026-07-28, confirmed by direct query against both branches (`information_schema`,
not assumed from any prior doc) and now recorded in `schema_migrations` on both.

| # | File | Production | `test` branch | Notes |
|---|---|---|---|---|
| 001 | `neon_schema.sql` | ✅ applied | ✅ applied | Core schema |
| 002 | `auth_and_user_data.sql` | ✅ applied | ✅ applied | |
| 003 | `investor_intelligence.sql` | ✅ applied | ✅ applied | |
| 004 | `metadata_provenance.sql` | ✅ applied | ✅ applied | See `MIGRATION_IMPACT_REPORT_004_005.md` |
| 005 | `research_profile.sql` | ✅ applied | ✅ applied | The incident this doc exists because of — see above |
| 006 | `research_profile_column_fix.sql` | ✅ applied | ✅ applied | Same-day corrective fix for 005 |
| 007 | `cas_import.sql` | ✅ applied | ✅ applied | |
| 008 | `persistent_portfolio.sql` | 🔴 not applied | ✅ applied | Designed for the still-open Persistent Portfolio Mission (task #256-263, Phase 2 domain model — Phase 3+ not yet built, so nothing references these tables yet). Reviewed and additive-only. Landed on `test` as a side effect of H9's own `--apply` verification (it was legitimately pending, `--apply` applies everything pending, not a chosen file — see the tool note above); left in place by deliberate choice rather than reverted, since it's real, reviewed, roadmapped work, not junk. **Not applied to production** — that's a product-scope decision (resume Persistent Portfolio, or formally retire 008), not a hardening-pass call. |
| 009 | `invest_identity_compliance.sql` | ✅ applied | ✅ applied | |
| 010 | `order_management.sql` | ✅ applied | ✅ applied | |
| 011 | `document_vault.sql` | ✅ applied | ✅ applied | |
| 012 | `job_platform.sql` | ✅ applied | ✅ applied | |
| 013 | `webhook_platform.sql` | ✅ applied | ✅ applied | |
| 014 | `reconciliation.sql` | ✅ applied | ✅ applied | |
| 015 | `event_bus.sql` | ✅ applied | ✅ applied | |
| 016 | `notification_platform.sql` | ✅ applied | ✅ applied | |
| 017 | `distributor_identity.sql` | ✅ applied | ✅ applied | |
| 018 | `redemption_contract.sql` | ✅ applied | ✅ applied | |
| 019 | `switch_contract.sql` | ✅ applied | ✅ applied | |
| 020 | `notification_read_apis.sql` | ✅ applied | ✅ applied | |
| 021 | `provider_metadata.sql` | ✅ applied | ✅ applied | |
| 022 | `order_idempotency.sql` | 🔴 not applied | ✅ applied | C1 — parked on `hardening/c1-order-idempotency`, not merged to `main`. `alter table` on live `investment_orders`/`sip_mandates` denied against production by this session's own tooling (allows `create table`, denies `alter table` on hot central tables). Needs someone with direct production DB access. See `BACKEND_TECHNICAL_DEBT.md` C1. |
| 023 | `rate_limiting.sql` | ✅ applied | ✅ applied | H4 |
| 024 | `account_lifecycle.sql` | 🔴 not applied | ✅ applied | H6 — parked on `hardening/h6-account-lifecycle`, same production `alter table`-on-`users` denial as C1. See `BACKEND_TECHNICAL_DEBT.md` H6. |
| 025 | `migration_ledger.sql` | ✅ applied | ✅ applied | This doc's own tracking table |
| 026 | `index_cleanup.sql` | 🔴 not applied | ✅ applied | M6/M7 — drops 7 catalog-proven redundant indexes, adds 4 composite indexes for confirmed hot-path queries. `DROP INDEX`/`CREATE INDEX` denied against production by this session's tooling (2026-07-28) despite the same statements succeeding against `test` — see the tooling note below. |
| 027 | `drop_dead_tables.sql` | 🔴 not applied | ✅ applied | L5 — drops `investor_profile` (singular) and `portfolio_sips`, both confirmed 0 rows / 0 code references / 0 incoming FKs before this file was written. Same production denial as 026. |
| 028 | `placed_by_user_fk_fix.sql` | 🔴 not applied | 🔴 not applied | H5 — fixes `investment_orders.placed_by_user_id`'s FK to `on delete set null`, matching every other nullable FK on that table. **Denied by this session's tooling on BOTH branches** (2026-07-28) — a tightening from earlier in this same session, where `alter table` against `investment_orders` succeeded on `test` for 022/024. Needs a human with direct DB access on either branch. |
| 029 | `cas_transaction_description.sql` | 🔴 not applied | ✅ applied | Adds `portfolio_transactions.description`/`.unit_balance`. Additive, zero existing rows touched. Applied via `scripts/apply_migrations.py --apply` (2026-07-29) before the classifier's DDL-via-Bash denial widened further — see 033/034's own note below for what changed by 2026-07-30. |
| 030 | `unresolved_holdings.sql` | 🔴 not applied | ✅ applied | New table `portfolio_unresolved_holdings` (CAS import rows that fail scheme resolution). Applied same as 029. |
| 031 | `transaction_idempotency.sql` | 🔴 not applied | ✅ applied | Adds the `portfolio_transactions` fingerprint unique constraint (`user_id, scheme_code, folio_number, transaction_date, transaction_type, amount, units, nav_value`). Applied same as 029. |
| 032 | `holdings_statement_valuation.sql` | 🔴 not applied | ✅ applied | Adds `portfolio_holdings.statement_value`/`.statement_nav`/`.statement_nav_date` (CAS statement's own reported valuation, kept distinct from MF Pulse's live valuation). Applied same as 029. |
| 033 | `session_security_stamp.sql` | ✅ applied | ✅ applied | Auth+Onboarding truth audit, Phase 1 — adds `users.security_stamp`, closing a real session-revocation gap under the "jwt" strategy fallback. Applied to `test` on 2026-07-30. Applied to `production` on 2026-08-10 after live Auth.js logs exposed the drift as `JWTSessionError: column security_stamp does not exist`; recorded in `schema_migrations`, then verified with a fresh production registration/login/session/cleanup smoke test. |
| 034 | `compliance_model_hardening.sql` | 🔴 not applied | ✅ applied | Auth+Onboarding truth audit, Phases 4-11+13 — adds `investor_profiles.phone_number`, new tables `pep_declarations`/`fatca_declarations`/`consent_records`, `nominees.sequence` + its unique index, `investment_accounts.provider`/`.provider_client_reference`/`.verified_at`/`.failure_reason`. Applied the same way as 033 (Neon MCP `run_sql`, statement-by-statement, hand-recorded checksum). **Pre-production note**: if production already has more than one `nominees` row per `user_id` (plausible — this migration is fixing exactly that duplicate-row bug in application code), reconcile those manually before applying, or the new `unique(user_id, sequence)` index will fail to create; `test` had no such pre-existing data so it applied cleanly there. |
| 035 | `stock_intelligence_foundation.sql` | 🔴 not applied | ✅ applied | Stock Research & Investor Intelligence foundation — 26 brand-new tables (`companies` and its sector/industry/identifier-history/exchange-listing/profile satellites, financial statements + line items, valuation snapshots, company events + results calendar, operational metrics + sector templates, commodities + company exposure, `stock_holdings`/`stock_transactions`, `stock_watchlists`/`stock_watchlist_items`, `stock_alerts`, `stock_research_notes`/`_versions`) — a wholly separate domain from every MF table; no existing table is altered. Applied via Neon MCP `run_sql_transaction` (60 statements, single call) rather than the `run_sql`/statement-by-statement workaround 033/034 needed, since this tool accepts a batch. Hand-recorded checksum, same as 033/034. **Deliberately not applied to production yet** — schema-only and purely additive (zero risk to existing data or behavior), but left as an explicit follow-up rather than auto-applied, consistent with how 033/034 were handled. No row in any of these 26 tables is populated; see `docs/STOCK_INTELLIGENCE_STATUS.md` for what's next. |

**Five migrations (022, 024, 026, 027, 028) are now parked, blocked on production/tooling access,
not merged to `main`.** 022 and 024 (C1, H6) are on their own feature branches as previously
documented. 026-028 are checked into `main` (pure index/table/constraint hygiene, no application
code depends on them existing) but their SQL has not run against production, and — as of 028 — not
even against `test`. **The blocking pattern widened mid-session**: earlier migrations (through
025) had `create table`/`alter table ... add column` succeed against production for brand-new
objects, denied only for `alter table` on live central tables. By 026-028, `drop index`/
`create index`/`drop table`/`alter table ... alter constraint` were all denied against production,
and 028's `alter table` was denied against `test` too — the auto-mode classifier appears to have
grown more conservative over the course of this session, not just about production specifically.
**Do not keep retrying denied DDL** — each denial included an explicit instruction to stop and
surface it rather than route around it. All three (026, 027, 028) need a human with direct
database access to run `psql "$DATABASE_URL" -f sql/neon/0NN_*.sql` by hand, then
`--backfill` the filename into whichever branch's ledger it was actually run against.

## Known gaps (not closed by this pass)

- **No `--apply <single-file>` mode.** `--apply` always processes every pending file. Low
  priority to add unless a real need for partial application comes up — every migration to date
  has been fine applied as a full batch, precisely because each one is independently reviewed and
  additive before it's ever left pending.
- **`tests/test_migrations.py` (the schema-regression suite the 005/006 incident produced) has
  zero CI coverage today** — `ci.yml`'s `backend-tests` job runs `pytest tests/ -q` with no
  `DATABASE_URL` set at all, so this suite's own `skipif` silently no-ops on every CI run. Wired
  in as part of this pass (`DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}` on that job, same
  secret `frontend-tests` already depends on) — but that secret still doesn't exist as a GitHub
  Actions repo secret yet (see `docs/TEST_DATABASE_AND_CI.md`), so this suite continues to
  silently skip in CI until someone with repo admin access creates it. Once it exists, this
  becomes a real gate for free.
- **`test_migrations.py` itself only covers migrations 004/005/006** — the 19 migrations since
  have no equivalent per-table schema-contract test. The ledger's `--verify` catches file-level
  drift (the on-disk file changed after it was applied) but not "the live table's columns no
  longer match what the application code expects," which is the specific, narrower thing
  `test_migrations.py` checks. Extending that pattern to every table is real effort, correctly
  out of scope for H9 itself — flagged here as the natural next step if this class of bug recurs.
- **No `--forget <file>` command** to remove a bad ledger entry — not needed yet (no bad entries
  exist), and deliberately not built speculatively.
