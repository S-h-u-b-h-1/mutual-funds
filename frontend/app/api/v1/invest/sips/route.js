import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { createSipMandate, listSipMandates } from "../../../../lib/invest/orderService";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const sips = await listSipMandates(user.id);
  return Response.json({ sips });
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
    const sip = await createSipMandate(user.id, body);
    return Response.json({ sip });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
