// Suasion mission Section A — canonical onboarding/readiness contract. Additive: GET /api/v1/
// invest/profile's existing `onboarding` field (raw compliance-items list) is untouched, so
// nothing already consuming that shape needs to change. This is the richer contract described in
// docs/INVEST_API_CONTRACTS.md — one call answering "what's done, what's next, can they invest."
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { getOnboardingContract } from "../../../../lib/invest/identityService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { readiness, steps, nextAction } = await getOnboardingContract(user.id);
  return Response.json({
    investor: { id: user.id, name: user.name ?? null, email: user.email ?? null },
    readiness,
    steps,
    nextAction,
  });
}

export const GET = withObservability("GET /api/v1/invest/onboarding", handleGET);
