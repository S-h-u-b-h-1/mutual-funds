const COMMON_EVIDENCE = [
  { key: "results", label: "Financial results", cadence: "Quarterly", source: "NSE / BSE", why: "Revenue, margins, profit, balance sheet and cash-flow facts reported to the exchanges.", hrefKey: "NSE financial results" },
  { key: "annual-report", label: "Annual report", cadence: "Annual", source: "Company / exchange", why: "Audited statements, accounting notes, segment detail, strategy, risks and related-party disclosures.", hrefKey: "NSE announcements" },
  { key: "shareholding", label: "Shareholding pattern", cadence: "Quarterly", source: "NSE / BSE", why: "Promoter, institutional and public ownership, including changes that need explanation.", hrefKey: "NSE shareholding" },
  { key: "governance", label: "Governance filing", cadence: "Quarterly", source: "NSE / BSE", why: "Board composition, committee compliance and governance exceptions.", hrefKey: "NSE governance filings" },
  { key: "brsr", label: "BRSR", cadence: "Annual", source: "NSE / BSE", why: "Environmental, social, workforce, supply-chain and governance disclosures for applicable companies.", hrefKey: "NSE BRSR filings" },
  { key: "voting", label: "Voting results", cadence: "Event-driven", source: "NSE / BSE", why: "Shareholder approval levels and dissent on remuneration, capital allocation and governance matters.", hrefKey: "NSE voting results" },
  { key: "announcements", label: "Material announcements", cadence: "Event-driven", source: "NSE / BSE", why: "Orders, capacity, acquisitions, ratings, management changes and other price-sensitive disclosures.", hrefKey: "NSE announcements" },
  { key: "presentation", label: "Investor presentation / concall", cadence: "Quarterly", source: "Company / exchange", why: "Management explanation, operating KPIs, guidance and questions that are absent from headline results.", hrefKey: "NSE announcements" },
];

const INDUSTRY_EVIDENCE = [
  { pattern: /bank|finance/i, title: "Banking & lending operating evidence", metrics: ["Loan growth and mix", "Net interest margin", "GNPA / NNPA and credit cost", "CASA or funding mix", "Capital adequacy", "Provision coverage"] },
  { pattern: /insurance/i, title: "Insurance operating evidence", metrics: ["APE and premium growth", "VNB and VNB margin", "Persistency", "Solvency ratio", "Claim ratio", "Product and channel mix"] },
  { pattern: /software|technology/i, title: "Technology-services operating evidence", metrics: ["Constant-currency growth", "Deal wins and pipeline", "Attrition", "Utilisation", "Client concentration", "Geography and vertical mix"] },
  { pattern: /auto/i, title: "Automotive operating evidence", metrics: ["Unit volumes", "Realisation per vehicle", "Market share", "Commodity cost per unit", "Inventory days", "EV / export mix"] },
  { pattern: /pharma|health/i, title: "Healthcare operating evidence", metrics: ["Product / therapy mix", "USFDA and regulatory status", "R&D intensity", "Launch pipeline", "Price erosion", "Domestic versus export growth"] },
  { pattern: /metal|mining|oil|gas|power|energy|utilit|commodit|cement|construction material/i, title: "Cyclical and utility operating evidence", metrics: ["Volumes and utilisation / PLF", "Realisation or regulated tariff", "Fuel and input-cost spread", "Cost curve and availability", "Capacity additions", "Net debt through the cycle"] },
  { pattern: /capital goods|industrial/i, title: "Industrial operating evidence", metrics: ["Order inflow and order book", "Execution and revenue conversion", "Capacity utilisation", "Working-capital days", "Input-cost pass-through", "Return on incremental capital"] },
  { pattern: /consumer|fmcg/i, title: "Consumer operating evidence", metrics: ["Volume versus price growth", "Gross-margin bridge", "Distribution reach", "Market share", "Advertising intensity", "Rural / urban mix"] },
  { pattern: /telecom/i, title: "Telecom operating evidence", metrics: ["Subscribers", "ARPU", "Churn", "Data consumption", "Spectrum and capex", "Net debt"] },
  { pattern: /realty|construction/i, title: "Real-estate operating evidence", metrics: ["Pre-sales", "Collections", "Launch pipeline", "Net debt", "Project inventory", "Execution and approvals"] },
];

export function getEvidenceDossier(industry = "") {
  const specific = INDUSTRY_EVIDENCE.find((item) => item.pattern.test(industry)) || {
    title: "Business-specific operating evidence",
    metrics: ["Volumes or customer activity", "Realisation or unit economics", "Capacity and utilisation", "Market share", "Working capital", "Reinvestment and capital allocation"],
  };
  return { documents: COMMON_EVIDENCE, operating: specific };
}

export const FREE_RESEARCH_LANES = [
  ["What changed?", "Exchange announcements, official press releases and attributed news", "Event-driven"],
  ["What did the company report?", "Results, annual reports, BRSR and presentations", "Quarterly / annual"],
  ["Who owns and governs it?", "Shareholding, governance filings and voting results", "Quarterly / event-driven"],
  ["What drives the business?", "Company operating KPIs plus RBI and public macro series", "Sector-specific"],
  ["What can be concluded?", "Deterministic analysis only after required evidence is complete", "Evidence-gated"],
];
