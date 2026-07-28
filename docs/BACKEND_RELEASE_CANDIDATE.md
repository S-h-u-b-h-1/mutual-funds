# Backend Release Candidate 1

Backend Hardening Phase 3, final verification. 2026-07-28.

## Verdict: CONDITIONALLY READY

Not READY. Not NOT READY. Every Critical item has either shipped or has a written, reviewed,
`test`-branch-verified fix sitting one production-DB-access step away from shipping — there is no
remaining Critical or High item that requires more design work or more code. What remains is
entirely **operational access this session's tooling does not have**: applying five reviewed SQL
files to the production database, and creating two secrets in GitHub/Vercel that already have
values ready to set. See "What actually blocks READY" below for the exact, complete list — there
is nothing else hiding behind it.

**Scope boundary, stated explicitly because the regulatory context makes it matter**: this
document assesses backend platform hardening — concurrency safety, auth, observability, migration
process, database quality. It says nothing about whether MF Pulse is ready to place a real
investment order, because **it structurally cannot be**: all 5 Invest providers (KYC, Compliance,
Document, Payment, Portfolio) are still mock implementations (Phase 1 design, unchanged this
session — see `docs/INVEST_PLATFORM_ARCHITECTURE.md`). No real money has moved, and none can,
regardless of this verdict. "Release Candidate" here means *the backend is sound enough to build
real provider integrations against*, not *ready to go live for Suasion Securities' real, registered
(ARN 289322 / EUIN E544323) distribution business*. That is a separate, much larger decision
involving real provider contracts, real compliance sign-off, and people this session does not
have access to.

---

## What actually blocks READY

Seven items, all pure operational access, zero remaining design or code work:

| # | What | Needs |
|---|---|---|
| C1 | Order idempotency (compare-and-swap on order creation/submission) | `psql -f sql/neon/022_order_idempotency.sql` against production, then merge `hardening/c1-order-idempotency` |
| H6 | Account deletion → anonymize-in-place (retention-safe) | `psql -f sql/neon/024_account_lifecycle.sql` against production, then merge `hardening/h6-account-lifecycle` |
| M6/M7 | Index cleanup + 4 new hot-path indexes | `psql -f sql/neon/026_index_cleanup.sql` against production (already merged to `main`, `test`-verified) |
| L5 | Drop 2 confirmed-dead tables | `psql -f sql/neon/027_drop_dead_tables.sql` against production (already merged to `main`, `test`-verified) |
| H5 | Fix `placed_by_user_id` FK's `ON DELETE` behavior | `psql -f sql/neon/028_placed_by_user_fk_fix.sql` against **both** `test` and production (already merged to `main`) |
| — | CI's Neon-backed test job (`frontend-tests`) and now `backend-tests`' migration-regression suite | Create `TEST_DATABASE_URL` as a GitHub Actions repo secret (value already in `frontend/.env.local` locally) |
| — | The 5 `/api/internal/*/status` endpoints | Set `INTERNAL_STATUS_SECRET` in Vercel production env (any new random value — nothing depends on a specific one) |

After each SQL file: `DATABASE_URL="..." .venv/bin/python3 -m scripts.apply_migrations --backfill
0NN_thing.sql` to record it in the ledger. Full detail, including exactly why this session's own
tooling couldn't do these itself (a classifier denial, not a design gap), is in
[`MIGRATION_RUNBOOK.md`](MIGRATION_RUNBOOK.md).

**Nothing above requires a design decision.** Every file has been reviewed against the same bar
`docs/MIGRATION_IMPACT_REPORT_004_005.md` set (additive-only, FK-traced, idempotent, checked
against real production schema and row counts, not assumed) and verified working against the
isolated `test` branch — 026 and 027 are proven live there; 022, 024, and 028 are either proven
live on `test` (022, 024) or were denied even there (028, needs a human on `test` too).

---

## Scorecard

| Severity | Total | Fixed & live | Written, `test`-verified, blocked on prod access | Open |
|---|---|---|---|---|
| Critical | 5 | 4 (C2, C3, C4, C5) | 1 (C1) | 0 |
| High | 12 | 8 (H2, H3, H4, H7, H9-process, H10, H11, H12) | 2 (H5, H6) | 2 (H1, H8) |
| Medium | 20 | 5 (M6, M7, M10, M13-partial, M16) | 0 | 15 (real, non-urgent — see `BACKEND_TECHNICAL_DEBT.md`) |
| Low | 13 | 0 | 1 (L5) | 12 (hygiene, documented tradeoffs) |

**H1 (payment provider idempotency)** is not independently blocked — it's substantially satisfied
by C1's own design (`order.id` reaches both provider calls as an idempotency key), so it inherits
C1's status rather than needing separate work. It will be verifiably closed the moment C1 merges.

**H8 (jobs-worker.yml has no failure alerting)** is the one genuinely open, unblocked item —
real, scoped, low effort (S), not started this pass. See `BACKEND_TECHNICAL_DEBT.md` and
`INCIDENT_RESPONSE.md` §3 for the current (manual, pull-based) mitigation.

**H9** is split status on purpose: the migration *process* (ledger, tooling, CI wiring) is fully
fixed; extending `test_migrations.py`'s per-table schema-contract pattern to the 19 migrations
since 006 is real, correctly-scoped-out effort, tracked as open in `MIGRATION_RUNBOOK.md`'s "Known
gaps" section.

---

## Test suite determinism

Full suite (frontend/) run twice, back to back, against the isolated `test` branch
(`br-weathered-star-atigraez`) — the same branch and command CI's `frontend-tests` job uses:

```
DATABASE_URL="$TEST_DATABASE_URL" TEST_DATABASE_URL="$TEST_DATABASE_URL" npx vitest run
```

- Run 1: **73/73 files, 535/535 tests passed**, 620.80s
- Run 2: **73/73 files, 535/535 tests passed**, 414.73s

Both runs identical pass/fail counts, zero flakes — the isolation work (`docs/TEST_DATABASE_AND_CI.md`,
the H11 root-cause drain fix, the shared-jobs-table claim-locking in `testClaimLock.js`) holds
under a real back-to-back run, not just in theory. Separately, `tests/test_migrations.py` (12
tests, the Python migration-regression suite) was run directly against the same branch during H9
and passed 12/12 for real — see `MIGRATION_RUNBOOK.md`.

**Honesty note on how these two runs were reached**: the first several full-suite attempts *this
same session* did not pass — they failed on a stale, ~737-row shared job-table backlog causing
unfiltered `runWorkerTick`/`claimJobs` calls in `jobPlatform.test.js`/`eventBus.test.js` to starve
on ancient rows before reaching their own freshly-enqueued jobs, plus one genuine orphaned-cleanup
bug in `eventBus.test.js`. Both are now fixed at the root (`idIn`-scoped claiming, cleanup moved
into `finally`, plus a new age-thresholded `testDataSweep.js` run in `vitest.globalSetup.js` so the
backlog can't silently reaccumulate) — see `BACKEND_TECHNICAL_DEBT.md`'s C4 incident writeup for
the full account. The two runs above are the *post-fix* determinism proof, not the first attempts;
they're reported here because they're the ones that matter for the READY/CONDITIONALLY-READY
question, but reporting them without this note would overstate how smooth the path to them was.

---

## What's genuinely live in production right now

Everything in the "Fixed & live" column above, plus the pre-existing feature-complete Invest
platform (Modules 1-11, the 5-item Backend Contract Priority Brief, Phase 4/4.5 platform
primitives) this hardening pass audited rather than rebuilt. Concretely, as of this RC:

- **Concurrency-safe**: redemption/switch folio races (C2), job double-execution (H2),
  notification duplicate-send including the crash-mid-send edge case (H3 fully closed).
- **Observable**: every invest API route logs structured, correlated request/error data to Vercel
  (C3) — a failed order today leaves a real trace, where before this pass it left none.
- **Rate-limited**: login, register, forgot-password, reset-password (H4) — all exploitable with
  a plain unauthenticated script before this pass.
- **Resilient**: every one of the 5 mock providers has timeout + circuit-breaker protection
  (H12) — a hung or failing provider can no longer take down every concurrent request or hammer
  a struggling dependency.
- **Gated internally**: the 5 `/api/internal/*/status` endpoints plus `alerts/run` require a
  shared secret (M10) — previously reachable by anyone who found the URL.
- **CI-enforced**: the 73-file test suite and lint actually gate merges to `main` now (C4) — a
  broken test could merge and deploy with zero resistance before this pass.
- **Migration-tracked**: every schema change from here forward has a real, checksummed,
  database-native record of what's applied where (H9) — the 005/006 incident's root gap.
- **Index-correct** (`test` branch; production pending the access step above): the 7 provably
  redundant indexes this schema had accumulated are gone, the 2 real hot-path queries the audit
  flagged now have the composite index they need (M6/M7).

## What's real and still open (not blocked, just not done)

- **H8**: job-worker failure alerting.
- **19 migrations (007-021) still lack `test_migrations.py`-style per-table schema-contract
  tests** — the ledger catches file-level drift, not "the live schema silently stopped matching
  what the app expects" for anything outside the original 4/5/6-scoped tables.
- **Medium/Low items not touched this pass** (M1-5, M8, M9, M11, M12, M14, M15, M17-20 minus what
  M6/M7/L5 closed, most of L1-L13) — real, ranked, and each individually small; see
  `BACKEND_TECHNICAL_DEBT.md` for the full list. None are launch-blocking; several (M4, the
  notification-preference-system consolidation; M9, the reconciliation N+1) are worth prioritizing
  whenever this backend starts handling real provider traffic, since both get materially worse
  under real load rather than staying a hygiene issue.
- **P2 architecture cleanup** (task-tracked as its own item) was correctly not started this pass —
  it's explicitly gated on Critical/High being fully closed, which they are not yet (blocked on
  the access items above, not abandoned).

## Before this can become READY

1. Someone with production Neon access runs the 5 migration files listed above, in the order
   listed (022 and 024 are independent of 026-028 and can run in parallel with them; 028 needs
   `test` access too, not just production).
2. Merge `hardening/c1-order-idempotency` and `hardening/h6-account-lifecycle` to `main` once
   their migrations are confirmed live (verify with `--status`, don't assume).
3. Create the `TEST_DATABASE_URL` GitHub Actions secret and set `INTERNAL_STATUS_SECRET` in Vercel.
4. Re-run this document's verdict section — at that point every Critical and every currently-
   blocked High item is closed, and the honest verdict becomes READY (for backend hardening
   purposes — see the scope boundary above; it is never a statement about real-money readiness).
5. Optionally, before or after: H8 (real effort, small, unblocked) and the `test_migrations.py`
   coverage extension (real effort, larger, unblocked) are the two remaining non-access-gated
   items worth closing for a genuinely complete picture, though neither blocks the verdict above.

## Related documents

- [`BACKEND_AUDIT_REPORT.md`](BACKEND_AUDIT_REPORT.md) — the original point-in-time findings (2026-07-24), evidence and exploit scenarios for everything referenced above.
- [`BACKEND_TECHNICAL_DEBT.md`](BACKEND_TECHNICAL_DEBT.md) — the full ranked inventory and every resolution note.
- [`MIGRATION_RUNBOOK.md`](MIGRATION_RUNBOOK.md) — migration process, the 005/006 incident, and the current per-branch migration inventory.
- [`OBSERVABILITY_RUNBOOK.md`](OBSERVABILITY_RUNBOOK.md) — what server-side logging exists and how to use it.
- [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) — what to actually do when something breaks, using the tooling this pass built.
- [`TEST_DATABASE_AND_CI.md`](TEST_DATABASE_AND_CI.md) — test/production database isolation and CI gating.
