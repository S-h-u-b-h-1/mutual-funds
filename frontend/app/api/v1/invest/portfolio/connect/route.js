// Explicit, user-initiated mock-provider connection — generates a realistic demo portfolio (real
// fund identities, synthetic units/purchase facts) for a user with no holdings yet. Never called
// automatically. Idempotent: calling it again for an already-connected user returns the existing
// mock-connected portfolio unchanged (alreadyConnected: true), not a fresh/different one.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { connectMockPortfolio } from "../../../../../lib/invest/portfolioService";

export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const result = await connectMockPortfolio(user.id);
  return Response.json(result);
}
