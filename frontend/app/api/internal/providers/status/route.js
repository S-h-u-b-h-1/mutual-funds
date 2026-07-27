// GET /api/internal/providers/status — Provider Registry observability (Phase 4.5 step 4). No
// database dependency (the registry is in-memory, populated by side-effect imports below) —
// unlike every other /api/internal/* status route, there's no hasDatabaseUrl gate here. Reports
// per-provider version/mode/capabilities/health/config plus a platform-wide summary; never
// secrets — getProviderConfig()'s shape is operational tuning (timeouts, thresholds), not
// credentials. `health` DOES include each circuit breaker's lastError text (see
// circuitBreaker/core.js's getMetrics()) — kept, not stripped, since it's genuinely the
// diagnostic an operator needs to know WHY a provider is degraded; the auth gate below is what
// makes that acceptable to expose (an unauthenticated caller gets nothing, not a trimmed version).
// M10 (Backend Hardening Phase 3): gated behind checkInternalSecret — this is operator/ops
// tooling with no per-request end user, previously reachable by anyone who found the URL.
import { NextResponse } from "next/server";
import { getAllProviderStatuses, getPlatformProviderSummary } from "../../../../lib/platform/providerRegistry/core.js";
import { checkInternalSecret } from "../../../../lib/internalAuth.js";
import { logError } from "../../../../lib/platform/observability/core.js";
import "../../../../lib/invest/providers/index.js"; // side-effect: registers the 5 invest providers

export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = checkInternalSecret(request, "INTERNAL_STATUS_SECRET");
  if (denied) return denied;

  try {
    const providers = getAllProviderStatuses();
    const summary = getPlatformProviderSummary();
    return NextResponse.json({ summary, providers, generatedAt: new Date().toISOString() });
  } catch (err) {
    logError({ event: "internal_status_query_failed", route: "providers/status", errorMessage: err?.message ?? String(err) });
    return NextResponse.json({ error: "Provider registry query failed." }, { status: 500 });
  }
}
