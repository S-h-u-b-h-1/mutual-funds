import crypto from "crypto";
import { hasDatabaseUrl, query } from "../../../lib/db";
import { hasResendKey, sendPasswordResetEmail } from "../../../lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_OK = { message: "If an account exists for that email, a reset link has been sent." };

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    // Still generic — don't confirm/deny anything about input shape vs. account existence.
    return Response.json(GENERIC_OK);
  }

  // Silently no-op (but still return the generic OK) when the backend can't actually act —
  // never let the response shape reveal whether the email has an account.
  if (hasDatabaseUrl && hasResendKey) {
    const r = await query(`select id, password_hash from users where email = $1`, [email]);
    const user = r.rows[0];
    // Only credentials accounts (password_hash set) have a password to reset; OAuth-only
    // accounts silently no-op here too, same as an unknown email.
    if (user && user.password_hash) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await query(
        `insert into verification_tokens (identifier, token, purpose, expires) values ($1, $2, 'password_reset', $3)`,
        [email, hashToken(rawToken), expires]
      );
      const origin = process.env.NEXTAUTH_URL || new URL(request.url).origin;
      const resetUrl = `${origin}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
      await sendPasswordResetEmail(email, resetUrl).catch(() => {
        // Swallow send failures too — same reasoning: response must stay generic either way.
      });
    }
  }

  return Response.json(GENERIC_OK);
}
