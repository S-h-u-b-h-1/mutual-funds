import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioPerformance } from "../../../../../lib/invest/portfolioService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const performance = await getPortfolioPerformance(user.id);
  return Response.json(performance);
}

export const GET = withObservability("GET /api/v1/invest/portfolio/performance", handleGET);
