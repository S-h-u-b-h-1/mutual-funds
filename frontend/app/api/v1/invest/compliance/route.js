// Module 2 + Module 5. Full compliance application: every item's status plus overall percentage.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { getComplianceProgress } from "../../../../lib/invest/complianceService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const progress = await getComplianceProgress(user.id);
  return Response.json(progress);
}

export const GET = withObservability("GET /api/v1/invest/compliance", handleGET);
