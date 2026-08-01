// Valuation — current, historical, sector median, peer median — public. Section 6: never equate
// "low P/E = cheap" or vice versa; this route returns the numbers and their context (sector/peer
// medians) without attaching any cheap/expensive characterization itself.
import { getLatestValuation, getValuationHistory, getSectorMedianValuation, getPeerMedianValuation } from "../../../../../lib/stocks/valuation";
import { getCompanyById } from "../../../../../lib/stocks/companyService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");

  const company = await getCompanyById(id);
  if (!company) return Response.json({ error: "Company not found" }, { status: 404 });

  const asOfDate = new Date().toISOString().slice(0, 10);
  const [current, history, sectorMedian, peerMedian] = await Promise.all([
    getLatestValuation(id),
    getValuationHistory(id, { limit: limit ? parseInt(limit, 10) : undefined }),
    company.sectorId ? getSectorMedianValuation(company.sectorId, asOfDate) : Promise.resolve({ companyCount: 0, medianPe: null, medianPb: null, medianEvEbitda: null, medianDividendYield: null, reason: "Company has no sector_id set." }),
    getPeerMedianValuation(id, asOfDate),
  ]);

  return Response.json({ companyId: id, current, history, sectorMedian, peerMedian });
}

export const GET = withObservability("GET /api/v1/stocks/[id]/valuation", handleGET);
