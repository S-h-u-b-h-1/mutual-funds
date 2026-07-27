// Server-side rate limiting for authentication endpoints (Backend Hardening Phase 3, H4).
// Backs sql/neon/023_rate_limiting.sql. Before this: login, register, forgot-password, and
// reset-password had zero rate limiting anywhere — exploitable with a plain unauthenticated
// script for credential stuffing, reset-email bombing, or account enumeration by request volume.
import { query } from "../../db.js";
import { logInfo, logError } from "../observability/core.js";

// Fixed-window counting, not sliding-window: simpler, and the imprecision at window boundaries
// (a client could get up to ~2x the nominal rate for one brief moment spanning two windows) is an
// accepted, well-understood tradeoff for this threat model — stopping SUSTAINED credential
// stuffing/enumeration/email-bombing, not shaving the last few percent off a single burst.
function windowStart(windowSeconds) {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms);
}

// Backed by Postgres, not an in-process counter: this app runs on Vercel's serverless platform,
// where each invocation can land on a different, memory-isolated instance — an in-memory limiter
// resets per-instance and is trivially bypassed by nothing more than the load balancing that
// already happens. The UPSERT is atomic under concurrent requests (Postgres's own row-level
// locking on the conflicting row), so two simultaneous requests against the same bucket can't
// both undercount each other.
//
// Fails OPEN (allowed: true) on a query error, after logging it: a rate limiter that becomes a
// new way to 500 legitimate auth traffic is a worse outcome than occasionally under-enforcing a
// limit because Postgres had a transient blip.
export async function checkRateLimit(action, identifier, { limit, windowSeconds }) {
  const bucketKey = `${action}:${identifier}`;
  const start = windowStart(windowSeconds);
  try {
    const r = await query(
      `insert into rate_limit_buckets (bucket_key, window_start, count)
       values ($1, $2, 1)
       on conflict (bucket_key, window_start) do update set count = rate_limit_buckets.count + 1
       returning count`,
      [bucketKey, start]
    );
    const count = r.rows[0].count;
    const allowed = count <= limit;
    if (!allowed) logInfo({ event: "rate_limit_exceeded", action, count, limit });
    return { allowed, count, limit };
  } catch (err) {
    logError({ event: "rate_limit_check_failed", action, errorMessage: err?.message ?? String(err) });
    return { allowed: true, count: 0, limit };
  }
}

export function rateLimitResponse() {
  return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
}

// Vercel sets x-forwarded-for reliably on every request; the first entry is the actual client,
// the rest are proxy hops this app doesn't control. Never returns null/undefined — an
// unidentifiable caller still needs a well-formed bucket key, though in practice this header is
// always present on Vercel.
export function getClientIp(request) {
  const xff = request.headers?.get?.("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}
