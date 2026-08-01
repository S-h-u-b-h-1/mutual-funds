// Derived fundamentals for one company — public. Computed fresh from the latest annual pnl/
// balance_sheet/cash_flow statements on file via metrics.js's single canonical implementation
// (Section 11: "frontend should not independently calculate fundamentals"). Every metric is null,
// never fabricated, when the underlying statement doesn't exist yet.
import { getLatestStatement } from "../../../../../lib/stocks/financialStatements";
import { computeMetrics } from "../../../../../lib/stocks/metrics";
import { getLatestValuation } from "../../../../../lib/stocks/valuation";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const periodType = searchParams.get("periodType") || "annual";

  const [pnlStatement, balanceSheetStatement, cashFlowStatement, valuation] = await Promise.all([
    getLatestStatement(id, "pnl", periodType),
    getLatestStatement(id, "balance_sheet", periodType),
    getLatestStatement(id, "cash_flow", periodType),
    getLatestValuation(id),
  ]);

  const metrics = computeMetrics({
    pnl: pnlStatement?.fields,
    balanceSheet: balanceSheetStatement?.fields,
    cashFlow: cashFlowStatement?.fields,
    sharesOutstanding: valuation?.sharesOutstanding,
  });

  return Response.json({
    companyId: id,
    periodType,
    asOf: {
      pnl: pnlStatement?.periodEndDate ?? null,
      balanceSheet: balanceSheetStatement?.periodEndDate ?? null,
      cashFlow: cashFlowStatement?.periodEndDate ?? null,
    },
    metrics,
  });
}

export const GET = withObservability("GET /api/v1/stocks/[id]/metrics", handleGET);
