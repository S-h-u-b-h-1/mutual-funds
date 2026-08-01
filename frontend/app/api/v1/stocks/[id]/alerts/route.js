// Alerts scoped to one company — auth required. See /api/v1/alerts for a user's alerts across
// every company.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { createAlert, getAlerts } from "../../../../../lib/stocks/alertService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const alerts = (await getAlerts(user.id, { status })).filter((a) => a.companyId === id);
  return Response.json({ companyId: id, alerts });
}

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const alert = await createAlert({ userId: user.id, companyId: id, ...body });
    return Response.json({ alert }, { status: 201 });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 400 });
  }
}

export const GET = withObservability("GET /api/v1/stocks/[id]/alerts", handleGET);
export const POST = withObservability("POST /api/v1/stocks/[id]/alerts", handlePOST);
