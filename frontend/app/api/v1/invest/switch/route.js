// Switch Contract — the ONLY route that can create switch orders (orderService's generic POST
// /orders refuses orderType='switch_in'/'switch_out'; see orderService.js's validateOrderInput).
// Body: {sourceSchemeCode, destinationSchemeCode, folioNumber, amount?, units?}. Returns both
// linked legs: {switchOut, switchIn}.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { createSwitchOrder } from "../../../../lib/invest/switchService";
import { withObservability } from "../../../../lib/platform/observability/core";

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
    const result = await createSwitchOrder(user.id, body);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const POST = withObservability("POST /api/v1/invest/switch", handlePOST);
