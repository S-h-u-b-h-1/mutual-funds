// Tax Intelligence (Investment Operating System mission, Phase 9) — deterministic, no AI.
// Classifies each real held category (report.allocations.category — real weights, real values)
// into its real Indian capital-gains tax treatment for FY 2026-27, verified live against SBI
// Mutual Fund's official "Mutual Funds Tax Reckoner 2026-27" (Income-tax Act, 2025 / Finance Act,
// 2026). Category-level only, portfolio-weighted — never a specific fund, never a return/gain
// estimate. This app does not track each holding's actual purchase date, so it reports the RULE
// that determines short-term vs long-term status rather than asserting which one applies to your
// specific units — the same honesty convention already used for sector-allocation coverage
// gaps elsewhere in this engine.

const TAX_TREATMENTS = {
  equityOriented: {
    label: "Equity-oriented fund",
    ltcgHoldingPeriod: "More than 12 months",
    ltcgRate: "12.5% on gains above ₹1.25 lakh/year (₹1.25 lakh/year exempt)",
    stcgHoldingPeriod: "12 months or less",
    stcgRate: "20%",
    note: "At least 65% of the fund's assets are in domestic listed equity (or, for Arbitrage funds, hedged equity + derivative positions) — the tax treatment for Large/Mid/Small/Multi/Flexi Cap, Sectoral/Thematic, Equity ETF, Arbitrage, and ELSS funds.",
  },
  hybridDependent: {
    label: "Hybrid fund (depends on the fund's actual equity allocation)",
    ltcgHoldingPeriod: "More than 12 months if the fund holds ≥65% equity, otherwise more than 24 months",
    ltcgRate: "12.5% (exempt up to ₹1.25 lakh/year if equity-oriented)",
    stcgHoldingPeriod: "12 months or less if ≥65% equity, otherwise 24 months or less",
    stcgRate: "20% if equity-oriented, otherwise your income tax slab rate",
    note: "Hybrid funds are taxed as equity-oriented only when the fund's own average equity allocation is 65%+ — Aggressive Hybrid funds usually qualify, Conservative/Balanced Hybrid usually don't. This app does not track each fund's exact average equity allocation, so check your fund's factsheet to know which rule applies to it.",
  },
  specifiedDebt: {
    label: "Specified Mutual Fund (Debt)",
    ltcgHoldingPeriod: "N/A for units bought on/after 1 Apr 2023 (see note)",
    ltcgRate: "N/A",
    stcgHoldingPeriod: "Always, if purchased on/after 1 April 2023",
    stcgRate: "Your income tax slab rate",
    note: "Funds investing 65%+ in debt/money-market instruments and purchased on or after 1 April 2023 are always treated as short-term and taxed at your slab rate, no matter how long you hold them. Units purchased before 1 April 2023 instead get long-term treatment (12.5%, no indexation) after 12 months (if exchange-listed) or 24 months (if not). This app does not track purchase dates — check your statement to see which rule applies to your units.",
  },
  otherFund: {
    label: "Other fund (Gold, International, Multi-Asset)",
    ltcgHoldingPeriod: "More than 12 months if exchange-listed (e.g. a Gold ETF), otherwise more than 24 months",
    ltcgRate: "12.5%, without indexation",
    stcgHoldingPeriod: "12 months or less if exchange-listed, otherwise 24 months or less",
    stcgRate: "Your income tax slab rate",
    note: "Funds with under 65% in domestic equity and under 65% in debt — typically Gold/Silver funds and Fund-of-Funds investing domestically or overseas. Whether the shorter (listed, e.g. a Gold ETF) or longer (unlisted fund-of-funds) holding-period threshold applies depends on your specific fund's structure.",
  },
};

// Ordered, first match wins — same explainable-keyword-matching style as healthReport.js's
// CANONICAL_CATEGORIES, but a genuinely different classification axis (equity/debt/other tax
// treatment, not diversification bucket) over the same raw AMFI category string. Sectoral/
// Thematic and ELSS funds are a clear example of why this can't just reuse
// categoryToCanonicalBucket(): they carry no canonical diversification bucket today, but their
// tax treatment (equity-oriented) is unambiguous.
//
// Verified against every distinct category string in this app's real fund universe (51 values),
// not written from a generic taxonomy — see the "unmatched" list below for what's deliberately
// left unclassified rather than guessed.
//
// "etf" is intentionally NOT a standalone keyword: this dataset has Equity ETF, Debt ETF, Gold
// ETF, and Other ETFs as four genuinely different tax treatments, so a bare "etf" match would
// have put Gold ETF and Debt ETF through equity-oriented rules first (first-match-wins) — a real
// misclassification caught while cross-checking this map against the live category list.
//
// Deliberately left unclassified (contributes to unclassifiedPct, never guessed): Children's,
// Retirement, Equity Savings, Growth, Other  ETFs — each is genuinely fund-specific (solution-
// oriented lock-in schemes, or a category too broad to imply one tax treatment) or, for "Growth",
// likely a plan/option label leaking into the category field rather than a real category.
const CATEGORY_TAX_MAP = [
  { test: /elss|tax sav/i, treatment: "equityOriented", isElss: true },
  { test: /large cap|mid cap|small cap|multi cap|flexi cap|focused|value|contra|dividend yield|sectoral|thematic|index|equity etf|equitys|arbitrage/i, treatment: "equityOriented" },
  { test: /hybrid|balanced advantage|multi asset/i, treatment: "hybridDependent" },
  { test: /debt|gilt|liquid|corporate bond|money market|banking and psu|credit risk|overnight|bond|floater|floating rate|income|duration|short term/i, treatment: "specifiedDebt" },
  { test: /gold|international|overseas|global|fund of|\bfof\b/i, treatment: "otherFund" },
];

function classifyCategory(categoryRaw) {
  const cat = categoryRaw || "";
  for (const rule of CATEGORY_TAX_MAP) {
    if (rule.test.test(cat)) return { treatment: rule.treatment, isElss: !!rule.isElss };
  }
  return { treatment: null, isElss: false };
}

export function buildTaxProfile(report) {
  if (!report) return null;
  const categories = report.allocations?.category || [];

  const byCategory = categories.map((c) => {
    const { treatment, isElss } = classifyCategory(c.name);
    return { category: c.name, weightPct: c.weight, valueInr: c.value, treatment, treatmentDetail: treatment ? TAX_TREATMENTS[treatment] : null, isElss };
  });

  const weightByTreatment = {};
  let unclassifiedPct = 0;
  for (const row of byCategory) {
    if (row.treatment) weightByTreatment[row.treatment] = (weightByTreatment[row.treatment] || 0) + row.weightPct;
    else unclassifiedPct += row.weightPct;
  }

  const rollup = Object.entries(weightByTreatment)
    .map(([treatment, weightPct]) => ({ treatment, ...TAX_TREATMENTS[treatment], weightPct: +weightPct.toFixed(1) }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const elssHoldings = byCategory.filter((r) => r.isElss);

  return {
    byCategory,
    rollup,
    unclassifiedPct: +unclassifiedPct.toFixed(1),
    elss: {
      held: elssHoldings.length > 0,
      holdings: elssHoldings.map((r) => ({ category: r.category, weightPct: r.weightPct })),
      note: elssHoldings.length > 0
        ? "ELSS funds qualify for a deduction of up to ₹1.5 lakh/year under Section 123 of the Income-tax Act, 2025 (the section formerly numbered 80C) — but only if you file under the old tax regime. Each ELSS purchase, including each individual SIP instalment, is separately locked in for 3 years from its own purchase date."
        : "No ELSS holdings detected in this portfolio. ELSS is the only equity category with a mandatory lock-in — it also carries a Section 123 (formerly 80C) deduction of up to ₹1.5 lakh/year, but only under the old tax regime.",
    },
    exitLoadGuidance: "Exit load is fund-specific and not yet available from this app's factsheet data for your holdings — check your fund's factsheet or the AMC's website for the exact figure. As a general market convention (not specific to your funds): open-ended equity funds typically charge around 1% if redeemed within 12 months and nil after; liquid/overnight debt funds typically charge a small graded load only in the first few days; most other debt funds charge nil to 1% within the first 6-12 months.",
    methodology: "Classifies each real held category (report.allocations.category, real portfolio weights) into its Income-tax Act, 2025 / Finance Act 2026 treatment for FY 2026-27, verified against SBI Mutual Fund's official Tax Reckoner FY 2026-27 — category-level only, never a specific fund. This app does not track each holding's purchase date, so it states which rule determines short-term vs long-term status rather than asserting which one applies to your specific units. All rates are before surcharge and Health & Education Cess (4%), and assume resident individual taxpayer status — consult a tax advisor for your specific position.",
  };
}
