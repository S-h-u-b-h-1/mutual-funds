// A user's stock alerts across every company — auth required. See /api/v1/stocks/[id]/alerts for
// the single-company scoped view.
import { requireUser, unauthorized } from "../../../lib/apiAuth";
import { createAlert, getAlerts } from "../../../lib/stocks/alertService";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const alerts = await getAlerts(user.id, { status });
  return Response.json({ alerts });
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
  if (!body?.companyId) return Response.json({ error: "companyId is required" }, { status: 400 });

  try {
    const alert = await createAlert({ userId: user.id, ...body });
    return Response.json({ alert }, { status: 201 });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 400 });
  }
}

export const GET = withObservability("GET /api/v1/alerts", handleGET);
export const POST = withObservability("POST /api/v1/alerts", handlePOST);
