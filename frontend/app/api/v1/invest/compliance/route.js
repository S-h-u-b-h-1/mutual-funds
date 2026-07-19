// Module 2 + Module 5. Full compliance application: every item's status plus overall percentage.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { getComplianceProgress } from "../../../../lib/invest/complianceService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const progress = await getComplianceProgress(user.id);
  return Response.json(progress);
}
