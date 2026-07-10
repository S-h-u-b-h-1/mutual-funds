// FreshnessService — the ONE shared source of "how fresh is this" for every surface that
// reports it: /api/freshness, /status, /data-status, /internal/system-health. No page should
// independently compute or word its own freshness comparison; call getFreshnessSummary() and
// render its fields, so a future change to the pipeline/bundle relationship only needs
// understanding in one place, and no two pages can ever disagree about what "fresh" means today.
import { asOf as bundleAsOf } from "./funds";
import { getFreshnessChain } from "./pipelineHealth";

export async function getFreshnessSummary() {
  const chain = await getFreshnessChain();
  // rawLatest: the single most recent nav_date in the warehouse, any asset class — the true
  // ceiling of what AMFI has published and this pipeline has ingested so far.
  const rawLatest = chain.navLatest ?? null;
  // equityLatest: cloud_pipeline.py's own deliberately-conservative "max EQUITY date" figure,
  // snapshotted into fact_system_health at last ingest — this is what bundleAsOf SHOULD equal
  // once a fresh refresh has committed, by design (see docs/DATA_PIPELINE_MAP.md).
  const equityLatest = chain.health?.nav_latest_date ?? null;

  const bundleMatchesRaw = rawLatest && bundleAsOf ? bundleAsOf === rawLatest : null;
  const rawAheadOfBundle = rawLatest && bundleAsOf ? rawLatest > bundleAsOf : null;

  let explanation = null;
  if (rawAheadOfBundle) {
    explanation = `Latest raw AMFI rows exist for ${rawLatest}, but site bundles use the latest complete equity snapshot (${bundleAsOf}).`;
  } else if (bundleMatchesRaw === true) {
    explanation = `Site bundles are fully caught up to the latest AMFI data (${bundleAsOf}).`;
  } else if (bundleAsOf && !rawLatest) {
    explanation = `Site bundles report ${bundleAsOf}; the live warehouse figure is unavailable right now, so it can't be cross-checked.`;
  }

  return {
    bundleAsOf: bundleAsOf ?? null,
    rawLatest,
    equityLatest,
    bundleMatchesRaw,
    rawAheadOfBundle,
    explanation,
    pipelineHealth: chain.health,
  };
}
