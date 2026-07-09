import { RULE_META, SECTOR_MAP } from "../marketImpact";
import { getMetadata } from "../metadata";

// Phase C — Exposure Engine. Reuses the news engine's own RULE_META rule_ids and SECTOR_MAP
// (marketImpact.js) rather than inventing a parallel taxonomy — each theme below cites the exact
// rule_id(s) whose `chain` names it, and the category/sector keywords are a direct
// operationalization of what that chain already asserts (e.g. rbi_rate_action's chain names
// "Debt funds, Banking sector, Liquid funds, Gilt funds" — that's where this theme's mapping
// comes from, not a separate judgment call).
//
// Three of the requested themes (PSU, Budget, Elections) have NO corresponding rule_id in
// RULE_META today — there is no real rule that ever fires for them. Per this codebase's existing
// convention (see marketImpact.js's SECTOR_MAP comment on Commodities/Transport/Export-linked),
// an unmapped theme returns { available: false } honestly rather than a fabricated number.
export const THEME_MAPPING = {
  RBI: { ruleIds: ["liquidity_rbi"], sectorKey: null, categoryKeywords: ["liquid", "overnight", "money market"] },
  "Interest Rates": { ruleIds: ["rbi_rate_action"], sectorKey: "Banking", categoryKeywords: ["debt", "gilt", "liquid"] },
  Banking: { ruleIds: ["banking_earnings"], sectorKey: "Banking", categoryKeywords: ["large cap", "banking"] },
  IT: { ruleIds: ["it_sector"], sectorKey: "IT", categoryKeywords: ["large cap", "flexi cap", "technology"] },
  Auto: { ruleIds: ["auto_sector"], sectorKey: "Auto", categoryKeywords: ["sectoral", "thematic", "auto"] },
  Healthcare: { ruleIds: ["pharma_sector"], sectorKey: "Healthcare", categoryKeywords: ["sectoral", "thematic", "healthcare", "pharma"] },
  Energy: { ruleIds: ["oil_price"], sectorKey: "Energy", categoryKeywords: ["large cap", "sector", "energy"] },
  Inflation: { ruleIds: ["inflation_data"], sectorKey: null, categoryKeywords: ["debt", "gilt"] },
  "Global Markets": { ruleIds: ["fii_dii_flows", "rupee_currency", "global_cues"], sectorKey: "IT", categoryKeywords: ["large cap", "flexi cap", "mid cap"] },
};

export const UNAVAILABLE_THEMES = {
  PSU: "No rule_id in the news engine's RULE_META covers PSU-specific events yet.",
  Budget: "No rule_id in the news engine's RULE_META covers Union Budget events yet.",
  Elections: "No rule_id in the news engine's RULE_META covers election events yet.",
};

function sectorContributionPct(holding, sectorKey) {
  if (!sectorKey) return null;
  const realSectors = SECTOR_MAP[sectorKey];
  if (!realSectors) return null;
  const meta = getMetadata(holding.schemeCode);
  const allocs = (meta?.sector_allocation || []).filter((s) => realSectors.includes(s.sector) && (s.allocation_pct || 0) > 0);
  if (!allocs.length) return null;
  const pct = allocs.reduce((s, a) => s + (a.allocation_pct || 0), 0);
  return (holding.weight || 0) * (pct / 100);
}

function categoryMatches(holding, keywords) {
  const cat = (holding.category || "").toLowerCase();
  return keywords.some((k) => cat.includes(k));
}

// Takes analytics.js's already-consolidated holdings. Prefers sector-allocation precision
// (partial coverage, real factsheet data) and falls back to category-keyword matching (full
// coverage, coarser — the whole holding's weight counts, since finer-grained data isn't
// available) — never both for the same holding+theme, so a fund is never double-counted.
export function computeExposure(holdings) {
  const themes = {};

  for (const [theme, mapping] of Object.entries(THEME_MAPPING)) {
    const contributions = [];
    for (const h of holdings) {
      const sectorPct = sectorContributionPct(h, mapping.sectorKey);
      if (sectorPct != null && sectorPct > 0) {
        contributions.push({ schemeCode: h.schemeCode, schemeName: h.schemeName, contributionPct: +sectorPct.toFixed(3), method: "sector_allocation" });
      } else if (categoryMatches(h, mapping.categoryKeywords)) {
        contributions.push({ schemeCode: h.schemeCode, schemeName: h.schemeName, contributionPct: +(h.weight || 0).toFixed(3), method: "category_match" });
      }
    }
    const exposurePct = +contributions.reduce((s, c) => s + c.contributionPct, 0).toFixed(2);
    themes[theme] = {
      available: true,
      exposurePct,
      ruleIds: mapping.ruleIds,
      regulatoryWeight: Math.max(...mapping.ruleIds.map((id) => RULE_META[id]?.regulatoryWeight || 0)),
      contributions: contributions.sort((a, b) => b.contributionPct - a.contributionPct),
      summary: `${exposurePct.toFixed(0)}% of your portfolio is exposed to ${theme}.`,
    };
  }

  for (const [theme, reason] of Object.entries(UNAVAILABLE_THEMES)) {
    themes[theme] = { available: false, reason };
  }

  return {
    themes,
    methodology:
      "Each theme is mapped to the news engine's own rule_id(s) and their documented causal chain (marketImpact.js RULE_META). Exposure is computed by sector_allocation weighting where factsheet data exists, falling back to category-keyword matching otherwise. Themes with no corresponding rule_id are reported unavailable, never estimated.",
  };
}
