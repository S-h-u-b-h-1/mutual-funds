import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { getDistributionExecutionReadiness } from "../../../../lib/invest/distributionCompliance";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const readiness = await getDistributionExecutionReadiness();
  return Response.json({ readiness });
}

export const GET = withObservability("GET /api/v1/invest/execution-readiness", handleGET);
