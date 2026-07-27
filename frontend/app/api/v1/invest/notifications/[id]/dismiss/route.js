import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { dismissNotification } from "../../../../../../lib/platform/notifications/core";
import { withObservability } from "../../../../../../lib/platform/observability/core";

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const notification = await dismissNotification(id, user.id);
  if (!notification) return Response.json({ error: "Notification not found or already dismissed" }, { status: 404 });
  return Response.json({ notification });
}

export const POST = withObservability("POST /api/v1/invest/notifications/[id]/dismiss", handlePOST);
