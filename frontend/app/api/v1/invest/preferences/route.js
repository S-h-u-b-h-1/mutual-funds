import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import * as identityService from "../../../../lib/invest/identityService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const preferences = await identityService.getPreferences(user.id);
  return Response.json({ preferences });
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

  const preferences = await identityService.upsertPreferences(user.id, body);
  return Response.json({ preferences });
}
