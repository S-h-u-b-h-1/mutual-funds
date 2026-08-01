// Company raw-material exposure + factual price-direction explanation — public (Section 15).
// explainCompanyCommodityExposure() already bakes in the "no profit-impact claim" caveat; this
// route does not add its own commentary on top.
import { getCompanyCommodityExposures, explainCompanyCommodityExposure } from "../../../../../lib/stocks/commodityService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const [exposures, explanations] = await Promise.all([
    getCompanyCommodityExposures(id),
    explainCompanyCommodityExposure(id),
  ]);
  return Response.json({ companyId: id, exposures, explanations });
}

export const GET = withObservability("GET /api/v1/stocks/[id]/commodities", handleGET);
