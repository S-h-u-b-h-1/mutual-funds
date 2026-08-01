// Stock portfolio summary — auth required. See portfolioService.getPortfolioSummary for why
// currentValue/gainLoss are explicitly null (no live price feed) rather than fabricated.
import { requireUser, unauthorized } from "../../../lib/apiAuth";
import { getPortfolioSummary } from "../../../lib/stocks/portfolioService";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const summary = await getPortfolioSummary(user.id);
  return Response.json(summary);
}

export const GET = withObservability("GET /api/v1/stock-portfolio", handleGET);
