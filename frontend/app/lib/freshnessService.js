// FreshnessService — the ONE shared source of "how fresh is this" for every surface that
// reports it: /api/freshness, /status, /data-status, /internal/system-health. No page should
// independently compute or word its own freshness comparison; call getFreshnessSummary() and
// render its fields, so a future change to the pipeline/bundle relationship only needs
// understanding in one place, and no two pages can ever disagree about what "fresh" means today.
import { asOf as bundleAsOf } from "./funds";
import { getFreshnessChain, getCoverageHealth } from "./pipelineHealth";

// 2026-08-11 incident fix: turns freshness_state (CURRENT/PARTIAL/STALE/UNKNOWN — see
// ingestion/freshness.py:classify_freshness) into copy a customer can actually read. Never
// mentions cron/pipeline/ingestion internals (mission spec A10) — those stay in pipelineHealth
// for the internal dashboards.
function customerMessageFor(coverage, bundleAsOfDate) {
  if (!coverage || !coverage.freshness_state) {
    return bundleAsOfDate ? `Latest official NAV available: ${bundleAsOfDate}.` : null;
  }
  const { freshness_state: state, source_date, coverage_pct } = coverage;
  const pct = typeof coverage_pct === "number" ? Math.round(coverage_pct * 100) : null;
  if (state === "CURRENT") {
    return `Latest official NAV available: ${source_date}.`;
  }
  if (state === "PARTIAL") {
    return `MF Pulse is still receiving ${source_date}'s official NAVs from AMFI${pct !== null ? ` (${pct}% of funds updated so far)` : ""} — some funds may still show the previous day's price.`;
  }
  if (state === "STALE") {
    return `The most recent official NAV on file is ${source_date}, which is older than expected. MF Pulse is working to catch up.`;
  }
  return bundleAsOfDate ? `Latest official NAV available: ${bundleAsOfDate}.` : null;
}

export async function getFreshnessSummary() {
  const [chain, coverage] = await Promise.all([getFreshnessChain(), getCoverageHealth()]);
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
    // 2026-08-11 incident fix: coverage is the missing dimension every field above lacked — a
    // date existing in the warehouse (rawLatest/equityLatest) never used to mean most schemes
    // actually HAD that date. freshnessState is the honest CURRENT/PARTIAL/STALE/UNKNOWN verdict;
    // customerMessage is the plain-English line for user-facing surfaces (never "cron"/"pipeline").
    coverage,
    freshnessState: coverage?.freshness_state ?? null,
    customerMessage: customerMessageFor(coverage, bundleAsOf),
  };
}
