// Peer comparison — public. Peer set is the transparent, non-negotiable definition
// getPeerCompanies/getPeerMedianValuation share (same industry_id, self excluded) — see
// valuation.js's own comment for why (Section 10: peer selection must never be silent).
import { getPeerCompanies, getPeerMedianValuation } from "../../../../../lib/stocks/valuation";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const asOfDate = new Date().toISOString().slice(0, 10);
  const [peers, median] = await Promise.all([getPeerCompanies(id), getPeerMedianValuation(id, asOfDate)]);
  return Response.json({ companyId: id, ...peers, median });
}

export const GET = withObservability("GET /api/v1/stocks/[id]/peers", handleGET);
