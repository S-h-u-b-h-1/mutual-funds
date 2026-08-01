// Stock transaction history + entry point — auth required. POST records a manual buy/sell (future
// broker-import sources land through a separate ingestion path, not this manual-entry route).
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { recordTransaction, getTransactions } from "../../../../lib/stocks/portfolioService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") || undefined;
  const limit = searchParams.get("limit");
  const transactions = await getTransactions(user.id, { companyId, limit: limit ? parseInt(limit, 10) : undefined });
  return Response.json({ transactions });
}

async function handlePOST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await recordTransaction({ userId: user.id, source: "manual", ...body });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 400 });
  }
}

export const GET = withObservability("GET /api/v1/stock-portfolio/transactions", handleGET);
export const POST = withObservability("POST /api/v1/stock-portfolio/transactions", handlePOST);
