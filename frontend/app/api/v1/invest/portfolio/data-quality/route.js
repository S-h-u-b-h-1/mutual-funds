import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPortfolioDataQuality } from "../../../../../lib/invest/portfolioService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const dataQuality = await getPortfolioDataQuality(user.id);
  return Response.json({ dataQuality });
}
