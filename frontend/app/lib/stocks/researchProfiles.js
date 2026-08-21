import { createRequire } from "module";
const require = createRequire(import.meta.url);
const profiles = require("../../data/stock_profiles.json");

const DEFAULT_MODEL = {
  model: "Map products, customers, pricing power, capacity and the reinvestment required to grow.",
  drivers: ["Volume or customer growth", "Realisation and product mix", "Operating leverage", "Working-capital discipline"],
  kpis: ["Revenue growth", "Operating margin", "ROCE", "Cash conversion", "Net debt"],
  risks: ["Demand slowdown", "Margin pressure", "Poor capital allocation", "Governance or disclosure gaps"],
  valuation: ["P/E versus growth and own history", "EV/EBITDA where capital intensity matters", "Reverse-DCF expectations"],
};

export const INDUSTRY_RESEARCH_MODELS = {
  "Financial Services": {
    model: "Separate lenders, insurers and diversified finance businesses; study how they price risk, fund growth and protect capital.",
    drivers: ["Loan or premium growth", "Funding mix and cost", "Underwriting quality", "Fee income and operating leverage"],
    kpis: ["NIM / VNB margin", "GNPA and credit cost", "CASA or persistency", "Capital adequacy / solvency", "ROA and ROE"],
    risks: ["Asset-quality deterioration", "Asset-liability mismatch", "Concentration", "Regulatory and provisioning changes"],
    valuation: ["P/B versus sustainable ROE", "P/E versus credit-cost cycle", "Embedded value for insurers"],
  },
  "Information Technology": {
    model: "Study recurring client demand, contract quality, talent economics and how efficiently delivery capacity converts into cash.",
    drivers: ["Constant-currency growth", "Large-deal conversion", "Utilisation and pricing", "Digital and geography mix"],
    kpis: ["Organic growth", "EBIT margin", "Attrition", "Top-client concentration", "FCF conversion"],
    risks: ["Client budget cuts", "Vendor consolidation", "Wage pressure", "Automation and currency sensitivity"],
    valuation: ["P/E versus organic growth", "FCF yield", "EV/EBIT with margin scenarios"],
  },
  "Consumer Discretionary": {
    model: "Decompose growth into units, price and mix; then test brand strength, distribution economics and replacement cycles.",
    drivers: ["Volume and premiumisation", "Distribution expansion", "Raw-material costs", "Consumer credit and demand"],
    kpis: ["Volume growth", "Gross-margin bridge", "Market share", "Inventory days", "ROCE"],
    risks: ["Demand deferral", "Input-cost inflation", "Price-led share loss", "Channel inventory build-up"],
    valuation: ["P/E versus volume growth", "EV/EBITDA versus margin normalisation", "FCF yield"],
  },
  "Fast Moving Consumer Goods": {
    model: "Track everyday demand, brand and distribution strength, innovation, pricing power and advertising efficiency.",
    drivers: ["Underlying volume growth", "Rural and urban demand", "Price/mix", "Commodity-cost cycle"],
    kpis: ["Volume growth", "Gross margin", "Market share", "Ad spend / sales", "Working-capital days"],
    risks: ["Down-trading", "Commodity inflation", "Weak innovation", "Distribution disruption"],
    valuation: ["P/E versus volume and EPS durability", "FCF yield", "Implied long-term growth"],
  },
  Healthcare: {
    model: "Separate branded medicines, generics, hospitals and diagnostics; product economics and regulation differ materially.",
    drivers: ["Therapy or geography mix", "New launches", "Occupancy or utilisation", "Pricing and regulatory approvals"],
    kpis: ["Organic sales growth", "R&D intensity", "EBITDA margin", "Regulatory observations", "ROCE"],
    risks: ["Regulatory action", "Price erosion", "Product concentration", "Execution on capacity and launches"],
    valuation: ["P/E versus pipeline quality", "EV/EBITDA for hospitals", "Scenario-adjusted earnings"],
  },
  Commodities: {
    model: "Normalise profits across the commodity cycle and locate assets on the cost curve before interpreting headline earnings.",
    drivers: ["Volume and utilisation", "Realisation minus input spread", "Cost-curve position", "Capacity additions"],
    kpis: ["Production volume", "Unit cost", "EBITDA per tonne", "Net debt", "Maintenance capex"],
    risks: ["Peak-cycle extrapolation", "Global oversupply", "Energy and logistics cost", "High leverage"],
    valuation: ["Mid-cycle EV/EBITDA", "Replacement value", "FCF yield at normalised prices"],
  },
  Energy: {
    model: "Separate upstream, refining, marketing and renewables; each has different price, spread and capital-cycle exposure.",
    drivers: ["Production or throughput", "Crack spreads and marketing margins", "Commodity prices", "Project commissioning"],
    kpis: ["Volume", "Realisation", "Refining/marketing margin", "Net debt", "ROCE"],
    risks: ["Commodity reversal", "Policy intervention", "Project overruns", "Energy-transition capital misallocation"],
    valuation: ["Sum of parts", "Normalised EV/EBITDA", "Dividend and FCF yield"],
  },
  Utilities: {
    model: "Test the regulatory return model, fuel availability, contracted capacity and whether cash collection funds the capital plan.",
    drivers: ["Capacity and PLF", "Regulated tariff", "Fuel cost and availability", "Receivable collection"],
    kpis: ["Generation / sales volume", "PLF", "Receivable days", "Net debt/EBITDA", "Regulated ROE"],
    risks: ["Delayed tariffs", "Counterparty receivables", "Fuel shortage", "Debt-funded project slippage"],
    valuation: ["P/B versus regulated ROE", "EV/EBITDA", "Dividend yield and DCF"],
  },
  Industrials: {
    model: "Follow order intake through execution, cash collection and return on incremental capacity—not just announced order-book size.",
    drivers: ["Order inflow", "Execution pace", "Capacity utilisation", "Input-cost pass-through"],
    kpis: ["Order book / revenue", "Book-to-bill", "EBITDA margin", "Working-capital days", "ROCE"],
    risks: ["Order cancellations", "Execution delay", "Cost overruns", "Receivable concentration"],
    valuation: ["EV/EBITDA versus cycle", "P/E versus execution", "ROCE-adjusted growth"],
  },
  Services: {
    model: "Identify the transaction or asset that earns revenue, its utilisation, customer concentration and the operating leverage in the network.",
    drivers: ["Traffic or transactions", "Yield per user/asset", "Capacity utilisation", "Network expansion"],
    kpis: ["Volume growth", "Revenue per unit", "EBITDA margin", "Asset turns", "Net debt"],
    risks: ["Volume shock", "Regulatory constraints", "Customer concentration", "Capital intensity"],
    valuation: ["EV/EBITDA", "FCF yield", "Asset or transaction-based multiples"],
  },
  Telecommunication: {
    model: "Study subscriber quality and monetisation alongside spectrum, network investment and consolidated leverage.",
    drivers: ["Subscriber mix", "ARPU", "Data usage", "Network and enterprise growth"],
    kpis: ["ARPU", "Churn", "Data consumption", "EBITDA margin", "Net debt/EBITDA"],
    risks: ["Tariff competition", "Spectrum liabilities", "Heavy capex", "Technology disruption"],
    valuation: ["EV/EBITDA", "EV/subscriber as a cross-check", "FCF after spectrum and capex"],
  },
};

export function getIndustryResearchModel(industry) {
  if (INDUSTRY_RESEARCH_MODELS[industry]) return INDUSTRY_RESEARCH_MODELS[industry];
  const aliases = [
    [/automobile|consumer durable|consumer service/i, "Consumer Discretionary"],
    [/capital goods|construction(?! material)/i, "Industrials"],
    [/construction material|metal|mining/i, "Commodities"],
    [/oil|gas|consumable fuel/i, "Energy"],
    [/power/i, "Utilities"],
  ];
  const match = aliases.find(([pattern]) => pattern.test(industry || ""));
  return match ? INDUSTRY_RESEARCH_MODELS[match[1]] : DEFAULT_MODEL;
}

export function getOpenCompanyProfile(company) {
  const sourced = company?.isin ? profiles.profilesByIsin[company.isin] : null;
  const fallbackDescription = `${company.name} is an Indian listed company classified under ${company.industry} in the official index-universe snapshot used by MF Pulse.`;
  const sourcedDescription = sourced?.description
    ? `${sourced.description.charAt(0).toUpperCase()}${sourced.description.slice(1).replace(/\.$/, "")}. It is classified under ${company.industry} in the official MF Pulse index-universe snapshot.`
    : null;
  return {
    label: sourced?.label || company.name,
    description: sourcedDescription || fallbackDescription,
    officialWebsite: sourced?.officialWebsite || null,
    founded: sourced?.founded || null,
    wikipediaUrl: sourced?.wikipediaUrl || null,
    sourceUrl: sourced?.sourceUrl || company.memberships?.[0]?.sourceUrl || null,
    sourceName: sourced ? "Wikidata · verified by ISIN" : "Official index classification",
    matchBasis: sourced?.matchBasis || "index_universe",
    retrievedAt: sourced ? profiles.retrievedAt : company.retrievedAt,
  };
}

export function getProfileCoverage() {
  return {
    sourced: profiles.coveredCompanies,
    total: profiles.universeCompanies,
    retrievedAt: profiles.retrievedAt,
    source: profiles.source,
  };
}
