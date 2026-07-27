import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioAllocation } from "../../../../../lib/invest/portfolioService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const allocation = await getPortfolioAllocation(user.id);
  return Response.json({ allocation });
}

export const GET = withObservability("GET /api/v1/invest/portfolio/allocation", handleGET);
