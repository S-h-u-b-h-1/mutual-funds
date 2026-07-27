import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { deactivateAccount } from "../../../../lib/accountLifecycle";

// H6 (account lifecycle) — reversible. Blocks login (see auth.js's signIn callback) without
// touching any data; see reactivate/route.js for the undo. No confirmation-typing requirement
// here unlike DELETE /api/v1/account — this action is not destructive.
export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const result = await deactivateAccount(user.id);
  if (!result) return Response.json({ error: "Account already deactivated or deleted" }, { status: 409 });

  return Response.json(result);
}
