// Notification Read APIs — a separate, cheap endpoint from the full list (e.g. a nav badge that
// polls more often than the inbox itself is open). Optional ?category= to scope it.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getUnreadCount } from "../../../../../lib/platform/notifications/inbox";

export async function GET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const count = await getUnreadCount(user.id, { category: searchParams.get("category") });
  return Response.json({ count });
}
