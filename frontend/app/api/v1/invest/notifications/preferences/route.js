// Phase 5 M5 Slice 3. Own-user-only notification preferences — GET returns current settings
// (or the schema's own defaults if the user has never saved any), PUT applies a partial update
// (only the keys sent are validated/changed; anything omitted keeps its current value).
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getPreferences, upsertPreferences, KNOWN_CHANNELS, SUGGESTED_CATEGORIES } from "../../../../../lib/platform/notifications/preferences";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const preferences = await getPreferences(user.id);
  return Response.json({ preferences, knownChannels: KNOWN_CHANNELS, suggestedCategories: SUGGESTED_CATEGORIES });
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

  let preferences;
  try {
    preferences = await upsertPreferences(user.id, body);
  } catch (err) {
    return Response.json({ error: String(err?.message ?? err) }, { status: 400 });
  }

  return Response.json({ preferences });
}

export const GET = withObservability("GET /api/v1/invest/notifications/preferences", handleGET);
export const PUT = withObservability("PUT /api/v1/invest/notifications/preferences", handlePUT);
