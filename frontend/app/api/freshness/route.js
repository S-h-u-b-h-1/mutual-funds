// Machine-readable freshness endpoint (P0 go-live sprint) — exists so the production-refresh
// workflow's post-deploy verification can compare an exact value instead of grepping rendered
// HTML (the banner's copy legitimately varies: "today (…)", "(2d ago)", a prose sentence on
// 1-day staleness — a text scrape broke on the most common success case). Deliberately static:
// it reports the asOf BAKED INTO this deployment's bundle, which is precisely what "is
// production serving the refreshed data" needs to measure. No auth, no PII — the same date is
// printed in the site header on every page.
import { asOf } from "../../lib/funds";

export async function GET() {
  return Response.json({ asOf });
}
