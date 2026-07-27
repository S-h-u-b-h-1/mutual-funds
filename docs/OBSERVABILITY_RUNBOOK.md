# Observability Runbook

What server-side observability exists for the Invest platform (C3, Backend Hardening Phase 3),
how to use it when debugging a live incident, and what it deliberately does not cover yet.

## Before this (the actual starting state)

Zero. No server-side logging, no error tracking, anywhere in the invest API/service request path.
A failed order — a thrown exception, a provider timeout, a bug — left no trace anywhere: not in
application logs (none existed), not in Sentry (configured for the browser only, and inert even
there since no project has ever set `NEXT_PUBLIC_SENTRY_DSN`). The only way to learn an order
failed was a user reporting it, or noticing its row stuck in a non-terminal `status`.

## What exists now

### Structured request logs (works today, zero external dependencies)

Every route under `app/api/v1/invest/**/route.js` is wrapped in
`app/lib/platform/observability/core.js`'s `withObservability()`. Each request produces one
JSON line on stdout (success) or stderr (error), which Vercel captures and indexes automatically
for every function invocation — no setup, no account, no API key. This is the primary mechanism,
not a placeholder for "real" observability: it is real, and it works in production today.

Fields on every request-completion line:
```json
{"ts":"2026-07-27T04:29:08.377Z","level":"info","correlationId":"819b2061-...","userId":null,
 "event":"request_completed","route":"GET /api/v1/invest/orders","method":"GET","status":401,
 "durationMs":1}
```
`correlationId` is read from an incoming `x-correlation-id` request header if the caller sent one
(so an upstream service or a client-side trace can tie its own logs to this request), otherwise
generated fresh per request, and echoed back on the response's `x-correlation-id` header either
way. `userId` is populated once `requireUser()` (called by every protected route already) resolves
a session — see "How correlationId/userId actually propagate" below.

### Unhandled-exception safety net

`withObservability()` only ever engages its `catch` block for an exception the route's OWN
try/catch didn't already handle — every route that already catches its own errors and returns a
controlled 4xx (the existing, correct pattern throughout this codebase) is completely unaffected.
A genuinely unhandled throw now: (1) logs a structured `unhandled_exception` line to stderr with
the error's class, message, route, method, and duration — never a raw stack trace to the client;
(2) forwards to Sentry if configured (see below); (3) returns a generic
`{"error": "Internal server error", "correlationId": "..."}` with HTTP 500, so a caller never sees
an implementation detail, but can hand the correlationId to support/engineering to find the real
error server-side.

### How correlationId/userId actually propagate

`node:async_hooks`' `AsyncLocalStorage` holds `{correlationId, userId}` for the lifetime of a
request — set once in `withObservability()`, enriched once `requireUser()` (`app/lib/apiAuth.js`)
resolves a session. Any code anywhere in the invest call graph — a route, a service, a deeply
nested helper — can call `getRequestContext()` / `logInfo()` / `logError()` from
`observability/core.js` and get a log line automatically stamped with both, with zero additional
plumbing through function signatures. This is why only two files needed to change to get
`userId` onto every log line: `observability/core.js` (new) and `apiAuth.js` (one line).

### What this does NOT log — the allowlist rule

`logInfo`/`logError`/`captureException` log exactly the fields a call site chooses to pass — an
**allowlist**, not a blocklist trying to strip sensitive keys back out of an arbitrary object
after the fact (far easier to get wrong). Every call site in this codebase today passes a small,
explicit set: route, method, status, duration, correlationId, userId, error class, error message.
**Never pass**: PAN, OTP, passwords, access/refresh tokens, complete bank account numbers, or raw
KYC payloads. If a future call site needs to log a provider reference or job/webhook ID, add it
explicitly to that call's fields — do not pass a whole request/response body through "for
convenience."

### Sentry — configured for inertness, not activated

`@sentry/browser` (client-only) is the only Sentry package installed, and no `NEXT_PUBLIC_SENTRY_DSN`
or `SENTRY_DSN` is set anywhere (not `.env.local`, not CI, not Vercel) — so even the existing
client-side integration (`app/components/SentryInit.jsx`) is dormant today. `captureException()`
in `observability/core.js` dynamically imports `@sentry/nextjs` (marked `webpackIgnore` so the
build doesn't fail on a package that isn't installed) and forwards the exception to it **only if**
`SENTRY_DSN` is set — otherwise it's a no-op and the structured stderr log is the only record,
which is still a complete one.

**To actually activate Sentry** (not done here — needs an account/DSN this session doesn't have,
the same class of blocker as the `TEST_DATABASE_URL` secret and the C1 production migration):
1. Create a Sentry project (or use an existing org's), get a DSN.
2. `npm install @sentry/nextjs` in `frontend/`.
3. Set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser, already read by `SentryInit.jsx`)
   as environment variables in Vercel and (if C4's CI test job should also report) GitHub Actions.
4. Nothing else changes — `captureException()` already calls `Sentry.init()` lazily on first use.

## Debugging a live incident

1. Get the `correlationId` — from the user's error message (the generic 500 body includes it), or
   from the response header if you have network logs.
2. In Vercel's dashboard → this project → Logs (or `vercel logs`), search for that correlationId.
   Every line for that request — the completion line, and any error line — shares it.
3. If the error was a genuinely unhandled exception, the `unhandled_exception` line has
   `errorClass`/`errorMessage` and the route it happened in. Cross-reference with
   `docs/BACKEND_TECHNICAL_DEBT.md`/`BACKEND_AUDIT_REPORT.md` if it looks like a known gap.

## What this does not solve

- **Scope is the invest API surface only** (`app/api/v1/invest/**`, 39 route files, matching C3's
  own scoping in `BACKEND_TECHNICAL_DEBT.md`) — the other ~37 routes (auth, cloud-sync, alerts,
  internal status endpoints) are NOT wrapped. Extend the same `withObservability()` pattern to
  them in a future pass if they need the same coverage; nothing about the mechanism is
  invest-specific.
- **No metrics/dashboards** — this is logs only. Aggregating error rates, latency percentiles, or
  building an actual dashboard on top of these structured lines is a real next step, not done here.
- **No log retention/alerting policy** — Vercel's own log retention window applies; no alerting
  (PagerDuty, Slack, etc.) is wired to any of this yet.
- **Sentry is wired but inert** — see above. Do not describe error tracking as "live" until a real
  DSN is actually configured somewhere.
