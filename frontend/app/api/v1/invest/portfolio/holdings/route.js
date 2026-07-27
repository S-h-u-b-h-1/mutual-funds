import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioHoldings } from "../../../../../lib/invest/portfolioService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const result = await getPortfolioHoldings(user.id);
  return Response.json(result);
}

export const GET = withObservability("GET /api/v1/invest/portfolio/holdings", handleGET);
