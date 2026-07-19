// Module 1 + Module 5. PUT body is the raw questionnaire answers
// ({horizonScore, lossToleranceScore, incomeStabilityScore, experienceScore}, each 1-5) —
// identityService derives the score/category, never trusts a client-supplied score directly.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import * as identityService from "../../../../lib/invest/identityService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const riskProfile = await identityService.getRiskProfile(user.id);
  return Response.json({ riskProfile });
}

export async function PUT(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const riskProfile = await identityService.upsertRiskProfile(user.id, body);
    return Response.json({ riskProfile });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
