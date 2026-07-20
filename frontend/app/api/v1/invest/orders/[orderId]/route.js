// Journey 2 — Order Management. Order Details + Order Timeline. GET always refreshes status
// first (the polling entry point — see orderService.refreshOrderStatus), so the response is as
// current as the mock progression allows without a background worker.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getOrderWithTimeline } from "../../../../../lib/invest/orderService";

export async function GET(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { orderId } = await params;
  const result = await getOrderWithTimeline(user.id, orderId);
  if (!result) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(result);
}
