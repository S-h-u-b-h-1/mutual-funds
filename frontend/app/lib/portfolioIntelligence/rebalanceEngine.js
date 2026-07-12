// Rebalancing Engine (Investment Operating System mission, Phase 7) — deterministic threshold
// rules over buildHealthReport()'s already-computed allocations/overlap/missingCategories. No
// new calculations: every action's number is a direct read from the report, never recomputed or
// estimated. Category/AMC-level only (same compliance rule as recommendationEngine.js) — never
// tells the investor which specific fund to sell, only which real exposure to reconsider.

const AMC_REDUCE_THRESHOLD = 40; // % of portfolio with one AMC
const CATEGORY_REDUCE_THRESHOLD = 50; // % of portfolio in one category
const THEME_REDUCE_THRESHOLD = 40; // % exposure to one rule-based theme (mirrors healthReport.js's own weakness threshold)

export function generateRebalanceActions(report) {
  if (!report) return null;
  const actions = [];

  for (const amc of report.allocations?.amc || []) {
    if (amc.weight >= AMC_REDUCE_THRESHOLD) {
      actions.push({
        action: "reduce", targetType: "AMC", target: amc.name, currentWeightPct: amc.weight,
        why: `${amc.weight.toFixed(1)}% of your portfolio is with ${amc.name} — a single AMC this dominant concentrates fund-manager, process, and house-level risk, regardless of how many funds you hold there.`,
        severity: amc.weight >= 60 ? "high" : "medium",
      });
    }
  }

  for (const cat of report.allocations?.category || []) {
    if (cat.weight >= CATEGORY_REDUCE_THRESHOLD) {
      actions.push({
        action: "reduce", targetType: "Category", target: cat.name, currentWeightPct: cat.weight,
        why: `${cat.weight.toFixed(1)}% of your portfolio is in ${cat.name} — this concentrates you in one category's risk/return profile even if the underlying funds differ.`,
        severity: cat.weight >= 70 ? "high" : "medium",
      });
    }
  }

  for (const [theme, t] of Object.entries(report.exposure || {})) {
    if (t.available && t.exposurePct >= THEME_REDUCE_THRESHOLD) {
      actions.push({
        action: "reduce", targetType: "Theme", target: theme, currentWeightPct: t.exposurePct,
        why: `${t.exposurePct.toFixed(1)}% of your portfolio is exposed to the ${theme} theme — a single market/regulatory event in this area would move a large share of your holdings together.`,
        severity: t.exposurePct >= 60 ? "high" : "medium",
      });
    }
  }

  for (const category of report.missingCategories || []) {
    actions.push({
      action: "increase", targetType: "Category", target: category, currentWeightPct: 0,
      why: `No exposure to ${category} detected — increasing from zero would add a genuinely new source of diversification, not just more of what you already hold.`,
      severity: "low",
    });
  }

  for (const dup of report.overlap?.duplicateFunds || []) {
    actions.push({
      action: "consolidate", targetType: "Fund", target: dup.schemeName, currentWeightPct: dup.totalWeightPct,
      why: `Held via ${dup.occurrences.length} separate sources/folios — consolidating into one doesn't change your actual exposure, but simplifies tracking and avoids double-counting risk.`,
      severity: "low",
    });
  }

  // Everything not flagged above is implicitly "maintain" — stated explicitly so the investor
  // sees a complete picture (reduce + increase + maintain), not just the parts with a warning.
  const flaggedNames = new Set(actions.filter((a) => a.action === "reduce").map((a) => `${a.targetType}:${a.target}`));
  const maintain = [
    ...(report.allocations?.amc || []).filter((a) => a.weight < AMC_REDUCE_THRESHOLD && !flaggedNames.has(`AMC:${a.name}`)).map((a) => ({ targetType: "AMC", target: a.name, currentWeightPct: a.weight })),
    ...(report.allocations?.category || []).filter((c) => c.weight < CATEGORY_REDUCE_THRESHOLD && !flaggedNames.has(`Category:${c.name}`)).map((c) => ({ targetType: "Category", target: c.name, currentWeightPct: c.weight })),
  ];

  return {
    reduce: actions.filter((a) => a.action === "reduce").sort((a, b) => b.currentWeightPct - a.currentWeightPct),
    increase: actions.filter((a) => a.action === "increase"),
    consolidate: actions.filter((a) => a.action === "consolidate"),
    maintain,
    methodology: `Reduce: AMC ≥${AMC_REDUCE_THRESHOLD}%, category ≥${CATEGORY_REDUCE_THRESHOLD}%, or theme exposure ≥${THEME_REDUCE_THRESHOLD}% of portfolio value. Increase: real missing category buckets (buildHealthReport.js). Consolidate: the same fund reachable via more than one source/folio. Every percentage is a direct read from the already-computed report — no new estimation.`,
  };
}
