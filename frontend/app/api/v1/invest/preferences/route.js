import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import * as identityService from "../../../../lib/invest/identityService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const preferences = await identityService.getPreferences(user.id);
  return Response.json({ preferences });
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

  const preferences = await identityService.upsertPreferences(user.id, body);
  return Response.json({ preferences });
}

export const GET = withObservability("GET /api/v1/invest/preferences", handleGET);
export const PUT = withObservability("PUT /api/v1/invest/preferences", handlePUT);
