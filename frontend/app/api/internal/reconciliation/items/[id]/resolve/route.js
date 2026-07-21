// POST /api/internal/reconciliation/items/[id]/resolve — manually resolve an open exception.
// Gated on requireRole(["advisor","admin"]) — apiAuth.js's role primitive existed but had no
// real caller anywhere in the app until this route; this is its first live use. It fails
// closed correctly today: users.role defaults to 'investor' and nothing yet promotes anyone to
// 'advisor'/'admin', so until an operator does `update users set role = 'advisor' where id = …`
// by hand, this route is unreachable by design — not a gap, the correct state for an
// unfinished promotion flow. Full RBAC/permission middleware (Milestone 12) will add the
// promotion mechanism and route-level policy; this route just becomes its first consumer then.
import { requireUser, requireRole, unauthorized, forbidden } from "../../../../../../lib/apiAuth";
import { resolveReconciliationItem } from "../../../../../../lib/platform/reconciliation/core.js";

export async function POST(request, { params }) {
  const user = await requireRole(["advisor", "admin"]);
  if (!user) {
    const signedIn = await requireUser();
    return signedIn ? forbidden() : unauthorized();
  }

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const note = body?.note;
  if (!note || typeof note !== "string") {
    return Response.json({ error: "A resolution 'note' is required." }, { status: 400 });
  }

  try {
    const item = await resolveReconciliationItem(id, { resolvedBy: user.id, note });
    return Response.json({ item });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
