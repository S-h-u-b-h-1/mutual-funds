import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioSummary } from "../../../../../lib/invest/portfolioService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const summary = await getPortfolioSummary(user.id);
  return Response.json({ summary });
}
