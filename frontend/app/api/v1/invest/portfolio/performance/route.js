import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioPerformance } from "../../../../../lib/invest/portfolioService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const performance = await getPortfolioPerformance(user.id);
  return Response.json(performance);
}
