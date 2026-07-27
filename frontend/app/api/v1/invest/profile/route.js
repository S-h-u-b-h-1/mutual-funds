// Module 1 + Module 5. Combined identity summary — profile, account, preferences, RM assignment,
// and onboarding progress in one call, since a single onboarding/dashboard screen needs all of
// these together (see docs/INVEST_API_CONTRACTS.md for the full response shape).
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import * as identityService from "../../../../lib/invest/identityService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const [profile, account, preferences, rmAssignment, onboarding] = await Promise.all([
    identityService.getProfile(user.id),
    identityService.getAccount(user.id),
    identityService.getPreferences(user.id),
    identityService.getRmAssignment(user.id),
    identityService.getOnboardingProgress(user.id),
  ]);

  return Response.json({ profile, account, preferences, rmAssignment, onboarding });
}

async function handlePUT(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const profile = await identityService.upsertProfile(user.id, body);
  return Response.json({ profile });
}

export const GET = withObservability("GET /api/v1/invest/profile", handleGET);
export const PUT = withObservability("PUT /api/v1/invest/profile", handlePUT);
