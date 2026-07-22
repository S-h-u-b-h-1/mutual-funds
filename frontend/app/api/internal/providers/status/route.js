// GET /api/internal/providers/status — Provider Registry observability (Phase 4.5 step 4). No
// database dependency (the registry is in-memory, populated by side-effect imports below) —
// unlike every other /api/internal/* status route, there's no hasDatabaseUrl gate here. Reports
// per-provider version/mode/capabilities/health/config plus a platform-wide summary; never
// secrets — getProviderConfig()'s shape is operational tuning (timeouts, thresholds), not
// credentials.
import { NextResponse } from "next/server";
import { getAllProviderStatuses, getPlatformProviderSummary } from "../../../../lib/platform/providerRegistry/core.js";
import "../../../../lib/invest/providers/index.js"; // side-effect: registers the 5 invest providers

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const providers = getAllProviderStatuses();
    const summary = getPlatformProviderSummary();
    return NextResponse.json({ summary, providers, generatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: `Provider registry query failed: ${err.message}` }, { status: 500 });
  }
}
