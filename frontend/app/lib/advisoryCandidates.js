import { allFunds } from "./funds";
import { categoryFamily } from "./advisoryEngine";

function evidenceScore(fund) {
  return (
    (Number.isFinite(fund.catPct) ? fund.catPct * 0.35 : 12) +
    (Number.isFinite(fund.consistency) ? fund.consistency * 0.25 : 8) +
    (Number.isFinite(fund.r3y) ? 12 : 0) +
    (Number.isFinite(fund.r5y) ? 9 : 0) +
    Math.min(12, Number(fund.obs || 0) / 8) -
    Math.max(0, Number(fund.staleDays || 0) * 2)
  );
}
function shortName(name = "") {
  return name
    .replace(/\s*-\s*Direct Plan/gi, "")
    .replace(/\s*-\s*(Growth Option|Growth)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function advisoryCandidateSet() {
  const groups = new Map();
  for (const fund of allFunds()) {
    const family = categoryFamily(fund.category);
    if (!family || !fund.active || !fund.isDirect || !fund.isGrowth || fund.structure !== "Open-Ended") continue;
    if (!Number.isFinite(fund.r1y) || !Number.isFinite(fund.vol90) || Number(fund.obs || 0) < 60) continue;
    const group = groups.get(family) || [];
    group.push(fund);
    groups.set(family, group);
  }

  return [...groups.entries()].flatMap(([family, funds]) =>
    funds
      .sort((a, b) => evidenceScore(b) - evidenceScore(a))
      .slice(0, 4)
      .map((fund) => ({
        code: fund.code,
        name: fund.name,
        shortName: shortName(fund.name),
        amc: fund.amc,
        category: fund.category,
        family,
        navDate: fund.navDate,
        r1y: fund.r1y,
        r3y: fund.r3y,
        r5y: fund.r5y,
        vol90: fund.vol90,
        maxdd90: fund.maxdd90,
        consistency: fund.consistency,
        catPct: fund.catPct,
        obs: fund.obs,
      }))
  );
}
