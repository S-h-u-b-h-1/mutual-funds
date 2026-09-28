import { forbidden, getUserRole, requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { reviewProfileChangeRequest } from "../../../../../lib/profileGovernanceService";

export async function PATCH(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { role } = await getUserRole(user.id);
  if (!["advisor", "admin"].includes(role)) return forbidden();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!["approved", "rejected"].includes(body.decision)) {
    return Response.json({ error: "decision must be approved or rejected" }, { status: 400 });
  }

  const { id } = await params;
  const result = await reviewProfileChangeRequest(id, user.id, body.decision, body.note);
  if (result.missing) return Response.json({ error: "Request not found" }, { status: 404 });
  if (result.alreadyReviewed) return Response.json({ error: `Request is already ${result.status}.` }, { status: 409 });
  return Response.json(result);
}
