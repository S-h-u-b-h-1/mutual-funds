import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { cancelOrder } from "../../../../../../lib/invest/orderService";

export async function POST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { orderId } = await params;
  try {
    const order = await cancelOrder(user.id, orderId);
    return Response.json({ order });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
