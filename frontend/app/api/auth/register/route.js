import bcrypt from "bcryptjs";
import { hasDatabaseUrl, query } from "../../../lib/db";
import { checkRateLimit, rateLimitResponse, getClientIp } from "../../../lib/platform/rateLimit/core";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mass account creation is rare for legitimate use — this is generous enough for shared-IP
// scenarios (corporate NAT, university networks) but blocks bot/script abuse. See H4,
// docs/BACKEND_TECHNICAL_DEBT.md.
const IP_LIMIT = { limit: 5, windowSeconds: 60 * 60 };

export async function POST(request) {
  if (!hasDatabaseUrl) {
    return Response.json({ error: "Registration unavailable" }, { status: 503 });
  }

  const ip = getClientIp(request);
  const ipCheck = await checkRateLimit("register-ip", ip, IP_LIMIT);
  if (!ipCheck.allowed) return rateLimitResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 8 || password.length > 200) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await query(`select id from users where email = $1`, [email]);
  if (existing.rows[0]) {
    return Response.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const r = await query(
    `insert into users (name, email, password_hash) values ($1, $2, $3) returning id, name, email`,
    [name, email, passwordHash]
  );
  const user = r.rows[0];

  await query(
    `insert into audit_log (user_id, action, metadata) values ($1, 'sign_up', $2)`,
    [user.id, JSON.stringify({ method: "credentials" })]
  );

  return Response.json({ id: user.id, name: user.name, email: user.email }, { status: 201 });
}
