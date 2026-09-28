import "server-only";
import {
  getFiscalCompanyProfile,
  getFiscalIncomeStatement,
  getFiscalNewsSummary,
  getFiscalRatios,
  getFiscalStockPrices,
  listFiscalCompanies,
} from "./client";
import {
  buildEquityResearchBrief,
  normalizeCompanyList,
  normalizeFiscalProfile,
  normalizeIncomeStatement,
  normalizeNewsSummary,
  normalizeRatios,
  normalizeStockPrices,
} from "./normalizers";

const safe = async (promise, fallback) => {
  try {
    return await promise;
  } catch {
    return fallback;
  }
};

export async function getGlobalEquityUniverse({ query = "", country = "", sector = "" } = {}) {
  const normalized = normalizeCompanyList(await listFiscalCompanies({ compact: true }));
  const needle = String(query).trim().toLowerCase();
  const countryNeedle = String(country).trim().toLowerCase();
  const sectorNeedle = String(sector).trim().toLowerCase();
  const companies = normalized.companies.filter((company) => {
    const matchesQuery = !needle || [company.name, company.legalName, company.companyKey, company.listing.ticker, company.listing.exchangeCode, company.country, company.sector]
      .some((value) => String(value || "").toLowerCase().includes(needle));
    const matchesCountry = !countryNeedle || String(company.countryCode || "").toLowerCase() === countryNeedle;
    const matchesSector = !sectorNeedle || String(company.sector || "").toLowerCase() === sectorNeedle;
    return matchesQuery && matchesCountry && matchesSector;
  });

  return {
    ...normalized,
    companies,
    filters: {
      countries: [...new Set(normalized.companies.map((company) => company.countryCode).filter(Boolean))].sort(),
      sectors: [...new Set(normalized.companies.map((company) => company.sector).filter(Boolean))].sort(),
    },
  };
}

export async function getGlobalEquityReport(companyKey) {
  const profile = normalizeFiscalProfile(await getFiscalCompanyProfile(companyKey));
  const datasets = new Set(profile.availableDatasets);
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 5);
  const startDate = start.toISOString().slice(0, 10);

  const [pricePayload, financialPayload, ratioPayload, newsPayload] = await Promise.all([
    datasets.has("stock_prices") ? safe(getFiscalStockPrices(companyKey, { startDate }), null) : null,
    datasets.has("financials") ? safe(getFiscalIncomeStatement(profile.fscl), null) : null,
    datasets.has("financials") ? safe(getFiscalRatios(profile.fscl), null) : null,
    datasets.has("news") ? safe(getFiscalNewsSummary(profile.fscl), null) : null,
  ]);

  const priceSeries = pricePayload ? normalizeStockPrices(pricePayload) : { listing: profile.listing, prices: [] };
  const financials = financialPayload ? normalizeIncomeStatement(financialPayload) : [];
  const ratios = ratioPayload ? normalizeRatios(ratioPayload) : [];
  const news = newsPayload ? normalizeNewsSummary(newsPayload) : normalizeNewsSummary();

  return {
    profile,
    priceSeries,
    financials,
    ratios,
    news,
    brief: buildEquityResearchBrief({ profile, prices: priceSeries.prices, financials, ratios }),
    source: {
      provider: "Fiscal.ai",
      priceCoverageStart: startDate,
      fetchedDatasets: [
        priceSeries.prices.length ? "stock_prices" : null,
        financials.length ? "financials" : null,
        ratios.length ? "ratios" : null,
        news.summary ? "news_summary" : null,
      ].filter(Boolean),
    },
  };
}
