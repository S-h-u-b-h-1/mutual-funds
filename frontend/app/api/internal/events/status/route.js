// GET /api/internal/events/status — event bus observability (Phase 4 M4). Same aggregate-only
// posture as every other /api/internal/* status endpoint: counts by type over 24h/7d, the
// documented event catalog, and registered internal listeners — never payloads (payloads can
// contain user ids/scheme codes; those stay in domain_events itself).
// M10 (Backend Hardening Phase 3): gated behind checkInternalSecret — this is operator/ops
// tooling with no per-request end user, previously reachable by anyone who found the URL.
import { NextResponse } from "next/server";
import { getEventMetrics } from "../../../../lib/platform/events/core.js";
import { hasDatabaseUrl } from "../../../../lib/db.js";
import { checkInternalSecret } from "../../../../lib/internalAuth.js";
import { logError } from "../../../../lib/platform/observability/core.js";
import "../../../../lib/platform/jobs/handlers/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = checkInternalSecret(request, "INTERNAL_STATUS_SECRET");
  if (denied) return denied;

  if (!hasDatabaseUrl) {
    return NextResponse.json({ error: "Event bus unavailable: DATABASE_URL is not configured." }, { status: 503 });
  }
  try {
    const metrics = await getEventMetrics();
    return NextResponse.json({ ...metrics, generatedAt: new Date().toISOString() });
  } catch (err) {
    // Never echo err.message to the response — a raw DB/driver error can leak schema/connection
    // detail. Full detail still goes server-side via C3's observability core.
    logError({ event: "internal_status_query_failed", route: "events/status", errorMessage: err?.message ?? String(err) });
    return NextResponse.json({ error: "Event metrics query failed." }, { status: 500 });
  }
}
