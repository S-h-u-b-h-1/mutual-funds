// GET /api/internal/jobs/status — queue observability endpoint (Phase 4 M1). Aggregate-only:
// counts, schedule state, and the registered handler set — never job payloads, results, or
// errors beyond dead-letter counts (payloads can contain user ids; those stay in the DB).
// M10 (Backend Hardening Phase 3): gated behind checkInternalSecret — this is operator/ops
// tooling with no per-request end user, previously reachable by anyone who found the URL.
import { NextResponse } from "next/server";
import { getJobMetrics } from "../../../../lib/platform/jobs/core.js";
import { registeredTypes } from "../../../../lib/platform/jobs/handlers/index.js";
import { hasDatabaseUrl } from "../../../../lib/db.js";
import { checkInternalSecret } from "../../../../lib/internalAuth.js";
import { logError } from "../../../../lib/platform/observability/core.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = checkInternalSecret(request, "INTERNAL_STATUS_SECRET");
  if (denied) return denied;

  if (!hasDatabaseUrl) {
    return NextResponse.json({ error: "Job platform unavailable: DATABASE_URL is not configured." }, { status: 503 });
  }
  try {
    const metrics = await getJobMetrics();
    return NextResponse.json({
      ...metrics,
      registeredHandlers: registeredTypes(),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logError({ event: "internal_status_query_failed", route: "jobs/status", errorMessage: err?.message ?? String(err) });
    return NextResponse.json({ error: "Job metrics query failed." }, { status: 500 });
  }
}
