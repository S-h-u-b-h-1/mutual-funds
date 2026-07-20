// POST /api/webhooks/[provider] — the single generic incoming-webhook endpoint (Phase 4 M2).
// All providers share this route; per-provider behavior lives in the webhook registry +
// webhook_endpoints config. The body is read RAW before any parsing — signatures are computed
// over exact bytes.
import { NextResponse } from "next/server";
import { receiveWebhook } from "../../../lib/platform/webhooks/core.js";
// Load the production provider registrations (module side effects) so a webhook arriving
// before any worker tick still finds its provider config at the edge.
import "../../../lib/platform/jobs/handlers/index.js";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { provider } = await params;
  const rawBody = await request.text();
  const headers = Object.fromEntries([...request.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));

  const result = await receiveWebhook(provider, { rawBody, headers });

  switch (result.status) {
    case "received":
      return NextResponse.json({ received: true, deliveryId: result.deliveryId });
    case "duplicate":
      // 200, not an error: the provider already delivered this event once and should stop
      // retrying — that is the entire point of acking duplicates
      return NextResponse.json({ received: true, duplicate: true });
    case "unknown_provider":
      return NextResponse.json({ error: `Unknown webhook provider '${provider}'.` }, { status: 404 });
    case "disabled":
      return NextResponse.json({ error: "Webhook endpoint is disabled." }, { status: 503 });
    case "unconfigured":
      return NextResponse.json({ error: "Webhook endpoint has no registered handler." }, { status: 503 });
    case "malformed":
      return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
    case "rejected":
    default:
      return NextResponse.json({ error: `Webhook rejected: ${result.reason}` }, { status: 401 });
  }
}
