// Notification Read APIs — the inbox listing, with filtering + pagination. Query params:
// status, category, type, unreadOnly, includeArchived, includeDismissed, limit, offset.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { listNotifications } from "../../../../lib/platform/notifications/inbox";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  try {
    const result = await listNotifications(user.id, {
      status: searchParams.get("status"),
      category: searchParams.get("category"),
      type: searchParams.get("type"),
      unreadOnly: searchParams.get("unreadOnly") === "true",
      includeArchived: searchParams.get("includeArchived") === "true",
      includeDismissed: searchParams.get("includeDismissed") === "true",
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const GET = withObservability("GET /api/v1/invest/notifications", handleGET);
