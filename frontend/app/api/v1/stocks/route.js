// Stock discovery — public, same posture as the mutual-fund side's public research routes (no
// auth required to browse company research; see docs/INVESTOR_ONBOARDING_UX_AUDIT.md's auth-route
// audit for why research stays public while portfolio/watchlist/alerts do not). Company creation
// is deliberately NOT exposed here — populating `companies` is an internal data-loading concern
// (Section 29: "do not deploy questionable scraped datasets"), not a public API operation.
import { listCompaniesBySector } from "../../../lib/stocks/companyService";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET(request) {
  const { searchParams } = new URL(request.url);
  const sectorId = searchParams.get("sector");
  const industryId = searchParams.get("industry");
  const limit = searchParams.get("limit");

  const companies = await listCompaniesBySector({ sectorId, industryId, limit: limit ? parseInt(limit, 10) : undefined });
  return Response.json({ companies });
}

export const GET = withObservability("GET /api/v1/stocks", handleGET);
