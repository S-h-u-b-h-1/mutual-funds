import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioDataQuality } from "../../../../../lib/invest/portfolioService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const dataQuality = await getPortfolioDataQuality(user.id);
  return Response.json({ dataQuality });
}

export const GET = withObservability("GET /api/v1/invest/portfolio/data-quality", handleGET);
