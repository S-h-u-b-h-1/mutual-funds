import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioHoldings } from "../../../../../lib/invest/portfolioService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const result = await getPortfolioHoldings(user.id);
  return Response.json(result);
}
