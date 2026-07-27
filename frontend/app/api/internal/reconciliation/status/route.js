// GET /api/internal/reconciliation/status — reconciliation observability (Phase 4 M3). Same
// aggregate-only posture as the other /api/internal/* status endpoints: open exception counts
// by type/status and each type's most recent run summary — never row-level record contents
// (those live behind the resolve endpoint / a future admin UI with real access control).
// M10 (Backend Hardening Phase 3): gated behind checkInternalSecret — this is operator/ops
// tooling with no per-request end user, previously reachable by anyone who found the URL.
import { NextResponse } from "next/server";
import { getReconciliationMetrics } from "../../../../lib/platform/reconciliation/core.js";
import { registeredComparators } from "../../../../lib/platform/reconciliation/registry.js";
import { hasDatabaseUrl } from "../../../../lib/db.js";
import { checkInternalSecret } from "../../../../lib/internalAuth.js";
import { logError } from "../../../../lib/platform/observability/core.js";
import "../../../../lib/platform/jobs/handlers/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = checkInternalSecret(request, "INTERNAL_STATUS_SECRET");
  if (denied) return denied;

  if (!hasDatabaseUrl) {
    return NextResponse.json({ error: "Reconciliation platform unavailable: DATABASE_URL is not configured." }, { status: 503 });
  }
  try {
    const metrics = await getReconciliationMetrics();
    return NextResponse.json({
      ...metrics,
      registeredComparators: registeredComparators(),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logError({ event: "internal_status_query_failed", route: "reconciliation/status", errorMessage: err?.message ?? String(err) });
    return NextResponse.json({ error: "Reconciliation metrics query failed." }, { status: 500 });
  }
}
