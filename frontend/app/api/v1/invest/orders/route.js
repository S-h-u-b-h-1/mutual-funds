// Journey 2 — Order Management. GET lists order history; POST creates an order (draft-only if
// {"draft": true} is in the body, otherwise created and immediately submitted in one call).
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { createOrder, listOrders } from "../../../../lib/invest/orderService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const orders = await listOrders(user.id);
  return Response.json({ orders });
}

export async function POST(request) {
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
