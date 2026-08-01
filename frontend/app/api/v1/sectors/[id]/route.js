// One sector's detail page contract — public. Companies, industries, the sector's own operating-
// metric template (Section 11: different sectors need different operating metrics), and honest
// aggregates (see sectors.js's getSectorAggregates for why this never fabricates a sector-average
// figure from partial coverage).
import { getSector, listIndustries, getSectorCompanies, getSectorOperatingMetricTemplate, getSectorAggregates } from "../../../../lib/stocks/sectors";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const sector = await getSector(id);
  if (!sector) return Response.json({ error: "Sector not found" }, { status: 404 });

  const [industries, companies, operatingMetricTemplate, aggregates] = await Promise.all([
    listIndustries(id),
    getSectorCompanies(id),
    getSectorOperatingMetricTemplate(id),
    getSectorAggregates(id),
  ]);

  return Response.json({ sector, industries, companies, operatingMetricTemplate, aggregates });
}

export const GET = withObservability("GET /api/v1/sectors/[id]", handleGET);
