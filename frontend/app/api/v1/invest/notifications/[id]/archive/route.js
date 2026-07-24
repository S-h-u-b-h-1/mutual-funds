import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { archiveNotification } from "../../../../../../lib/platform/notifications/core";

export async function POST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const notification = await archiveNotification(id, user.id);
  if (!notification) return Response.json({ error: "Notification not found or already archived" }, { status: 404 });
  return Response.json({ notification });
}
