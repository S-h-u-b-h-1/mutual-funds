export const STOCK_STRATEGIES = [
  {
    key: "quality-compounder",
    name: "Quality compounder",
    horizon: "3–7 years",
    question: "Can the business reinvest at attractive returns without weakening its balance sheet?",
    evidence: ["5–10 year sales and profit growth", "ROCE and ROE through a cycle", "Operating cash flow versus profit", "Reinvestment runway and market share"],
    reject: "Falling returns on capital, persistent cash-conversion gaps or growth funded mainly by dilution.",
  },
  {
    key: "growth-at-a-reasonable-price",
    name: "Growth at a reasonable price",
    horizon: "2–5 years",
    question: "Is durable earnings growth available without paying for an implausible future?",
    evidence: ["Revenue and EPS growth consistency", "Forward valuation versus own history and peers", "Margin durability", "Reverse-DCF expectations"],
    reject: "A valuation that needs exceptional growth while earnings revisions or margins are weakening.",
  },
  {
    key: "earnings-acceleration",
    name: "Earnings acceleration",
    horizon: "2–8 quarters",
    question: "Are revenue, margins and earnings improving together for explainable reasons?",
    evidence: ["YoY and sequential revenue growth", "EBITDA-margin direction", "Order book or volume indicators", "Estimate revisions and management guidance"],
    reject: "One-off income, working-capital stress or a price move unsupported by operating improvement.",
  },
  {
    key: "balance-sheet-resilience",
    name: "Balance-sheet resilience",
    horizon: "Full cycle",
    question: "Can the company survive a difficult cycle without forced capital raising?",
    evidence: ["Net debt and interest coverage", "Liquidity and maturity profile", "Free-cash-flow stability", "Contingent liabilities and pledging"],
    reject: "Refinancing dependence, weak interest coverage, hidden guarantees or persistent negative free cash flow.",
  },
  {
    key: "cyclical-inflection",
    name: "Cyclical inflection",
    horizon: "1–4 years",
    question: "Are utilisation, pricing and spreads turning before reported profit peaks?",
    evidence: ["Capacity utilisation and volumes", "Realisation versus input-cost spreads", "Inventory and working-capital cycle", "Industry supply additions"],
    reject: "Buying peak margins as if permanent, or confusing commodity-price inflation with volume growth.",
  },
  {
    key: "cash-yield",
    name: "Cash yield & capital return",
    horizon: "3–7 years",
    question: "Is distributable cash durable after maintenance investment and balance-sheet needs?",
    evidence: ["Free cash flow after maintenance capex", "Dividend and buyback history", "Payout coverage", "Capital-allocation record"],
    reject: "A high historical yield funded by debt, asset sales or temporarily elevated commodity earnings.",
  },
];

const sectorRules = [
  { pattern: /bank|finance|insurance|financial/i, keys: ["quality-compounder", "balance-sheet-resilience", "growth-at-a-reasonable-price"], note: "For financials, replace industrial debt ratios with asset quality, capital adequacy, liability franchise, credit cost and underwriting evidence." },
  { pattern: /metal|mining|oil|gas|power|cement|commodity/i, keys: ["cyclical-inflection", "balance-sheet-resilience", "cash-yield"], note: "For cyclicals, normalise margins across a cycle and separate volume, realisation and input-cost effects." },
  { pattern: /software|technology|telecom|consumer|pharma|health|services/i, keys: ["quality-compounder", "growth-at-a-reasonable-price", "earnings-acceleration"], note: "Prioritise organic growth, customer or product concentration, unit economics and the durability of reinvestment returns." },
  { pattern: /auto|capital goods|construction|industrial|manufactur|realty/i, keys: ["earnings-acceleration", "cyclical-inflection", "balance-sheet-resilience"], note: "Track order conversion, utilisation, working capital and input-cost pass-through before relying on headline earnings." },
];

export function getStrategiesForIndustry(industry = "") {
  const rule = sectorRules.find((item) => item.pattern.test(industry)) || {
    keys: ["quality-compounder", "growth-at-a-reasonable-price", "balance-sheet-resilience"],
    note: "Use the company’s actual business model and reporting cadence; the same ratio can mean different things across industries.",
  };
  return {
    note: rule.note,
    strategies: rule.keys.map((key) => STOCK_STRATEGIES.find((strategy) => strategy.key === key)).filter(Boolean),
  };
}

export const RESEARCH_LAYERS = [
  ["Price & volume", "TradingView chart", "Available through embedded market view; timing and exchange entitlements apply."],
  ["Financial statements", "Licensed normalized feed", "Not scored until comparable statements and restatements are contracted."],
  ["Filings & ownership", "NSE / BSE", "Primary-source routes are available for manual verification."],
  ["News & events", "Attributed publishers", "Only deterministically linked articles appear; absence does not mean no news."],
  ["Valuation & peers", "Normalized fundamentals", "Framework is ready; numeric verdicts remain withheld without a contracted dataset."],
];
