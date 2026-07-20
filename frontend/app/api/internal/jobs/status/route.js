// GET /api/internal/jobs/status — queue observability endpoint (Phase 4 M1).
// Same posture as the /internal/* canary pages: public, aggregate-only. It exposes counts,
// schedule state, and the registered handler set — never job payloads, results, or errors
// beyond dead-letter counts (payloads can contain user ids; those stay in the DB).
import { NextResponse } from "next/server";
import { getJobMetrics } from "../../../../lib/platform/jobs/core.js";
import { registeredTypes } from "../../../../lib/platform/jobs/handlers/index.js";
import { hasDatabaseUrl } from "../../../../lib/db.js";

export const dynamic = "force-dynamic";

export async function GET() {
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
    return NextResponse.json({ error: `Job metrics query failed: ${err.message}` }, { status: 500 });
  }
}
