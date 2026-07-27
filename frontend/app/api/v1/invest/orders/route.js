// Journey 2 — Order Management. GET lists order history; POST creates an order (draft-only if
// {"draft": true} is in the body, otherwise created and immediately submitted in one call).
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { createOrder, listOrders } from "../../../../lib/invest/orderService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const orders = await listOrders(user.id);
  return Response.json({ orders });
}

async function handlePOST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const order = await createOrder(user.id, body);
    return Response.json({ order });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const GET = withObservability("GET /api/v1/invest/orders", handleGET);
export const POST = withObservability("POST /api/v1/invest/orders", handlePOST);
