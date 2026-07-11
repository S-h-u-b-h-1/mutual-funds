// Machine-readable freshness endpoint (P0 go-live sprint) — exists so the production-refresh
// workflow's post-deploy verification can compare an exact value instead of grepping rendered
// HTML (the banner's copy legitimately varies: "today (…)", "(2d ago)", a prose sentence on
// 1-day staleness — a text scrape broke on the most common success case). `asOf` is
// deliberately kept as the first/top-level field — it's the exact value the workflow's
// verification step compares — and reports the asOf BAKED INTO this deployment's bundle, which
// is precisely what "is production serving the refreshed data" needs to measure. The rest of
// FreshnessService's summary is included too, so this endpoint doubles as the one place any
// future consumer (dashboard, alerting) can get the full picture without a second source. No
// auth, no PII — the same date is printed in the site header on every page.
import { asOf } from "../../lib/funds";
import { getFreshnessSummary } from "../../lib/freshnessService";

export async function GET() {
  const summary = await getFreshnessSummary();
  // VERCEL_GIT_COMMIT_SHA is auto-injected at build time by Vercel's git integration (same
  // source pipelineHealth.js's getDeploymentCurrency() already trusts) — lets a caller verify
  // not just "the date looks right" but "this exact commit is what's actually being served",
  // e.g. scripts/verify_public_domain_freshness.py's --expected-sha check.
  const deployedCommitSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  return Response.json({ asOf, deployedCommitSha, ...summary });
}
