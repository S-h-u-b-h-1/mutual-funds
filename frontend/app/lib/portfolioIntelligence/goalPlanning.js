// Goal Planning (Investment Operating System mission, Phase 8) — deterministic, no AI. A goal is
// a documented, auditable allocation template (same spirit as recommendationEngine.js's
// CATEGORY_PROFILE, which this reuses directly rather than re-deriving risk/horizon traits per
// category). Category-level only — never a specific fund. When a real portfolio report is
// passed in, gap-vs-suggested is a live diff against actual holdings; without one, the plan
// still stands alone as a real, traceable template.
import { CATEGORY_PROFILE } from "./recommendationEngine";
import { categoryToCanonicalBucket } from "./healthReport";

export const GOALS = {
  retirement: {
    label: "Retirement", typicalHorizonYears: 20,
    allocation: [{ category: "Large Cap", pct: 30 }, { category: "Mid Cap", pct: 15 }, { category: "Debt", pct: 30 }, { category: "Hybrid", pct: 15 }, { category: "Gold", pct: 10 }],
    rationale: "Long horizon supports meaningful equity exposure early on, with Debt as the stabilising core that typically increases as retirement approaches (not modelled here — a static template, not a glide path).",
  },
  childEducation: {
    label: "Child education", typicalHorizonYears: 12,
    allocation: [{ category: "Large Cap", pct: 35 }, { category: "Mid Cap", pct: 15 }, { category: "Debt", pct: 35 }, { category: "Hybrid", pct: 15 }],
    rationale: "A fixed, foreseeable goal date argues for more Debt than a pure wealth-creation goal — the cost of a bad drawdown right before the fee is due outweighs extra growth.",
  },
  house: {
    label: "House down payment", typicalHorizonYears: 5,
    allocation: [{ category: "Debt", pct: 60 }, { category: "Hybrid", pct: 25 }, { category: "Large Cap", pct: 15 }],
    rationale: "A 5-year horizon is short for equity-heavy allocation — capital preservation matters more than growth when the goal date and amount are both fixed.",
  },
  emergencyFund: {
    label: "Emergency fund", typicalHorizonYears: 0,
    allocation: [{ category: "Debt", pct: 100 }],
    rationale: "Emergency funds need to be available on short notice without loss risk — Liquid/Overnight categories (a subset of Debt) are the structural fit, not growth-oriented categories.",
  },
  wealthCreation: {
    label: "Wealth creation", typicalHorizonYears: 15,
    allocation: [{ category: "Large Cap", pct: 25 }, { category: "Mid Cap", pct: 25 }, { category: "Small Cap", pct: 15 }, { category: "International", pct: 15 }, { category: "Debt", pct: 10 }, { category: "Gold", pct: 10 }],
    rationale: "Long horizon with no fixed withdrawal date supports the highest equity (and equity-risk-band) tilt of these templates, including Small Cap and International for growth breadth.",
  },
  taxSaving: {
    label: "Tax saving", typicalHorizonYears: 3,
    allocation: [{ category: "Large Cap", pct: 50 }, { category: "Mid Cap", pct: 30 }, { category: "Small Cap", pct: 20 }],
    rationale: "ELSS is structurally equity-only with a mandatory 3-year lock-in (Section 123 of the Income-tax Act, 2025, the section formerly numbered 80C) — the category split here reflects typical ELSS portfolio composition, not a separate asset-allocation choice; the tax benefit itself is a fund-type fact, not a return driver.",
  },
  internationalDiversification: {
    label: "International diversification", typicalHorizonYears: 7,
    allocation: [{ category: "International", pct: 60 }, { category: "Large Cap", pct: 40 }],
    rationale: "A satellite goal, not a full portfolio — sized to meaningfully reduce India/rupee concentration without becoming the dominant holding.",
  },
};

function expectedVolatilityBand(allocation) {
  const bands = allocation.map((a) => CATEGORY_PROFILE[a.category]?.riskBand).filter(Boolean);
  const rank = { low: 0, moderate: 1, high: 2, "very high": 3 };
  const weighted = allocation.reduce((s, a) => s + (rank[CATEGORY_PROFILE[a.category]?.riskBand] ?? 1) * a.pct, 0) / 100;
  if (weighted < 0.6) return "low";
  if (weighted < 1.4) return "moderate";
  if (weighted < 2.2) return "high";
  return "very high";
}

export function planGoal(goalKey, { currentAllocation = null } = {}) {
  const goal = GOALS[goalKey];
  if (!goal) return null;

  const suitableCategories = goal.allocation.map((a) => a.category);
  const unsuitableCategories = Object.keys(CATEGORY_PROFILE).filter((c) => !suitableCategories.includes(c));

  let gapVsCurrent = null;
  if (currentAllocation) {
    // currentAllocation.name is a raw AMFI category string (e.g. "Liquid", "Indexs") — bucket it
    // into the same canonical categories the goal template speaks (e.g. "Debt", "Index") before
    // diffing, via healthReport.js's own keyword-matching (categoryToCanonicalBucket), so this
    // never re-derives a second, possibly-inconsistent category mapping.
    const currentByBucket = new Map();
    for (const a of currentAllocation) {
      const bucket = categoryToCanonicalBucket(a.name);
      if (!bucket) continue; // doesn't map to any canonical bucket (e.g. Sectoral/Thematic) — excluded, not guessed
      currentByBucket.set(bucket, (currentByBucket.get(bucket) ?? 0) + a.weight);
    }
    gapVsCurrent = goal.allocation.map((target) => {
      const current = currentByBucket.get(target.category) ?? 0;
      return { category: target.category, targetPct: target.pct, currentPct: +current.toFixed(1), gapPct: +(target.pct - current).toFixed(1) };
    });
  }

  return {
    goal: goal.label,
    typicalHorizonYears: goal.typicalHorizonYears,
    suggestedAllocation: goal.allocation,
    expectedVolatility: expectedVolatilityBand(goal.allocation),
    suitableCategories,
    unsuitableCategories,
    rationale: goal.rationale,
    gapVsCurrent,
    methodology: "A documented allocation template per goal, not a live optimisation — category-level only, never a specific fund. Expected volatility is a weighted read of each category's real risk band (recommendationEngine.js's CATEGORY_PROFILE), not a simulated figure. Gap-vs-current, when shown, is a direct diff against your real current category allocation.",
  };
}
