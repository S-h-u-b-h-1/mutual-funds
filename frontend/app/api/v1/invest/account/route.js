// Module 1 + Module 5. GET returns the existing account (or null — opening one is an explicit
// action, not implicit on first read). POST opens one via the (mock) InvestmentProvider,
// idempotently — calling it twice returns the same account, never opens a second one.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import * as identityService from "../../../../lib/invest/identityService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const account = await identityService.getAccount(user.id);
  return Response.json({ account });
}

export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  try {
    const account = await identityService.ensureAccount(user.id);
    return Response.json({ account });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
