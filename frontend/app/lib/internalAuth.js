// Shared-secret gate for internal/operator-only endpoints that have no per-request end user to
// authenticate (a status dashboard, a scheduled job trigger) — requireUser() doesn't fit those,
// since there's no investor session behind the call. Extracted from the pattern
// api/v1/internal/alerts/run/route.js established first (M10, Backend Hardening Phase 3): a
// caller-supplied x-internal-secret header, checked with a timing-safe comparison against an env
// var, 503 if that env var isn't configured at all (rather than silently treating "no secret set"
// as "no secret required"), 401 on any mismatch.
import crypto from "crypto";

function safeSecretMatch(provided, real) {
  const a = Buffer.from(provided || "");
  const b = Buffer.from(real);
  // timingSafeEqual throws on mismatched lengths rather than returning false — length itself
  // isn't sensitive (unlike content), so this early return is not a reintroduced timing leak.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Checks `request` against the secret named by `envVarName` (a distinct env var per capability —
 * e.g. status dashboards and alert evaluation use different secrets — so one leaked/rotated
 * secret doesn't affect unrelated capabilities).
 *
 * Returns a Response to return immediately if the request is NOT authorized, or null if it is —
 * callers do `const denied = checkInternalSecret(request, "X"); if (denied) return denied;`.
 */
export function checkInternalSecret(request, envVarName) {
  const secret = process.env[envVarName];
  if (!secret) {
    return Response.json({ error: "This endpoint is not configured." }, { status: 503 });
  }
  if (!safeSecretMatch(request.headers.get("x-internal-secret"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
