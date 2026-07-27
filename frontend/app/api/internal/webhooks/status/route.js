// GET /api/internal/webhooks/status — webhook observability (Phase 4 M2). Same aggregate-only
// posture as /api/internal/jobs/status: counts by provider/status, registered providers,
// never payloads or URLs' secrets.
// M10 (Backend Hardening Phase 3): gated behind checkInternalSecret — this is operator/ops
// tooling with no per-request end user, previously reachable by anyone who found the URL.
import { NextResponse } from "next/server";
import { getWebhookMetrics } from "../../../../lib/platform/webhooks/core.js";
import { registeredWebhookProviders } from "../../../../lib/platform/webhooks/registry.js";
import { hasDatabaseUrl } from "../../../../lib/db.js";
import { checkInternalSecret } from "../../../../lib/internalAuth.js";
import { logError } from "../../../../lib/platform/observability/core.js";
import "../../../../lib/platform/jobs/handlers/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const denied = checkInternalSecret(request, "INTERNAL_STATUS_SECRET");
  if (denied) return denied;

  if (!hasDatabaseUrl) {
    return NextResponse.json({ error: "Webhook platform unavailable: DATABASE_URL is not configured." }, { status: 503 });
  }
  try {
    const metrics = await getWebhookMetrics();
    return NextResponse.json({
      ...metrics,
      registeredProviders: registeredWebhookProviders(),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logError({ event: "internal_status_query_failed", route: "webhooks/status", errorMessage: err?.message ?? String(err) });
    return NextResponse.json({ error: "Webhook metrics query failed." }, { status: 500 });
  }
}
