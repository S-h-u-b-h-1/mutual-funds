# Test Database Isolation & CI

How the automated test suite gets a database, why it previously didn't have an isolated one, and
the guard that now makes that structurally impossible to repeat by accident.

## The incident

Until 2026-07-27, this project had exactly **one** Neon branch (`production`,
`br-raspy-glitter-atut1ur7`) and exactly one `DATABASE_URL`. Every context that touched Postgres —
the live Next.js app, the `jobs-worker.yml` cron, and the 69-file vitest integration suite — used
the same connection string, because there was no other one to use.

This traces to a real, dated incident, visible in `frontend/.env.local`'s own git history: a
disposable local dev/test branch (`ep-muddy-shadow-atcbvx38`) had a 2026-07-09 auto-expiry. When it
expired, `.env.local`'s `DATABASE_URL` was updated with "a fresh connection string from the user" —
which turned out to be the production branch's connection string, not a new disposable one. Nothing
caught this at the time, because nothing checked it. From that point on, every local test run —
including the disposable-user creation, order/redemption/switch/job/webhook/notification tests that
this suite runs by the hundreds — wrote real rows into the real production database. Cleanup
routines deleted most of what each run created, but rows created by tests that crashed, timed out,
or were never drained by the file that created them (see `docs/BACKEND_TECHNICAL_DEBT.md` H11)
accumulated silently over time. This was discovered when a routine test run left behind enough
undrained `event-dispatch`/`webhook-outbound-deliver` jobs to start starving unrelated tests' claim
budgets — investigated as a test-flakiness bug before the actual root cause (no isolation at all)
was found.

**This was never caught by CI**, because CI never ran the test suite in the first place (C4).

## The fix

### A dedicated Neon branch

`test` (`br-weathered-star-atigraez`) — a Neon branch forked from `production`, created 2026-07-27.
Neon branches are copy-on-write: creating it was instant and free, and it started as an exact copy
of production's schema *and* data at that moment (84 tables, all 21 migrations already applied).
From that point forward the two branches are independent — writes to one never affect the other.

This is the project's **only** disposable database. Local test runs and (once wired, see C4 below)
CI test runs point at it. Nothing else ever should.

### The safety guard

`frontend/app/lib/testDbGuard.js`'s `assertSafeTestDatabase()` is called from two places:

1. `frontend/vitest.globalSetup.js` — runs once, before any test file (or its `beforeAll`)
   executes. This is the primary check: if it throws, the entire run aborts before a single
   connection opens.
2. `frontend/app/lib/db.js`'s `getPool()` — gated behind `process.env.VITEST === "true"` (which
   Vitest sets automatically in every process it spawns, including worker threads). This never
   runs outside a Vitest process — production and the cron worker never see it — but it's a
   backstop in case the global setup is ever bypassed or misconfigured later.

The check itself is two independent conditions, both required:

1. **Explicit marker.** `TEST_DATABASE_URL` must be set and byte-for-byte identical to
   `DATABASE_URL`. NODE_ENV was deliberately *not* used as the signal — it's frequently unset or
   wrong in ad hoc local runs, and relying on it alone was explicitly ruled out. Requiring a
   second, separately-named variable to agree with the first means an environment has to be
   *deliberately* configured for tests; inheriting a `DATABASE_URL` from somewhere else and running
   tests against it does nothing, because `TEST_DATABASE_URL` won't be set.
2. **Backstop.** The resolved host of `DATABASE_URL` is compared directly against the known
   production Neon host (`ep-autumn-wind-atiwaldh-pooler.c-9.us-east-1.aws.neon.tech`, hardcoded —
   this is a hostname, not a secret) and refused unconditionally if they match. This is what
   actually would have caught the 2026-07-09 incident: condition 1 alone passes if someone sets
   `TEST_DATABASE_URL` to *also* equal a production URL by mistake; this condition doesn't care what
   any variable claims about itself, only what it actually resolves to.

Both checks are unit-verified (three scenarios: missing marker, marker matches but is production,
marker matches and is the test branch) and were confirmed live against a real test file before this
was committed.

### Local setup

`frontend/.env.local` (gitignored, never committed) sets `DATABASE_URL` and `TEST_DATABASE_URL` to
the same value — the test branch's connection string. `npm test` / `npm run dev` both read
`DATABASE_URL` from this file; there is currently no separate `.env.production.local` distinction
for local development against real data, because there's no legitimate reason to run this test
suite against real data. If you specifically need to inspect production data locally, use a
one-off `DATABASE_URL=<production-string> node ...` invocation rather than editing this file — the
guard will refuse to let vitest run in that shell regardless.

### CI

Wired as of 2026-07-27 (C4, `BACKEND_TECHNICAL_DEBT.md`). `.github/workflows/ci.yml` has a
`frontend-tests` job: `npm ci`, `npm run lint`, a guard step that fails loudly if the
`TEST_DATABASE_URL` repo secret is unset, then `npm test` (the full 70-file/506-test vitest suite)
with both `DATABASE_URL` and `TEST_DATABASE_URL` set from that one secret — equal by construction,
satisfying `testDbGuard.js`'s explicit-marker requirement, and never equal to the production
`DATABASE_URL` secret used by `jobs-worker.yml` and the live app's Vercel deployment. A
workflow-level `concurrency` group (per branch/PR ref, `cancel-in-progress: true`) stops superseded
pushes from piling up runs that would otherwise contend for `testClaimLock.js`'s advisory lock on
the same test branch. `timeout-minutes: 25` against a measured ~480s local run, to absorb CI-runner
variance and possible Neon compute cold-starts between infrequent runs.

**Manual step still required**: the `TEST_DATABASE_URL` GitHub Actions secret itself has not been
created — `gh secret set` for it was denied by this session's tooling permissions twice. Someone
with repo admin access needs to add it once: Settings → Secrets and variables → Actions → New
repository secret → name `TEST_DATABASE_URL`, value = the `test` branch's connection string (the
same one in `frontend/.env.local` locally). Until that secret exists, `frontend-tests` will fail
fast at the guard step with a clear message rather than running against an empty/wrong database —
it will not silently pass or silently touch production.

### Deploy gating: does a red CI run block a Vercel production deploy?

**No, verified, not just assumed.** Two concrete commits prove it: `8e355f2a` and `7355886f` both
have GitHub Actions `CI` runs that concluded `failure`, and both also have Vercel deployments that
reached `READY` on `target: production` from that exact commit SHA (checked directly via the Vercel
API's deployment metadata, cross-referenced against `gh run list` — not inferred from settings that
merely looked absent). Confirmed contributing causes: no `vercel.json` in the repo (so no
`ignoreCommand`), and `main` has no GitHub branch protection at all (`gh api
repos/.../branches/main/protection` → 404 "Branch not protected") — so even a PR merge isn't
blocked by required status checks, and Vercel's own Git integration deploys on every push
independent of Actions status regardless.

**What's built, and what it can't do alone.** `scripts/vercel-ignore-build-step.js` implements
Vercel's actual supported mechanism for conditional deploys (a project's "Ignored Build Step"):
given `VERCEL_GIT_COMMIT_SHA`, it polls the GitHub Actions API for that commit's `CI` run and exits
0 (skip the deploy) only on a confirmed `failure` conclusion, exiting 1 (proceed) on success,
timeout, or any ambiguity — deliberately fail-open, reasoned through in the script's own header
comment. This is a complete, ready-to-use implementation, but it cannot activate itself: pasting a
command into a project's Ignored Build Step is a dashboard-only setting with no equivalent in this
session's available tooling (no project-settings-write capability was reachable), and flipping it
changes every future deploy's latency (a real CI run now sits in the critical path, up to the
script's 12-minute poll ceiling) — a live-product tradeoff that deserves a deliberate go-ahead
rather than a silent activation.

**To activate**: Vercel dashboard → this project → Settings → Git → Ignored Build Step → paste
`node scripts/vercel-ignore-build-step.js` (if the project's configured Root Directory is
`frontend`, this step may run from there instead of the repo root — try the plain path first; if
Vercel reports the file isn't found, use `node ../scripts/vercel-ignore-build-step.js`). No new
secret is required for the public repo case; set `GITHUB_TOKEN` as a project env var only if the
unauthenticated GitHub API rate limit (60 req/hr) ever becomes a problem in practice.

## Operational note: keeping the test branch's schema current

Because the two branches are independent after the fork, a migration applied to `production` is
**not** automatically applied to `test`. Every `sql/neon/0XX_*.sql` file applied to production going
forward must also be applied to the `test` branch, or the test branch's schema will drift stale
relative to what the code (and tests) expect. **H9 closed the tooling gap this section used to flag**
— `scripts/apply_migrations.py` plus `schema_migrations` (`sql/neon/025_migration_ledger.sql`) now
give a single command (`--status`/`--apply`/`--verify`) to apply and track pending migrations
against whichever branch `DATABASE_URL` points at, rather than two ad hoc processes. See
`docs/MIGRATION_RUNBOOK.md` for the full process and the current per-branch inventory. The
underlying manual step remains the same as before: **when you apply a migration to production,
apply the same file to the `test` branch (`br-weathered-star-atigraez`) too** — the tooling makes
each half of that easy to do and easy to verify after the fact, it doesn't apply to both branches
in one call.

## What this does not solve

- **Staging.** The user's target architecture also names a staging environment reading from its own
  database. No staging environment exists yet (Vercel preview deployments exist per-PR, but nothing
  currently points them at an isolated database rather than production) — out of scope for this
  pass, noted here so it isn't mistaken for solved.
- **Local app development against real data.** Intentionally left as a manual override (see above),
  not a second persistent config, to keep the number of "which database am I pointed at" states low.
