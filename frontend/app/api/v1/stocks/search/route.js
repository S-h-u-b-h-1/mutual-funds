// Public company search — display name/legal name/NSE symbol/BSE code/ISIN, any of which a real
// investor might type. See companyService.searchCompanies for the exact ranking (exact-prefix
// display-name matches first).
import { searchCompanies } from "../../../../lib/stocks/companyService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limit = searchParams.get("limit");
  const companies = await searchCompanies(q, { limit: limit ? parseInt(limit, 10) : undefined });
  return Response.json({ query: q, companies });
}

export const GET = withObservability("GET /api/v1/stocks/search", handleGET);
