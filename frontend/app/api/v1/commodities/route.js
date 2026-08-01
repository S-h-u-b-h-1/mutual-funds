// Commodity catalog + latest price where on file — public. See docs/BIGMINT_DATA_INTEGRATION.md:
// no real vendor is wired in yet, so this reflects whatever has been recorded via
// commodityService (currently nothing outside tests/mock ingestion — see the Stock Intelligence
// status doc for what's next).
import { listCommodities, getLatestCommodityPrice } from "../../../lib/stocks/commodityService";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET() {
  const commodities = await listCommodities();
  const withLatestPrice = await Promise.all(
    commodities.map(async (c) => ({ ...c, latestPrice: await getLatestCommodityPrice(c.id) }))
  );
  return Response.json({ commodities: withLatestPrice });
}

export const GET = withObservability("GET /api/v1/commodities", handleGET);
