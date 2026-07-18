// Institutional Mission 1/2 — the 21-field registry the live coverage dashboard and the source
// registry both read. This is deliberately NOT a re-derivation: every source/frequency/complexity
// value here is ported from the already-researched docs/DATA_SOURCE_REGISTER.md (Provenance
// Mission Phase 2) and docs/DATA_COVERAGE_MATRIX.md (Trust Sprint Mission 1) — this module exists
// so that research is queryable by code instead of only readable as prose. Coverage %, missing
// count, and last-updated are NOT stored here — those come from frontend/app/data/fieldCoverage.json
// (computed live by scripts/market_coverage_audit.py) so they can never drift stale independent of
// the actual data.
//
// `key` maps to how coverage is actually measured for this field — see field_coverage.json's own
// group/field naming (scripts/market_coverage_audit.py's FIELDS dict) for fields with live
// coverage, or null for fields with no schema slot to measure at all.
export const FIELD_REGISTRY = [
  {
    id: "scheme_name", label: "Scheme Name", key: "Identity.Scheme Name", status: "modeled",
    officialSource: "AMFI NAVAll.txt", secondarySource: null, backupSource: null,
    refreshFrequency: "daily", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "Official daily feed, validated at ingest.",
  },
  {
    id: "category", label: "Category", key: "Identity.Category", status: "modeled",
    officialSource: "AMFI NAVAll.txt", secondarySource: null, backupSource: null,
    refreshFrequency: "daily", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "54 distinct raw category strings exist, including known taxonomy defects (a literal typo, a vague placeholder bucket) — tracked separately as a taxonomy-repair gap, not a coverage gap.",
  },
  {
    id: "fund_house", label: "Fund House (AMC)", key: "Identity.AMC", status: "modeled",
    officialSource: "AMFI NAVAll.txt", secondarySource: null, backupSource: null,
    refreshFrequency: "daily", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: null,
  },
  {
    id: "benchmark", label: "Benchmark", key: "Identity.Benchmark", status: "modeled",
    officialSource: "SID (Scheme Information Document)", secondarySource: "AMC factsheet",
    backupSource: "SEBI category-standard benchmark mapping", refreshFrequency: "static (event-driven on rare mandate change)",
    isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "Regex must accept \"Index\", \"TRI\", and combined forms. Distinct from \"Benchmark Returns\" (an actual daily return series, only available for the 227 schemes benchmarked to exactly Nifty 50 or Sensex, via a separate, currently-stale index_history.json).",
  },
  {
    id: "nav", label: "NAV", key: "Performance.Latest NAV", status: "modeled",
    officialSource: "AMFI NAVAll.txt", secondarySource: null, backupSource: null,
    refreshFrequency: "daily (twice: 14:30 UTC + 05:00 UTC)", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: null,
  },
  {
    id: "aum", label: "AUM", key: "Metadata.AUM", status: "modeled",
    officialSource: "AMC factsheet PDF", secondarySource: "AMC website (dedicated AUM disclosure, untried)",
    backupSource: "AMFI aggregate AUM disclosures (industry-level only, not per-scheme)",
    refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "SBI-only pilot today (152/14,218 schemes). No AMC-level (summed) AUM exists anywhere in this platform either — a separate, larger gap than per-scheme AUM.",
  },
  {
    id: "expense_ratio", label: "Expense Ratio", key: "Metadata.Expense Ratio", status: "modeled",
    officialSource: "AMC website TER disclosure page", secondarySource: "AMC factsheet",
    backupSource: null, refreshFrequency: "varies by AMC (shorter than monthly for some)",
    isPrimaryOfficial: true, extractionComplexity: "high",
    notes: "0.0% populated even for the 152 SBI schemes — SBI's per-scheme factsheet PDF does not expose TER at all; the dedicated AMC website TER page is a different, untried source.",
  },
  {
    id: "exit_load", label: "Exit Load", key: "Metadata.Exit Load", status: "modeled",
    officialSource: "SID", secondarySource: "AMC factsheet", backupSource: null,
    refreshFrequency: "static (event-driven on rare change)", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "Free-text clause (\"1% if redeemed within 1 year, nil thereafter\"), needs structured parsing not just presence/absence. 0.0% populated.",
  },
  {
    id: "lock_in", label: "Lock-in", key: null, status: "no_schema",
    officialSource: "SID (statutory for ELSS — 3y lock-in is law, not AMC discretion)", secondarySource: null,
    backupSource: null, refreshFrequency: "static", isPrimaryOfficial: true, extractionComplexity: "low for ELSS (safe to hardcode as a rule, SID as citation) — do not infer for any other category",
    notes: "No schema slot anywhere. Most open-ended schemes have no lock-in at all — the field needs to distinguish \"not applicable\" from \"unknown\", which the current schema can't express.",
  },
  {
    id: "riskometer", label: "Riskometer", key: "Metadata.Riskometer", status: "modeled",
    officialSource: "AMC factsheet", secondarySource: "AMC scheme page", backupSource: null,
    refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "SBI-only pilot (152/14,218).",
  },
  {
    id: "fund_manager", label: "Fund Manager", key: "Metadata.Manager", status: "modeled",
    officialSource: "AMC factsheet", secondarySource: "SAI (has full tenure history, factsheet usually only current)",
    backupSource: null, refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "12/14,224 schemes (0.08%) — even within the SBI pilot, ambiguous solo-manager lines are conservatively dropped rather than mis-attributed.",
  },
  {
    id: "holdings", label: "Holdings", key: "Portfolio.Holdings", status: "modeled",
    officialSource: "AMC monthly portfolio disclosure (full list, XLS/XLSX)", secondarySource: "AMC factsheet (top-10 only, PDF)",
    backupSource: null, refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "high",
    notes: "26/14,224 schemes (0.18%). Current pipeline only ever attempts the factsheet's abbreviated top-10 PDF table — never the full XLS disclosure, which is the actually-complete source.",
  },
  {
    id: "sector_allocation", label: "Sector Allocation", key: "Portfolio.Sector Allocation", status: "modeled",
    officialSource: "AMC factsheet (summary)", secondarySource: "Derived from full monthly portfolio disclosure",
    backupSource: null, refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "152/14,224 (1.07%). Known contamination defect: at least one record has a subtotal row and a stock name bleeding into the sector list — not yet fixed by the validator.",
  },
  {
    id: "asset_allocation", label: "Asset Allocation (equity/debt/cash split)", key: null, status: "no_schema",
    officialSource: "AMC factsheet (mandate) + monthly portfolio disclosure (actual)", secondarySource: null,
    backupSource: null, refreshFrequency: "monthly (actual) / static (mandate)", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "No schema slot. assetClass (Equity/Debt/Hybrid/Other) is a category-level classification, not a per-scheme percentage breakdown — a different field from what's asked here. Mandate range and actual current split are two distinct things that must not be conflated.",
  },
  {
    id: "portfolio_turnover", label: "Portfolio Turnover", key: null, status: "no_schema",
    officialSource: "AMC factsheet", secondarySource: null, backupSource: null,
    refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "No schema slot anywhere. Not currently extracted by any adapter.",
  },
  {
    id: "duration", label: "Duration", key: null, status: "no_schema",
    officialSource: "AMC factsheet (debt schemes' \"portfolio characteristics\" box)", secondarySource: "Derivable from full monthly portfolio disclosure",
    backupSource: null, refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "No schema slot. Debt-fund-specific — addressable denominator is ~6,900 debt/hybrid schemes, still 0% of that narrower base.",
  },
  {
    id: "yield", label: "Yield (YTM)", key: null, status: "no_schema",
    officialSource: "AMC factsheet, same box as Duration", secondarySource: null, backupSource: null,
    refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "No schema slot. Debt-fund-specific.",
  },
  {
    id: "average_maturity", label: "Average Maturity", key: null, status: "no_schema",
    officialSource: "AMC factsheet, same box as Duration", secondarySource: "Derivable from full monthly portfolio disclosure",
    backupSource: null, refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "No schema slot. Debt-fund-specific.",
  },
  {
    id: "modified_duration", label: "Modified Duration", key: null, status: "no_schema",
    officialSource: "AMC factsheet, same box as Duration", secondarySource: null, backupSource: null,
    refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "No schema slot. Debt-fund-specific. Not every AMC discloses this distinctly from Macaulay duration — must verify per-AMC before assuming universal availability.",
  },
  {
    id: "credit_quality", label: "Credit Quality", key: null, status: "no_schema",
    officialSource: "AMC factsheet (\"rating profile\" / \"asset quality\" table)", secondarySource: "Derivable from full monthly portfolio disclosure",
    backupSource: null, refreshFrequency: "monthly", isPrimaryOfficial: true, extractionComplexity: "high",
    notes: "No schema slot. Debt-fund-specific. Requires table extraction plus rating-agency-name normalization (CRISIL AAA vs ICRA AAA vs CARE AAA must map to one canonical grade).",
  },
  {
    id: "ratings", label: "Ratings (CRISIL / star ratings)", key: null, status: "blocked_by_license",
    officialSource: "A licensed data feed or API from the rating agency itself", secondarySource: null,
    backupSource: null, refreshFrequency: "varies by provider", isPrimaryOfficial: false, extractionComplexity: "blocked",
    notes: "0% by design, not a gap — MF Pulse has no CRISIL/Morningstar/Value Research license and does not scrape or infer these ratings from any source (confirmed by repo-wide grep). MF Pulse's own internal rating (qualityEngine.js, 8 dimensions) is a separate thing, not measured by this coverage audit since it's JS-computed and the audit engine is Python.",
  },
  {
    id: "fund_objective", label: "Fund Objective", key: null, status: "not_yet_assessed",
    officialSource: "SID (\"Investment Objective\" section)", secondarySource: "AMC factsheet (short summary line)",
    backupSource: null, refreshFrequency: "static", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "Not checked by any prior coverage audit pass — genuinely unassessed, not just unpopulated. No SID-text ingestion exists anywhere in this codebase, so real coverage is very likely 0%, but that has not been directly measured.",
  },
  // Data Platform Mission 2 (2026-07-19): the audit engine (scripts/market_coverage_audit.py's
  // FIELDS dict) already computes Launch Date / SIP Minimum / Lumpsum Minimum coverage and has
  // for a while — they were simply never added here, so their real numbers sat unused in
  // fieldCoverage.json and never reached the dashboard. Adding them required no new ingestion,
  // only wiring already-live data through.
  {
    id: "launch_date", label: "Launch Date", key: "Metadata.Launch Date", status: "modeled",
    officialSource: "AMC factsheet", secondarySource: "SID", backupSource: null,
    refreshFrequency: "static", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "SBI-only pilot (152/14,227 = 1.07%), same denominator as every other factsheet-sourced field. Was already extracted and provenance-tracked (ingestion/factsheet/provenance.py's TRACKED_FIELDS) before this registry entry existed.",
  },
  {
    id: "minimum_sip", label: "Minimum SIP", key: "Metadata.SIP Minimum", status: "modeled",
    officialSource: "AMC factsheet", secondarySource: "AMC scheme page", backupSource: null,
    refreshFrequency: "static (event-driven on rare change)", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "Has a schema slot (SchemeMetadata.minimum_sip) and provenance tracking already wired, but the SBI adapter's regex never matches it in practice — confirmed 0.0% (0/152) even within the pilot AMC, unlike every other tracked field. The extraction pattern itself needs fixing before this can move, not a new source.",
  },
  {
    id: "minimum_investment", label: "Minimum Investment (lumpsum)", key: "Metadata.Lumpsum Minimum", status: "modeled",
    officialSource: "AMC factsheet", secondarySource: "AMC scheme page", backupSource: null,
    refreshFrequency: "static (event-driven on rare change)", isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "Same schema slot / provenance wiring as Minimum SIP (SchemeMetadata.minimum_lumpsum); same 0.0% (0/152) result, same fix required (adapter regex, not sourcing).",
  },
  {
    id: "entry_load", label: "Entry Load", key: null, status: "not_applicable",
    officialSource: "N/A — banned by SEBI for all schemes since 2009", secondarySource: null, backupSource: null,
    refreshFrequency: "n/a", isPrimaryOfficial: true, extractionComplexity: "n/a",
    notes: "Not a data gap: SEBI circular SEBI/IMD/CIR No.4/168230/09 (30 Jun 2009) abolished entry loads industry-wide. Every scheme in the current AMFI universe post-dates or continues past that ban, so the true value is uniformly zero — citable as a regulatory fact, not something to extract per scheme. Do not build an ingestion path for this; a static citation is the entire correct answer, same treatment as ELSS lock-in.",
  },
  {
    id: "manager_history", label: "Manager History (tenure over time)", key: null, status: "no_schema",
    officialSource: "SAI (Statement of Additional Information) — full tenure history per manager",
    secondarySource: null, backupSource: null, refreshFrequency: "static, append-only as changes occur",
    isPrimaryOfficial: true, extractionComplexity: "high",
    notes: "Distinct field from Fund Manager above (which is current-manager-only, 0.08% covered). This needs a one-to-many table (scheme -> manager -> tenure start/end), not a new column on the existing metadata row — no SAI ingestion exists anywhere in this codebase. Natural fit for the Change Detection engine (manager-change events) once that exists, rather than a one-time backfill.",
  },
  {
    id: "scheme_status", label: "Scheme Status (active / closed / merged)", key: null, status: "no_schema",
    officialSource: "Derived — AMFI's daily NAV feed only ever lists currently-active schemes; it has no explicit status field",
    secondarySource: "AMC scheme-closure / merger circulars (irregular, not a structured feed)",
    backupSource: null, refreshFrequency: "daily (as a diff, not a fetched field)", isPrimaryOfficial: true, extractionComplexity: "medium",
    notes: "Not extractable from any single day's snapshot — a scheme's status can only be inferred from presence/absence across consecutive days (present yesterday, absent today = closed or merged). Requires day-over-day diffing against dim_scheme, which is exactly what Mission 6 (Change Detection) needs to exist anyway — do not build a separate one-off mechanism for this field.",
  },
  {
    id: "fund_age", label: "Fund Age", key: null, status: "no_schema",
    officialSource: "Computed — today's date minus Launch Date, no external source needed",
    secondarySource: null, backupSource: null, refreshFrequency: "daily (trivially, alongside any page render)",
    isPrimaryOfficial: true, extractionComplexity: "low",
    notes: "Not an acquisition gap at all — it's arithmetic on a field that already exists (Launch Date, 1.07% covered today). Coverage will track Launch Date's exactly, for free, the moment a UI surface computes it. Listed separately here only because the brief names it as its own field; do not scope this as an ingestion task in the roadmap.",
  },
];

export function fieldById(id) {
  return FIELD_REGISTRY.find((f) => f.id === id) || null;
}

// Confidence methodology — unchanged from Trust Sprint Mission 1 / docs/DATA_COVERAGE_MATRIX.md,
// applied identically to every field: High = coverage >=90% AND validated AND primary official
// source. Medium = coverage >=40% AND (validated OR primary source). Low = below both thresholds
// but non-zero. N/A = 0% populated (or no schema slot / license-blocked) — nothing to be
// confident about yet. `validated` is per-field, not assumed uniform: Sector Allocation has a
// known, not-yet-fixed contamination defect (see its `notes`), so it can't claim validated.
const UNVALIDATED_IDS = new Set(["sector_allocation"]);

export function computeConfidence(entry, coveragePct) {
  if (entry.status === "no_schema" || entry.status === "not_yet_assessed" || entry.status === "blocked_by_license" || entry.status === "not_applicable") return "N/A";
  if (coveragePct == null || coveragePct === 0) return "N/A";
  const validated = !UNVALIDATED_IDS.has(entry.id);
  const primary = !!entry.isPrimaryOfficial;
  if (coveragePct >= 90 && validated && primary) return "High";
  if (coveragePct >= 40 && (validated || primary)) return "Medium";
  return "Low";
}
