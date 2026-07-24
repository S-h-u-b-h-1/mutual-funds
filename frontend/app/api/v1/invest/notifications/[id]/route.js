// Notification Read APIs — a single notification plus its full delivery/read/dismiss/archive
// timeline (notification_events), same shape as orderService.getOrderWithTimeline.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getNotificationWithTimeline } from "../../../../../lib/platform/notifications/inbox";

export async function GET(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const result = await getNotificationWithTimeline(user.id, id);
  if (!result) return Response.json({ error: "Notification not found" }, { status: 404 });
  return Response.json(result);
}
