// Server-side observability (Backend Hardening Phase 3, C3). Backs
// docs/OBSERVABILITY_RUNBOOK.md. Before this, the invest API surface had zero server-side
// logging or error tracking — a failed order left no trace anywhere. This is deliberately NOT
// a dependency on any external service: withObservability() below writes one structured JSON
// line per request to stdout/stderr, which Vercel captures and indexes automatically for every
// function invocation with no setup — that alone is the primary deliverable and works today.
// Sentry (captureException below) is a genuine bonus on top, not the mechanism this relies on:
// it no-ops unless SENTRY_DSN is set, and nothing in this codebase sets it yet (see the runbook's
// "Sentry" section for exactly what activating it would require and why it isn't done here).
//
// NEVER pass PAN, OTP, passwords, access/refresh tokens, complete bank account numbers, or raw
// KYC payloads into logInfo/logError/captureException's `fields`/`extra` — these functions log
// whatever object they're given verbatim, by design (an allowlist of what callers choose to pass,
// not a blocklist trying to strip sensitive keys back out of an arbitrary object after the fact,
// which is far easier to get wrong). Every call site in this codebase passes small, explicit
// field sets (route, method, status, ids, error class) — keep it that way.
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

const als = new AsyncLocalStorage();

// Ambient per-request context (correlation ID, and userId once requireUser() resolves one — see
// apiAuth.js) so deeply-nested service code can log with full context without threading a
// context object through every function signature in the invest call graph.
export function getRequestContext() {
  return als.getStore() ?? {};
}

export function setRequestUserId(userId) {
  const store = als.getStore();
  if (store) store.userId = userId;
}

function emit(level, fields) {
  const ctx = getRequestContext();
  const entry = {
    ts: new Date().toISOString(),
    level,
    correlationId: ctx.correlationId ?? null,
    userId: ctx.userId ?? null,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
}

export function logInfo(fields) {
  emit("info", fields);
}

export function logError(fields) {
  emit("error", fields);
}

let sentryPromise = null;
async function getSentry() {
  if (!process.env.SENTRY_DSN) return null;
  if (!sentryPromise) {
    // webpackIgnore: @sentry/nextjs is not an installed dependency yet (see the runbook's Sentry
    // section) — without this comment, webpack tries to statically resolve and bundle this import
    // at BUILD time regardless of the runtime SENTRY_DSN guard above, and fails the whole build.
    // The comment defers entirely to Node's runtime resolution, which only ever actually runs
    // once SENTRY_DSN is set — i.e., never, in any environment today.
    sentryPromise = import(/* webpackIgnore: true */ "@sentry/nextjs")
      .then((S) => {
        S.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
        return S;
      })
      .catch(() => null);
  }
  return sentryPromise;
}

// The one place an uncaught exception in an invest route or service should go through — logs it
// server-side (always) and forwards to Sentry (only if configured). `extra` follows the same
// allowlist-only rule as logInfo/logError above.
export async function captureException(err, extra = {}) {
  logError({
    event: "unhandled_exception",
    errorClass: err?.name ?? "Error",
    errorMessage: err?.message ?? String(err),
    ...extra,
  });
  const Sentry = await getSentry();
  Sentry?.captureException(err, { extra });
}

// Wraps a Next.js Route Handler export (GET/POST/etc.) so every request gets: a correlation ID
// (reused from an incoming x-correlation-id header if the caller sent one, so a client or an
// upstream service can tie its own logs to this request), a structured start/end log line with
// route/method/status/duration, and — critically — a server-side-observable, generic-response
// safety net for any exception the handler's OWN try/catch didn't already handle. Routes that
// already catch their own errors and return a controlled 400 (the existing, correct pattern
// throughout this codebase) are completely unaffected: this only ever engages for a TRULY
// unhandled throw, which today means silence — no log, no trace, nothing — and would otherwise
// surface to the caller as an opaque platform-level 500 with zero server-side record of why.
export function withObservability(routeName, handler) {
  return async function observedRouteHandler(request, ctx) {
    const correlationId = request.headers?.get?.("x-correlation-id") || crypto.randomUUID();
    const start = Date.now();
    return als.run({ correlationId }, async () => {
      try {
        const response = await handler(request, ctx);
        logInfo({
          event: "request_completed",
          route: routeName,
          method: request.method,
          status: response?.status ?? 200,
          durationMs: Date.now() - start,
        });
        response?.headers?.set?.("x-correlation-id", correlationId);
        return response;
      } catch (err) {
        await captureException(err, { route: routeName, method: request.method, durationMs: Date.now() - start });
        return Response.json(
          { error: "Internal server error", correlationId },
          { status: 500, headers: { "x-correlation-id": correlationId } }
        );
      }
    });
  };
}
