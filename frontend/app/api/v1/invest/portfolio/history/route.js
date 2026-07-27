// Portfolio Timeline — normalized activity feed merging order lifecycle events and settled
// transactions. ?limit=N caps the result (default 50).
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioTimeline } from "../../../../../lib/invest/portfolioService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;
  const events = await getPortfolioTimeline(user.id, { limit });
  return Response.json({ events });
}

export const GET = withObservability("GET /api/v1/invest/portfolio/history", handleGET);
