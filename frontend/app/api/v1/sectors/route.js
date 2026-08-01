// Sector directory — public (Section 11).
import { listSectors } from "../../../lib/stocks/sectors";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET() {
  const sectors = await listSectors();
  return Response.json({ sectors });
}

export const GET = withObservability("GET /api/v1/sectors", handleGET);
