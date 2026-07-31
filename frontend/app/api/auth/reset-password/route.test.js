// Auth+onboarding truth audit, Phase 1: no test file existed for this route before this one
// (confirmed by direct search). Focused on the ONE new behavior added this pass — the
// security_stamp bump that makes password reset actually revoke jwt-strategy sessions, not the
// full route (token expiry/single-use/rate-limit are the pre-existing, already-working surface;
// this file's job is proving the new fix, not re-verifying everything around it).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../../../lib/db.js";
import { POST } from "./route.js";

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function createUser(label) {
  const email = `reset-test-${label}-${crypto.randomBytes(4).toString("hex")}@mfpulse.test`;
  const r = await query(`insert into users (name, email) values ($1, $2) returning id, email, security_stamp`, [`Reset Test ${label}`, email]);
  return r.rows[0];
}

async function deleteUser(id) {
  await query(`delete from users where id = $1`, [id]);
}

describe("POST /api/auth/reset-password (integration, real Neon, disposable test user)", () => {
  let user;

  beforeAll(async () => {
    user = await createUser("stamp");
  });

  afterAll(async () => {
    await deleteUser(user.id);
  });

  it("bumps security_stamp on a successful reset, so every previously-issued jwt-strategy session is invalidated", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    await query(
      `insert into verification_tokens (identifier, token, purpose, expires) values ($1, $2, 'password_reset', now() + interval '1 hour')`,
      [user.email, hashToken(rawToken)]
    );

    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ email: user.email, token: rawToken, password: "a-new-strong-password" }),
    }));
    expect(res.status).toBe(200);

    const after = await query(`select security_stamp from users where id = $1`, [user.id]);
    expect(after.rows[0].security_stamp).not.toBe(user.security_stamp);
  });

  it("rejects an invalid token without touching security_stamp", async () => {
    const before = await query(`select security_stamp from users where id = $1`, [user.id]);

    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ email: user.email, token: "not-a-real-token", password: "another-strong-password" }),
    }));
    expect(res.status).toBe(400);

    const after = await query(`select security_stamp from users where id = $1`, [user.id]);
    expect(after.rows[0].security_stamp).toBe(before.rows[0].security_stamp);
  });
});
