// Module 2 + Module 5. Submits one compliance item — mobile/email/pan/identity/nominee/bank/
// fatca/pep/risk_profile. 'investment_ready' is rejected here (400) — it's a derived gate, never
// directly submitted (see complianceService.submitItem's own guard).
import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { submitItem } from "../../../../../../lib/invest/complianceService";
import { withObservability } from "../../../../../../lib/platform/observability/core";

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { itemKey } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is valid for items with no payload requirement; malformed JSON on a
    // non-empty body will still surface as a validation error from submitItem below.
  }

  try {
    const result = await submitItem(user.id, itemKey, body);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const POST = withObservability("POST /api/v1/invest/compliance/items/[itemKey]", handlePOST);
