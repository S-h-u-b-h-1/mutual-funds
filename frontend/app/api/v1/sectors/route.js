// Sector directory — public (Section 11).
import { listSectors } from "../../../lib/stocks/sectors";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET() {
  const sectors = await listSectors();
  return Response.json({ sectors, status: sectors.length ? "available" : "unavailable", reason: sectors.length ? null : "data_source_not_connected" });
}

export const GET = withObservability("GET /api/v1/sectors", handleGET);
