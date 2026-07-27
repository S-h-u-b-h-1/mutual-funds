import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { markRead } from "../../../../../../lib/platform/notifications/core";
import { withObservability } from "../../../../../../lib/platform/observability/core";

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const notification = await markRead(id, user.id);
  if (!notification) return Response.json({ error: "Notification not found or already read" }, { status: 404 });
  return Response.json({ notification });
}

export const POST = withObservability("POST /api/v1/invest/notifications/[id]/read", handlePOST);
