const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function normalizeFiscalCompany(raw = {}) {
  const listing = raw.primaryListing || {};
  return {
    fscl: raw.companyFiscalIdentifier || null,
    companyKey: raw.companyKey || null,
    name: raw.displayNameEnglish || raw.legalNameEnglish || listing.ticker || "Unnamed company",
    legalName: raw.legalNameEnglish || raw.displayNameEnglish || null,
    companyType: raw.companyType || null,
    status: raw.companyStatus || listing.tradingStatus || null,
    countryCode: raw.headquartersCountryCode || null,
    country: raw.headquartersCountryName || null,
    region: raw.headquartersRegion || null,
    sector: raw.sector || null,
    industryGroup: raw.industryGroup || null,
    industry: raw.industry || null,
    subIndustry: raw.subIndustry || null,
    reportingTemplate: raw.reportingTemplate || null,
    reportingCurrency: raw.reportingCurrency || null,
    marketCapUsd: finite(raw.marketCapUsd),
    updatedAt: isoDate(raw.updatedAt ? Number(raw.updatedAt) * 1000 : null),
    availableDatasets: Array.isArray(raw.availableDatasets) ? raw.availableDatasets : [],
    listing: {
      ticker: listing.ticker || null,
      exchangeCode: listing.exchangeCode || null,
      exchangeName: listing.exchangeName || null,
      operatingMic: listing.operatingMic || null,
      tradingCurrency: listing.tradingCurrency || null,
      tradingStatus: listing.tradingStatus || null,
      securityType: listing.securityType || null,
    },
  };
}

export function normalizeCompanyList(payload = {}) {
  return {
    pagination: {
      page: finite(payload.pagination?.page) || 1,
      pageSize: finite(payload.pagination?.pageSize) || 0,
      totalPages: finite(payload.pagination?.totalPages) || 1,
      totalCount: finite(payload.pagination?.totalCount) || 0,
      hasNextPage: Boolean(payload.pagination?.hasNextPage),
    },
    companies: (Array.isArray(payload.data) ? payload.data : []).map(normalizeFiscalCompany).filter((company) => company.companyKey),
  };
}

export function normalizeFiscalProfile(raw = {}) {
  return {
    ...normalizeFiscalCompany(raw),
    tradeName: raw.tradeNameEnglish || null,
    legalDomicile: raw.legalDomicileCountryName || null,
    description: raw.descriptionLong || raw.descriptionShort || null,
    shortDescription: raw.descriptionShort || null,
    chiefExecutiveOfficer: raw.chiefExecutiveOfficer || null,
    foundingYear: finite(raw.foundingYear),
    ipoYear: finite(raw.ipoYear),
    financialPeriodsAvailable: Array.isArray(raw.financialPeriodsAvailable) ? raw.financialPeriodsAvailable : [],
    secondaryListings: Array.isArray(raw.secondaryListings) ? raw.secondaryListings.map((listing) => ({
      ticker: listing.ticker || null,
      exchangeCode: listing.exchangeCode || null,
      exchangeName: listing.exchangeName || null,
      tradingCurrency: listing.tradingCurrency || null,
      tradingStatus: listing.tradingStatus || null,
      securityType: listing.securityType || null,
    })) : [],
    peers: Array.isArray(raw.peers) ? raw.peers.map(normalizeFiscalCompany).filter((company) => company.companyKey) : [],
  };
}

export function normalizeStockPrices(payload = {}) {
  const prices = (Array.isArray(payload.prices) ? payload.prices : [])
    .map((row) => ({
      date: row.date || null,
      open: finite(row.openPrice),
      close: finite(row.closePrice),
      volume: finite(row.volume),
    }))
    .filter((row) => row.date && row.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    listing: {
      ticker: payload.ticker || null,
      exchangeCode: payload.exchangeCode || null,
      operatingMic: payload.operatingMic || null,
      tradingCurrency: payload.tradingCurrency || null,
      tradingStatus: payload.tradingStatus || null,
    },
    prices,
  };
}

const financialValue = (row, key) => finite(row?.metricsValues?.[key]?.value);

export function normalizeIncomeStatement(payload = {}) {
  return (Array.isArray(payload.data) ? payload.data : [])
    .filter((row) => String(row.periodType).toLowerCase() === "annual")
    .map((row) => ({
      fiscalYear: finite(row.fiscalYear),
      reportDate: row.reportDate || null,
      revenue: financialValue(row, "income_statement_total_revenues"),
      grossProfit: financialValue(row, "income_statement_gross_profit"),
      operatingProfit: financialValue(row, "income_statement_operating_profit"),
      netIncome: financialValue(row, "income_statement_consolidated_net_income")
        ?? financialValue(row, "income_statement_net_income_attributable_to_common_shareholders"),
      currency: Object.values(row.metricsValues || {}).find((value) => value?.currency)?.currency || null,
      isRestated: Boolean(row.isRestated),
      sourceFilingDate: row.lastSourceFilingDate || null,
    }))
    .filter((row) => row.fiscalYear && [row.revenue, row.grossProfit, row.operatingProfit, row.netIncome].some((value) => value !== null))
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}

export function normalizeRatios(payload = {}) {
  return (Array.isArray(payload.data) ? payload.data : [])
    .filter((row) => String(row.periodType).toLowerCase() === "annual")
    .map((row) => {
      const values = row.metricValues || {};
      return {
        fiscalYear: finite(row.fiscalYear),
        reportDate: row.reportDate || null,
        price: finite(values.market_data_share_price),
        marketCap: finite(values.calculated_market_cap),
        pe: finite(values.ratio_price_to_earnings),
        pb: finite(values.ratio_price_to_book),
        evToEbitda: finite(values.ratio_ev_to_ebitda),
        dividendYield: finite(values.calculated_dividend_yield),
        revenueGrowth: finite(values.growth_revenue_1y),
        netMargin: finite(values.ratio_net_profit_margin),
        roe: finite(values.ratio_return_on_equity),
        roce: finite(values.ratio_return_on_capital_employed),
        debtToEquity: finite(values.ratio_debt_to_equity),
        freeCashFlow: finite(values.calculated_fcf),
        fcfMargin: finite(values.ratio_fcf_margin),
        reportingCurrency: row.reportingCurrency?.currency || null,
        tradingCurrency: row.tradingCurrency?.currency || null,
      };
    })
    .filter((row) => row.fiscalYear)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}

export function normalizeNewsSummary(payload = {}) {
  return {
    summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
    from: payload.dateApplicableStart || null,
    to: payload.dateApplicableEnd || null,
    generatedAt: isoDate(payload.generatedAt),
  };
}

const percent = (value) => `${(value * 100).toFixed(1)}%`;

export function buildEquityResearchBrief({ profile, prices = [], financials = [], ratios = [] }) {
  const latest = ratios.at(-1) || null;
  const previous = ratios.at(-2) || null;
  const strengths = [];
  const risks = [];
  const questions = [];

  if (latest?.revenueGrowth !== null && latest?.revenueGrowth !== undefined) {
    (latest.revenueGrowth >= 0.08 ? strengths : latest.revenueGrowth < 0 ? risks : questions)
      .push(`Latest annual revenue growth was ${percent(latest.revenueGrowth)}.`);
  }
  if (latest?.roe >= 0.15) strengths.push(`Return on equity was ${percent(latest.roe)}, above the 15% quality screen used in this brief.`);
  if (latest?.netMargin >= 0.15) strengths.push(`Net margin was ${percent(latest.netMargin)}.`);
  if (latest?.debtToEquity !== null && latest?.debtToEquity !== undefined) {
    if (latest.debtToEquity <= 0.5) strengths.push(`Debt-to-equity was ${latest.debtToEquity.toFixed(2)}x.`);
    if (latest.debtToEquity >= 1.5) risks.push(`Debt-to-equity was elevated at ${latest.debtToEquity.toFixed(2)}x.`);
  }
  if (latest?.fcfMargin !== null && latest?.fcfMargin !== undefined && latest.fcfMargin < 0) risks.push(`Free-cash-flow margin was negative at ${percent(latest.fcfMargin)}.`);
  if (latest?.pe !== null && latest?.pe !== undefined) questions.push(`At ${latest.pe.toFixed(1)}x annual earnings, valuation still needs peer and growth-context checks.`);
  if (previous?.pe && latest?.pe && latest.pe > previous.pe * 1.2) risks.push("The annual price-to-earnings multiple expanded by more than 20% from the prior fiscal snapshot.");

  if (prices.length >= 2) {
    const first = prices[0].close;
    const last = prices.at(-1).close;
    const change = first ? last / first - 1 : null;
    if (change !== null) questions.push(`The available price window moved ${change >= 0 ? "up" : "down"} ${Math.abs(change * 100).toFixed(1)}%; price momentum alone is not a business-quality signal.`);
  }

  if (!financials.length) risks.push("Standardized annual financial statements are not available for this company under the connected plan.");
  if (!strengths.length) strengths.push("No strength cleared the brief's evidence thresholds; review the underlying statements before drawing a conclusion.");
  if (!risks.length) risks.push("No quantitative risk threshold fired, which is not evidence that the company is low risk.");
  if (!questions.length) questions.push("Compare valuation, growth durability, balance-sheet resilience, and filing-level disclosures before acting.");

  return {
    headline: `${profile.name} is a ${profile.country || "global"} ${profile.sector || "listed"} company${profile.listing?.ticker ? ` trading as ${profile.listing.ticker}` : ""}.`,
    strengths,
    risks,
    questions,
    methodology: "Rule-based interpretation of Fiscal.ai standardized annual statements, ratios, and split-adjusted daily prices. It is not a rating, forecast, or recommendation.",
  };
}
