import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { retryOrder } from "../../../../../../lib/invest/orderService";
import { withObservability } from "../../../../../../lib/platform/observability/core";

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { orderId } = await params;
  try {
    const order = await retryOrder(user.id, orderId);
    return Response.json({ order });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const POST = withObservability("POST /api/v1/invest/orders/[orderId]/retry", handlePOST);
