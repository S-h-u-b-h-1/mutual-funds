// Normalized financial statements for one company — public. Returns every statement type by
// default (each with its own pivoted `fields` map); narrow with ?statementType=&periodType=&limit=.
import { getStatementsForCompany } from "../../../../../lib/stocks/financialStatements";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const statementType = searchParams.get("statementType") || undefined;
  const periodType = searchParams.get("periodType") || undefined;
  const limit = searchParams.get("limit");

  const statements = await getStatementsForCompany(id, { statementType, periodType, limit: limit ? parseInt(limit, 10) : undefined });
  return Response.json({ companyId: id, statements });
}

export const GET = withObservability("GET /api/v1/stocks/[id]/financials", handleGET);
