// GET /api/internal/webhooks/status — webhook observability (Phase 4 M2). Same aggregate-only
// posture as /api/internal/jobs/status: counts by provider/status, registered providers,
// never payloads or URLs' secrets.
import { NextResponse } from "next/server";
import { getWebhookMetrics } from "../../../../lib/platform/webhooks/core.js";
import { registeredWebhookProviders } from "../../../../lib/platform/webhooks/registry.js";
import { hasDatabaseUrl } from "../../../../lib/db.js";
import "../../../../lib/platform/jobs/handlers/index.js";

export const dynamic = "force-dynamic";

export async function GET() {
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
    return NextResponse.json({ error: `Webhook metrics query failed: ${err.message}` }, { status: 500 });
  }
}
