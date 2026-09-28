import { forbidden, getUserRole, requireUser, unauthorized } from "../../../../lib/apiAuth";
import { listPendingProfileChangeRequests } from "../../../../lib/profileGovernanceService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { role } = await getUserRole(user.id);
  if (!["advisor", "admin"].includes(role)) return forbidden();
  return Response.json({ requests: await listPendingProfileChangeRequests() });
}
