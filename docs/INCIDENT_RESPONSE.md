# Incident Response

Backend Hardening Phase 3, final RC verification. What to actually do when something is wrong in
production, using the tooling this hardening pass built. Assumes you already have — or can get —
`INTERNAL_STATUS_SECRET` and `ALERTS_INTERNAL_SECRET` (Vercel env vars, see `MIGRATION_RUNBOOK.md`
and `BACKEND_TECHNICAL_DEBT.md`'s M10 note for why these exist and where they're consumed).

## 1. First: what actually happened?

**You have a correlationId** (from a user's error message — the generic 500 body includes one —
or from a `x-correlation-id` response header in network logs): go straight to Vercel's dashboard →
this project → Logs (or `vercel logs`) and search for it. Every structured log line for that
request shares it — the completion line and any error line. See
[`OBSERVABILITY_RUNBOOK.md`](OBSERVABILITY_RUNBOOK.md) for the exact field shape.

**You don't have a correlationId** (a vague "orders are failing" report, a metric looks wrong, a
scheduled job seems to have stopped): start from the relevant `/api/internal/*/status` endpoint
below instead — they're aggregate, not per-request, but they'll tell you WHAT is wrong before you
go hunting for WHY in logs.

```
curl -H "x-internal-secret: $INTERNAL_STATUS_SECRET" https://<host>/api/internal/jobs/status
curl -H "x-internal-secret: $INTERNAL_STATUS_SECRET" https://<host>/api/internal/providers/status
curl -H "x-internal-secret: $INTERNAL_STATUS_SECRET" https://<host>/api/internal/webhooks/status
curl -H "x-internal-secret: $INTERNAL_STATUS_SECRET" https://<host>/api/internal/reconciliation/status
curl -H "x-internal-secret: $INTERNAL_STATUS_SECRET" https://<host>/api/internal/events/status
```

All five return 503 (not a silent empty response) if `INTERNAL_STATUS_SECRET` was never set in
this environment — that's a real configuration gap to fix, not evidence the platform itself is
down. See `BACKEND_TECHNICAL_DEBT.md` M10's resolution note.

**Remember the coverage gap**: `withObservability()`'s structured logging only wraps
`app/api/v1/invest/**` (39 routes). Auth, cloud-sync, and alert routes have no structured logging
today — if the report is about login, registration, or watchlist/alert sync rather than an
investment action, there's no correlationId trail to search; you're limited to Vercel's default
request logs and whatever the route's own `catch` block returned.

## 2. Is a provider circuit breaker open?

`providers/status` returns a `summary.withErrors` array — any provider name there has a health
`status: "error"` or a breaker `state` of `"open"`/`"half_open"` right now. Check that first; it
directly explains a burst of `PROVIDER_UNAVAILABLE`-tagged failures (see
`docs/BACKEND_TECHNICAL_DEBT.md` H12's resolution note for what that error code means and which
call sites can produce it).

**What to actually do about an open breaker**: usually nothing — it self-heals. A breaker moves
OPEN → HALF_OPEN automatically once its cooldown elapses (default 30s — see
[`CIRCUIT_BREAKER_FRAMEWORK.md`](CIRCUIT_BREAKER_FRAMEWORK.md)) and admits one trial call; if that
succeeds it closes again. **There is no API to force-reset a breaker today** — `reset()` exists on
the in-process object (`circuitBreaker/core.js`) but nothing calls it from a route. If a breaker
is stuck open far longer than its cooldown should allow, the underlying provider is genuinely still
failing every trial call — the fix is diagnosing the provider (today, always one of the 5 mock
providers — see `providers/status`'s per-provider `lastError` for the actual message), not the
breaker.

**Important caveat, not a bug**: breaker state is in-memory, per Vercel serverless instance. It
does not persist across a cold start and is not shared across concurrent instances. A breaker you
saw as "open" a minute ago may report "closed" now simply because a different, fresh instance
served this request — this is a documented limitation of the current design (see
`CIRCUIT_BREAKER_FRAMEWORK.md`), not something to chase as if it were flapping.

## 3. Is the job platform stuck?

`jobs/status` reports counts by type/status and the registered handler set. Look for:
- A large `queued` count with a suspiciously old oldest-queued timestamp → the worker (`jobs-
  worker.yml`, a 15-minute GitHub Actions cron) isn't running. Check the workflow's own run
  history in GitHub Actions directly — **this is the one real gap left here**: `jobs-worker.yml`
  has no failure alerting of its own and is excluded from `/internal/system-health`'s tracked-
  workflow list (H8, still open — see `BACKEND_TECHNICAL_DEBT.md`). A silent failure here today
  only surfaces via GitHub's own default failure email or by checking this endpoint manually.
- A nonzero `dead_letter` count on `event-dispatch` or notification-delivery jobs → something
  crashed mid-handler repeatedly, or (for notifications specifically) a worker crashed mid-send
  and H3's fix correctly refused to blindly retry an ambiguous partial send (see H3's resolution
  note in `BACKEND_TECHNICAL_DEBT.md`) — these need a human to look at the specific row, not an
  automatic retry.
- Jobs stuck `running` well past their lease: the platform's own lease-reclaim (H2's fix) should
  self-heal this on the next worker tick; if it doesn't clear after two worker cycles (~30 min),
  that's worth escalating as a real bug, not normal operation.

## 4. Webhook / reconciliation health

`webhooks/status` and `reconciliation/status` follow the same aggregate-only shape (counts by
provider/status, most recent run summary per comparator/type — never row-level payloads). A
growing `open` reconciliation-exception count is the signal to actually look at
`/api/internal/reconciliation/items/[id]/resolve` (separately, already role-gated via
`requireRole(["advisor","admin"])` — not part of the M10 shared-secret pattern, checked and
confirmed correctly protected during M10, no changes needed there).

## 5. A migration is stuck (the C1/H6/026-028 situation)

As of this RC pass, **five migrations are written, reviewed, and (mostly) `test`-branch-verified
but not applied to production**, blocked by this session's own tooling denying schema-mutating SQL
against production (and, for one of them, even against `test`) — see
[`MIGRATION_RUNBOOK.md`](MIGRATION_RUNBOOK.md)'s inventory for the exact current state of each.
If you're reading this because one of those is still pending, or a new one has joined it:

1. **Check the ledger first, don't assume**: `DATABASE_URL="..." .venv/bin/python3 -m
   scripts.apply_migrations --status` against the branch in question tells you definitively
   what's actually applied there — never trust a doc's claim over this.
2. **Read the migration file itself before running it** — never reconstruct one from a summary,
   a conversation, or memory. This is the entire lesson `MIGRATION_RUNBOOK.md` exists to encode
   (the 005/006 incident).
3. Apply it by hand: `psql "$DATABASE_URL" -f sql/neon/0NN_thing.sql`, then record it:
   `.venv/bin/python3 -m scripts.apply_migrations --backfill 0NN_thing.sql`.
4. If the file touches a branch that already has a feature branch waiting on it (C1 →
   `hardening/c1-order-idempotency`, H6 → `hardening/h6-account-lifecycle`), merge that branch to
   `main` once the migration is confirmed live — the code on those branches assumes the columns/
   tables already exist and will error immediately if merged first.
5. If a migration fails partway through applying: see `MIGRATION_RUNBOOK.md`'s "Rollback /
   forward-fix strategy" — write a new corrective migration, do not try to hand-edit or re-run the
   failed file, and do not attempt an automated rollback (none exists, none is planned).

## 6. Rate limiting false-positives

A real user reporting "I can't log in" that turns out to be a 429: `rate_limit_buckets` (H4,
`sql/neon/023_rate_limiting.sql`) is fixed-window, keyed on `<action>:<ip-or-email>`. There's no
API to inspect or clear a specific bucket today — the fastest resolution is confirming the window
(`select * from rate_limit_buckets where bucket_key like '%<email-or-ip>%' order by window_start
desc` against whichever branch is live) and, if it's a genuine false positive (shared office IP,
etc.), waiting out the window rather than manually deleting rows — the design is fail-open-on-
error but deliberately not manually-clearable-in-production without a real reason, since that's
exactly the kind of control an attacker would want too.

## What this does not cover

- **No PagerDuty/Slack alerting is wired to any of this** — every check above is pull (you go
  look), not push (it pages you). H8 (job-worker failure alerting) is the one concretely-scoped
  piece of this gap; the rest (provider degradation, reconciliation exception growth, rate-limit
  bucket saturation) has no alerting design yet at all.
- **No runbook yet for a genuine data-integrity incident** (e.g., a reconciliation exception that
  turns out to be a real, not cosmetic, holdings mismatch) — this doc covers *detecting* that via
  `reconciliation/status`, not resolving it once found; that's necessarily case-by-case.
- **No on-call rotation or escalation policy** — organizational, not technical, out of scope for
  this doc.
