import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { reactivateAccount } from "../../../../lib/accountLifecycle";

// H6 (account lifecycle) — the undo for deactivate/route.js. Only reachable by a request that
// itself carries a valid, still-usable session, which a deactivated account (whose sessions were
// deleted on deactivation, see accountLifecycle.js) generally won't have — the realistic path
// back is signing in again, which requires deactivated_at to already be cleared. This route
// exists mainly for a still-live session (e.g. a second tab open when deactivation happened
// elsewhere) and for symmetry/completeness of the lifecycle API.
export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const result = await reactivateAccount(user.id);
  if (!result) return Response.json({ error: "Account is not deactivated" }, { status: 409 });

  return Response.json(result);
}
