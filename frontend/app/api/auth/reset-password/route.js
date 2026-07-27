import crypto from "crypto";
import bcrypt from "bcryptjs";
import { hasDatabaseUrl, query } from "../../../lib/db";
import { checkRateLimit, rateLimitResponse, getClientIp } from "../../../lib/platform/rateLimit/core";

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// The token itself is 256 bits of randomness — brute-forcing it directly is computationally
// infeasible regardless of any rate limit. This is defense-in-depth against sheer request-volume
// abuse of a public, unauthenticated endpoint, not a brute-force mitigation. See H4.
const IP_LIMIT = { limit: 10, windowSeconds: 60 * 60 };

export async function POST(request) {
  if (!hasDatabaseUrl) {
    return Response.json({ error: "Password reset unavailable" }, { status: 503 });
  }

  const ip = getClientIp(request);
  const ipCheck = await checkRateLimit("reset-password-ip", ip, IP_LIMIT);
  if (!ipCheck.allowed) return rateLimitResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !token) {
    return Response.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }
  if (password.length < 8 || password.length > 200) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const consumed = await query(
    `delete from verification_tokens
     where identifier = $1 and token = $2 and purpose = 'password_reset' and expires > now()
     returning identifier`,
    [email, hashToken(token)]
  );
  if (!consumed.rows[0]) {
    return Response.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await query(
    `update users set password_hash = $2, updated_at = now() where email = $1 returning id`,
    [email, passwordHash]
  );
  const user = updated.rows[0];
  if (!user) {
    return Response.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  // Revokes every "database" strategy session outright (deleted row => next lookup fails).
  // Does NOT revoke "jwt" strategy sessions — those stay valid until natural expiry, since
  // verifying a JWT never touches this table. That fallback only activates when zero non-
  // Credentials providers are configured (see auth.js), which real deployments won't hit once
  // any OAuth/magic-link provider is live; tracked as a known gap for the security review (#86)
  // rather than a solved problem here.
  await query(`delete from sessions where user_id = $1`, [user.id]);
  await query(`insert into audit_log (user_id, action) values ($1, 'password_reset')`, [user.id]);

  return Response.json({ message: "Password updated" });
}
