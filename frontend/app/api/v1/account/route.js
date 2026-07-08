import { requireUser, unauthorized } from "../../../lib/apiAuth";
import { query } from "../../../lib/db";

// Account deletion — the actual trigger for the cascade deletes 002_auth_and_user_data.sql's
// header comment justifies on GDPR/privacy grounds. That reasoning is only true in practice if a
// user can actually invoke it, so this exists even though no UI calls it yet (same "backend
// capability before frontend" scoping as the rest of this sprint).
export async function DELETE(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Require typing the account's own email back — cheap, effective protection against a
  // mis-click or a forged same-origin request triggering an irreversible delete silently.
  if (typeof body.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== String(user.email).toLowerCase()) {
    return Response.json({ error: "confirmEmail must match your account email" }, { status: 400 });
  }

  // Every user-owned table cascades from users(id) — see the schema file's own header comment.
  // Session revocation is real for "database" strategy (the row is gone). For the "jwt" fallback
  // (see auth.js), the existing cookie stays cryptographically valid until natural expiry even
  // though the account is gone — same documented limitation as reset-password's session note.
  await query(`delete from users where id = $1`, [user.id]);

  return new Response(null, { status: 204 });
}
