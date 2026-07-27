// Redemption Contract — live, stateless preview: eligible folios, redeemable units, available
// amount, exit-load estimate, tax context, payout bank. Never persisted (see redemptionService.js).
import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { getRedemptionEligibility } from "../../../../../../lib/invest/redemptionService";
import { withObservability } from "../../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { schemeCode } = await params;
  try {
    const eligibility = await getRedemptionEligibility(user.id, schemeCode);
    return Response.json({ eligibility });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const GET = withObservability("GET /api/v1/invest/redemption/[schemeCode]/eligibility", handleGET);
