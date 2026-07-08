import crypto from "crypto";
import { hasDatabaseUrl, query } from "../../../lib/db";
import { hasResendKey, sendPasswordResetEmail } from "../../../lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_OK = { message: "If an account exists for that email, a reset link has been sent." };
// Same trusted constant as app/layout.js's own SITE — never derive a security-sensitive URL
// (one that will be emailed out with a live, single-use token in it) from the incoming request's
// own Host/URL. That's forgeable via a spoofed Host or X-Forwarded-Host header, which would let
// an attacker redirect a real user's reset link — and its embedded token — to an attacker-
// controlled domain (password-reset-poisoning; full account takeover on click).
const TRUSTED_ORIGIN = process.env.NEXTAUTH_URL || "https://frontend-six-beta-20.vercel.app";

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
      const resetUrl = `${TRUSTED_ORIGIN}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
      // Deliberately not awaited: awaiting a real outbound HTTPS call here (plus the extra
      // INSERT above) makes this branch measurably slower than the "unknown email" branch below,
      // which returns after a single SELECT — a timing side-channel that leaks account existence
      // even though the response body/status are identical either way. Firing-and-forgetting
      // closes that gap; a delivery failure here was already silent/unsurfaced either way.
      sendPasswordResetEmail(email, resetUrl).catch(() => {});
    }
  }

  return Response.json(GENERIC_OK);
}
