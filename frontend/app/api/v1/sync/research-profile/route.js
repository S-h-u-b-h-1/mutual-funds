import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { createInitialResearchProfile, getResearchProfileState } from "../../../../lib/profileGovernanceService";
import { ProfilePolicyError } from "../../../../lib/profileGovernancePolicy";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { profile } = await getResearchProfileState(user.id);
  return Response.json(profile);
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
    const result = await createInitialResearchProfile(user.id, body);
    if (result.locked) {
      return Response.json(
        { error: "Your profile is locked. Submit a change request from Profile for advisor approval.", code: "PROFILE_LOCKED", profile: result.profile },
        { status: 409 }
      );
    }
    return Response.json(result.profile, { status: 201 });
  } catch (error) {
    if (error instanceof ProfilePolicyError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
