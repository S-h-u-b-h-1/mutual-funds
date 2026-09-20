import { describe, expect, it } from "vitest";
import {
  buildEquityResearchBrief,
  normalizeCompanyList,
  normalizeIncomeStatement,
  normalizeRatios,
  normalizeStockPrices,
} from "./normalizers";

describe("Fiscal.ai response normalization", () => {
  it("preserves stable identifiers, listing identity, plan coverage, and pagination", () => {
    const result = normalizeCompanyList({
      pagination: { page: 1, pageSize: 1000, totalPages: 1, totalCount: 99 },
      data: [{
        companyFiscalIdentifier: "FSCL-COMPANY",
        companyKey: "NASDAQ_TEST",
        displayNameEnglish: "Test Corp",
        headquartersCountryCode: "US",
        headquartersCountryName: "United States",
        sector: "Information Technology",
        marketCapUsd: 1234,
        availableDatasets: ["financials", "stock_prices"],
        primaryListing: { ticker: "TEST", exchangeCode: "NASDAQ", tradingCurrency: "USD" },
      }],
    });

    expect(result.pagination.totalCount).toBe(99);
    expect(result.companies[0]).toMatchObject({
      fscl: "FSCL-COMPANY",
      companyKey: "NASDAQ_TEST",
      name: "Test Corp",
      countryCode: "US",
      availableDatasets: ["financials", "stock_prices"],
      listing: { ticker: "TEST", exchangeCode: "NASDAQ", tradingCurrency: "USD" },
    });
  });

  it("sorts split-adjusted prices chronologically and drops invalid closes", () => {
    const result = normalizeStockPrices({
      ticker: "TEST",
      tradingCurrency: "USD",
      prices: [
        { date: "2026-01-03", closePrice: 12, openPrice: 11, volume: 100 },
        { date: "2026-01-01", closePrice: 10, openPrice: 9, volume: 90 },
        { date: "2026-01-02", closePrice: null },
      ],
    });

    expect(result.prices.map((row) => row.date)).toEqual(["2026-01-01", "2026-01-03"]);
    expect(result.listing.tradingCurrency).toBe("USD");
  });

  it("extracts standardized annual financials and ratios without treating missing values as zero", () => {
    const financials = normalizeIncomeStatement({ data: [{
      periodType: "Annual",
      fiscalYear: 2026,
      reportDate: "2026-06-30",
      metricsValues: {
        income_statement_total_revenues: { value: 1000, currency: "USD" },
        income_statement_operating_profit: { value: 250, currency: "USD" },
        income_statement_consolidated_net_income: { value: 200, currency: "USD" },
      },
    }] });
    const ratios = normalizeRatios({ data: [{
      periodType: "Annual",
      fiscalYear: 2026,
      metricValues: { ratio_price_to_earnings: 20, growth_revenue_1y: 0.12, ratio_return_on_equity: 0.24 },
      reportingCurrency: { currency: "USD" },
    }] });

    expect(financials[0]).toMatchObject({ revenue: 1000, grossProfit: null, operatingProfit: 250, netIncome: 200, currency: "USD" });
    expect(ratios[0]).toMatchObject({ pe: 20, revenueGrowth: 0.12, roe: 0.24, debtToEquity: null });
  });

  it("creates a bounded evidence brief rather than a recommendation", () => {
    const profile = { name: "Test Corp", country: "United States", sector: "Technology", listing: { ticker: "TEST" } };
    const brief = buildEquityResearchBrief({
      profile,
      prices: [{ date: "2025-01-01", close: 100 }, { date: "2026-01-01", close: 120 }],
      financials: [{ fiscalYear: 2026, revenue: 1000 }],
      ratios: [{ fiscalYear: 2026, revenueGrowth: 0.12, roe: 0.2, netMargin: 0.18, debtToEquity: 0.3, pe: 25 }],
    });

    expect(brief.strengths.some((item) => item.includes("revenue growth"))).toBe(true);
    expect(brief.questions.some((item) => item.includes("valuation"))).toBe(true);
    expect(brief.methodology).toMatch(/not a rating, forecast, or recommendation/i);
  });
});
