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

Not yet wired as of this writing — that's C4, tracked separately in `BACKEND_TECHNICAL_DEBT.md`.
The plan: a `frontend-tests` CI job sets both `DATABASE_URL` and `TEST_DATABASE_URL` from a new
`TEST_DATABASE_URL` GitHub Actions secret (pointing at the same `test` branch), so they're equal by
construction and never equal to the production `DATABASE_URL` secret used by `jobs-worker.yml` and
the live app's Vercel deployment.

## Operational note: keeping the test branch's schema current

Because the two branches are independent after the fork, a migration applied to `production` is
**not** automatically applied to `test`. Every `sql/neon/0XX_*.sql` file applied to production going
forward must also be applied to the `test` branch, or the test branch's schema will drift stale
relative to what the code (and tests) expect. This is a manual step today; formalizing it is folded
into H9 (migration tracking/tooling — see `BACKEND_TECHNICAL_DEBT.md`), which should produce a
single script that applies pending migrations to a given target rather than two ad hoc processes.
Until then: **when you apply a migration to production as part of this hardening work, apply the
same file to the `test` branch (`br-weathered-star-atigraez`) in the same change.**

## What this does not solve

- **Staging.** The user's target architecture also names a staging environment reading from its own
  database. No staging environment exists yet (Vercel preview deployments exist per-PR, but nothing
  currently points them at an isolated database rather than production) — out of scope for this
  pass, noted here so it isn't mistaken for solved.
- **Local app development against real data.** Intentionally left as a manual override (see above),
  not a second persistent config, to keep the number of "which database am I pointed at" states low.
