// Auth+onboarding truth audit, Phase 1: no test file existed for anything auth-related before
// this one (confirmed by direct search) — real gap for the session-revocation mechanism
// specifically, since it's the one thing standing between "password reset looks like it revoked
// sessions" and "password reset actually revoked sessions" under the jwt-strategy fallback (see
// jwtSecurityStampCallback's own header comment for the full "why", including why this logic
// lives in its own file rather than auth.js — auth.js itself can't be imported under Vitest's
// plain Node environment at all, since next-auth transitively imports "next/server", which only
// resolves inside Next.js's own build pipeline).
//
// Tests jwtSecurityStampCallback directly against real Neon rather than driving Auth.js's full
// HTTP sign-in flow — that flow is exercised by the app already (login/register work); what has
// never been exercised is this specific callback's two branches (stash-on-sign-in,
// verify-on-every-later-request), which is exactly what a security-revocation bug would hide in.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "./db.js";
import { jwtSecurityStampCallback } from "./authSecurityStamp.js";

async function createUser(label) {
  const email = `auth-test-${label}-${crypto.randomBytes(4).toString("hex")}@mfpulse.test`;
  const r = await query(`insert into users (name, email) values ($1, $2) returning id, security_stamp`, [`Auth Test ${label}`, email]);
  return r.rows[0];
}

async function deleteUser(id) {
  await query(`delete from users where id = $1`, [id]);
}

describe("jwtSecurityStampCallback (integration, real Neon, disposable test user)", () => {
  let user;

  beforeAll(async () => {
    user = await createUser("stamp");
  });

  afterAll(async () => {
    await deleteUser(user.id);
  });

  it("stashes the user's securityStamp into the token on initial sign-in (user present)", async () => {
    const token = await jwtSecurityStampCallback({ token: {}, user: { id: user.id, securityStamp: user.security_stamp } });
    expect(token.securityStamp).toBe(user.security_stamp);
  });

  it("accepts a token whose stashed stamp still matches the live DB value", async () => {
    const token = await jwtSecurityStampCallback({ token: { sub: user.id, securityStamp: user.security_stamp } });
    expect(token).not.toBeNull();
    expect(token.securityStamp).toBe(user.security_stamp);
  });

  it("rejects (returns null) a token whose stashed stamp no longer matches — this IS the revocation", async () => {
    // Simulates exactly what reset-password/route.js now does: bump the stamp, which must
    // invalidate every token issued before the bump on its very next use.
    const staleToken = { sub: user.id, securityStamp: user.security_stamp };
    await query(`update users set security_stamp = gen_random_uuid() where id = $1`, [user.id]);

    const result = await jwtSecurityStampCallback({ token: staleToken });
    expect(result).toBeNull();
  });

  it("a token with no sub is passed through unchanged rather than rejected or errored", async () => {
    const bareToken = { picture: "x" };
    const result = await jwtSecurityStampCallback({ token: bareToken });
    expect(result).toBe(bareToken);
  });

  it("a token for a deleted/nonexistent user is rejected, not passed through", async () => {
    const ghostToken = { sub: "00000000-0000-0000-0000-000000000000", securityStamp: "anything" };
    const result = await jwtSecurityStampCallback({ token: ghostToken });
    expect(result).toBeNull();
  });
});
