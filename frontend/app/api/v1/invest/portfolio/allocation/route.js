import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioAllocation } from "../../../../../lib/invest/portfolioService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const allocation = await getPortfolioAllocation(user.id);
  return Response.json({ allocation });
}
