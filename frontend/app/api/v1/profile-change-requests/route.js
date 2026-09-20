import { requireUser, unauthorized } from "../../../lib/apiAuth";
import { getResearchProfileState, submitProfileChangeRequest } from "../../../lib/profileGovernanceService";
import { ProfilePolicyError } from "../../../lib/profileGovernancePolicy";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return Response.json(await getResearchProfileState(user.id));
}

export async function POST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await submitProfileChangeRequest(user.id, body);
    if (result.missingProfile) return Response.json({ error: "Complete your first profile before requesting a change." }, { status: 409 });
    if (result.noChange) return Response.json({ error: "Change at least one profile answer before submitting a request." }, { status: 400 });
    if (result.existing) return Response.json({ error: "A profile change is already awaiting review.", request: result.existing }, { status: 409 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ProfilePolicyError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
