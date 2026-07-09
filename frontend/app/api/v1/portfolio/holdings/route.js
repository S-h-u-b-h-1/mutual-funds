import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { getUserHoldings } from "../../../../lib/portfolioImport/holdingsRead";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { holdings, unresolved } = await getUserHoldings(user.id);
  return Response.json({ items: holdings, unresolved });
}
