// Company page contract — public. Assembles identity + profile in one response; financials/
// metrics/valuation/timeline/peers live at their own sub-paths (separate concerns, separate
// modules — see companyProfile.js's header comment for why this function doesn't reach into
// those tables itself).
import { getCompanyPageContract } from "../../../../lib/stocks/companyProfile";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const contract = await getCompanyPageContract(id);
  if (!contract) return Response.json({ error: "Company not found" }, { status: 404 });
  return Response.json(contract);
}

export const GET = withObservability("GET /api/v1/stocks/[id]", handleGET);
