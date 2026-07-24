// Switch Contract — live, stateless preview: same-AMC check, destination status, and the full
// source-side eligibility contract (reused from Redemption Contract — a switch's source leg is
// a redemption, tax- and eligibility-wise). Query params, not a dynamic path segment, since this
// needs two scheme codes at once: ?source=<code>&destination=<code>.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getSwitchEligibility } from "../../../../../lib/invest/switchService";

export async function GET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const destination = searchParams.get("destination");
  if (!source || !destination) {
    return Response.json({ error: "Both 'source' and 'destination' query parameters are required." }, { status: 400 });
  }

  try {
    const eligibility = await getSwitchEligibility(user.id, source, destination);
    return Response.json({ eligibility });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
