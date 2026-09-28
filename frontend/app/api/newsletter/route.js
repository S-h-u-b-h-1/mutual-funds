import { createHash } from "node:crypto";
import { withTransaction } from "../../lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../../lib/platform/rateLimit/core";
import { logInfo } from "../../lib/platform/observability/core";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "A valid email is required" }, { status: 400 });
  const digest = createHash("sha256").update(email).digest("hex");
  const limits = await Promise.all([
    checkRateLimit("newsletter-ip", getClientIp(request), { limit: 5, windowSeconds: 3600 }),
    checkRateLimit("newsletter-email", digest, { limit: 3, windowSeconds: 86400 }),
  ]);
  if (limits.some(result => !result.allowed)) return rateLimitResponse();
  try {
    await withTransaction(async client => {
      await client.query("insert into newsletter_subscriptions (email) values ($1) on conflict (email) do nothing", [email]);
    });
    logInfo({ event: "newsletter_interest_received", status: "pending", deliveryActive: false });
    return Response.json({ status: "received", message: "Your request was received. Email delivery is not active yet." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Subscriptions are temporarily unavailable." }, { status: 503 });
  }
}
