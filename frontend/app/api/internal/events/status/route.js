// GET /api/internal/events/status — event bus observability (Phase 4 M4). Same aggregate-only
// posture as every other /api/internal/* status endpoint: counts by type over 24h/7d, the
// documented event catalog, and registered internal listeners — never payloads (payloads can
// contain user ids/scheme codes; those stay in domain_events itself).
import { NextResponse } from "next/server";
import { getEventMetrics } from "../../../../lib/platform/events/core.js";
import { hasDatabaseUrl } from "../../../../lib/db.js";
import "../../../../lib/platform/jobs/handlers/index.js";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseUrl) {
    return NextResponse.json({ error: "Event bus unavailable: DATABASE_URL is not configured." }, { status: 503 });
  }
  try {
    const metrics = await getEventMetrics();
    return NextResponse.json({ ...metrics, generatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: `Event metrics query failed: ${err.message}` }, { status: 500 });
  }
}
