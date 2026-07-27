import { requireUser, unauthorized } from "../../../lib/apiAuth";
import { requestAccountDeletion } from "../../../lib/accountLifecycle";

// Account deletion (H6, Backend Hardening Phase 3 — see docs/ACCOUNT_LIFECYCLE_AND_RETENTION.md).
// Previously ran a single `delete from users where id = $1`, relying entirely on `on delete
// cascade` to wipe every user-owned row across ~35 tables — bank accounts, KYC documents,
// completed orders, compliance decisions, the audit trail itself — with no separation between
// "log me out everywhere" and "destroy my regulated financial history." Now anonymizes the
// account's identifying fields instead of hard-deleting the row, so every financial/compliance/
// document/audit record this account's activity created survives fully intact. Still exists even
// though no UI calls it yet — same "backend capability before frontend" scoping as the rest of
// this sprint.
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
  // mis-click or a forged same-origin request triggering an irreversible action silently.
  if (typeof body.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== String(user.email).toLowerCase()) {
    return Response.json({ error: "confirmEmail must match your account email" }, { status: 400 });
  }

  const result = await requestAccountDeletion(user.id);
  if (!result) return Response.json({ error: "Account already deleted" }, { status: 409 });

  return new Response(null, { status: 204 });
}
