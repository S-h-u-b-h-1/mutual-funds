// Journey 3 — Portfolio. Single-call combined view: holdings, summary, allocation, top holdings,
// performance leaders, strengths/weaknesses. Source-agnostic — holdings here may originate from
// a CAS import, a completed Journey 2 order, or an explicit mock-connect action; the response
// shape is identical regardless (see docs/INVEST_API_CONTRACTS.md's Journey 3 section).
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { getPortfolio } from "../../../../lib/invest/portfolioService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const portfolio = await getPortfolio(user.id);
  return Response.json(portfolio);
}

export const GET = withObservability("GET /api/v1/invest/portfolio", handleGET);
