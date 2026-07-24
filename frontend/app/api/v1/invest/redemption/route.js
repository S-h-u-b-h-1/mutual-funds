// Redemption Contract — the ONLY route that can create a redemption order (orderService's
// generic POST /orders explicitly refuses orderType='redemption'; see orderService.js's
// validateOrderInput). Body: {schemeCode, folioNumber, amount?, units?}.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { createRedemptionOrder } from "../../../../lib/invest/redemptionService";

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
    const order = await createRedemptionOrder(user.id, body);
    return Response.json({ order });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
