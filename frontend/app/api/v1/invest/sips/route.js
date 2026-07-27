import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { createSipMandate, listSipMandates } from "../../../../lib/invest/orderService";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const sips = await listSipMandates(user.id);
  return Response.json({ sips });
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
    const sip = await createSipMandate(user.id, body);
    return Response.json({ sip });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const GET = withObservability("GET /api/v1/invest/sips", handleGET);
export const POST = withObservability("POST /api/v1/invest/sips", handlePOST);
