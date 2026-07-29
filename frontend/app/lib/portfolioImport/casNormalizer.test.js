import { describe, expect, it } from "vitest";
import { parseCasText } from "./casParser";
import { normalizeCasImport, computePortfolioXirr } from "./casNormalizer";

// Real, active scheme identities pulled from the live fund universe (funds.json) — needed because
// normalizeCasImport() runs real canonical scheme resolution (schemeResolver.js), which only
// succeeds against ISINs that actually exist in the current fund data. Only these four identifiers
// are real; folio numbers, investor details, units, and values below are all invented test data,
// the same convention casParser.test.js already uses.
const A = { code: "100064", isin: "INF209K01322", name: "Aditya Birla Sun Life MNC Fund - Growth - Regular Plan" };
const B = { code: "100313", isin: "INF767K01071", name: "LIC MF Flexi Cap Fund-Regular Plan-Growth" };
const C = { code: "101764", isin: "INF179K01426", name: "HDFC Value Fund - Growth Plan" };
const D = { code: "100547", isin: "INF090I01BF2", name: "Franklin India Liquid Fund - Super Institutional Plan - Daily - IDCW" };

function row({ folio, market, units, navDate, nav, registrar, isin, cost, nameLines }) {
  return [`${folio}${market}`, ...nameLines, `${units}${navDate}${nav}${registrar}${isin}${cost}`].join("\n");
}

describe("normalizeCasImport on a merged multi-statement CAS summary (full backend path)", () => {
  // Per the governing directive: "If the source contains N distinct legitimate holdings, N must
  // not become N-1 or N+1 after normalization/reconciliation." This fixture glues TWO Consolidated
  // Account Summaries for two different investors into one PDF text blob (the merged-document
  // scenario) and deliberately includes: (a) two different schemes in one folio (normal), (b) the
  // SAME scheme repeated in the SAME folio (a genuine duplicate line a registrar export can
  // produce — must collapse to one holding), and (c) the SAME scheme in a DIFFERENT folio (must
  // stay a separate holding, not merged into (b)'s scheme). 6 raw rows must become exactly 5
  // holdings — not 4 (over-merged) and not 6 (duplicate not caught).
  it("collapses a genuine same-folio duplicate, keeps same-scheme-different-folio distinct, and survives the merged-document boundary", () => {
    const stmt1 = [
      "CAMSCASWS-TEST-X Version:V3.5 Live-1017", "Consolidated Account Summary", "As on 29-Jul-2026", "Page 1 of 1",
      "Email Id: investor.merge@example.test", "TEST INVESTOR", "Mobile: +919999999999",
      "Market ValueFolio No.", "(INR)", "Scheme NameUnit Balance", "NAV DateNAVRegistrar", "(INR)", "ISINCost Value", "(INR)",
      row({ folio: "10010001", market: "/0110,000.00", units: "1,000.000", navDate: "28-Jul-2026", nav: "100.00", registrar: "CAMS", isin: A.isin, cost: "100,000.000", nameLines: [A.name] }),
      row({ folio: "10010002", market: "/0120,000.00", units: "2,000.000", navDate: "28-Jul-2026", nav: "100.00", registrar: "CAMS", isin: B.isin, cost: "200,000.000", nameLines: [B.name] }),
      // Genuine duplicate: same folio (10010001) + same ISIN (A) as the first row above.
      row({ folio: "10010001", market: "/0110,000.00", units: "1,000.000", navDate: "28-Jul-2026", nav: "100.00", registrar: "CAMS", isin: A.isin, cost: "100,000.000", nameLines: [A.name] }),
      "Total40,000.00400,000.00",
    ].join("\n");

    const stmt2 = [
      // A second, independent Consolidated Account Summary glued directly onto the first one's own
      // footer/trailer — the exact shape a merged multi-account CAS PDF produces.
      "CAMSCASWS-TEST-X Version:V3.5 Live-1017", "Consolidated Account Summary", "As on 29-Jul-2026", "Page 2 of 2", "Loads and Fees",
      "CAMSCASWS-TEST-Y Version:V3.5 Live-1017", "Consolidated Account Summary", "As on 29-Jul-2026", "Page 1 of 1",
      "Email Id: investor.merge2@example.test", "TEST INVESTOR TWO", "Mobile: +919999999998",
      "Market ValueFolio No.", "(INR)", "Scheme NameUnit Balance", "NAV DateNAVRegistrar", "(INR)", "ISINCost Value", "(INR)",
      // Same scheme (A) as stmt1's rows, but a DIFFERENT folio — must remain a separate holding.
      row({ folio: "10020001", market: "/015,000.00", units: "500.000", navDate: "28-Jul-2026", nav: "100.00", registrar: "CAMS", isin: A.isin, cost: "50,000.000", nameLines: [A.name] }),
      row({ folio: "20010001", market: "/0115,000.00", units: "1,500.000", navDate: "28-Jul-2026", nav: "100.00", registrar: "CAMS", isin: C.isin, cost: "150,000.000", nameLines: [C.name] }),
      row({ folio: "20010001", market: "/018,000.00", units: "800.000", navDate: "28-Jul-2026", nav: "100.00", registrar: "CAMS", isin: D.isin, cost: "80,000.000", nameLines: [D.name] }),
      "Total28,000.00280,000.00",
    ].join("\n");

    const parsed = parseCasText(stmt1 + "\n" + stmt2);
    expect(parsed.format).toBe("summary");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toHaveLength(6); // the parser itself sees all 6 raw rows, including the duplicate

    const normalized = normalizeCasImport(parsed);

    expect(normalized.errors).toEqual([]); // every real ISIN resolves; nothing should fail resolution
    expect(normalized.holdings).toHaveLength(5); // 6 raw rows - 1 genuine duplicate = 5 real holdings
    expect(normalized.warnings.some((w) => /appears more than once under the same folio/.test(w))).toBe(true);

    const byFolio = Object.fromEntries(normalized.holdings.map((h) => [`${h.schemeCode}|${h.folioNumber}`, h]));
    // The duplicate collapsed to exactly one row for scheme A / folio 10010001 (not zero, not two).
    expect(byFolio["100064|10010001"]).toMatchObject({ units: 1000, purchaseValue: 100000 });
    // Same scheme (A), different folio — kept as its own distinct holding, not merged into the above.
    expect(byFolio["100064|10020001"]).toMatchObject({ units: 500, purchaseValue: 50000 });
    // The other three schemes, including the two from the second merged statement, are all present.
    expect(byFolio["100313|10010002"]).toMatchObject({ units: 2000, purchaseValue: 200000 });
    expect(byFolio["101764|20010001"]).toMatchObject({ units: 1500, purchaseValue: 150000 });
    expect(byFolio["100547|20010001"]).toMatchObject({ units: 800, purchaseValue: 80000 });

    const totalCost = normalized.holdings.reduce((sum, h) => sum + h.purchaseValue, 0);
    expect(totalCost).toBe(100000 + 500 * 100 + 200000 + 150000 + 80000); // 580,000 — the duplicate is not double-counted
  });
});

describe("computePortfolioXirr — unavailable states carry a reason, never a fabricated 0", () => {
  it("reports no_transaction_history for a holding with zero transactions (e.g. summary-only CAS import)", () => {
    const holdings = [{ schemeCode: "100064", currentValue: 50000 }];
    const result = computePortfolioXirr([], holdings);

    expect(result.byScheme["100064"]).toBeNull(); // unchanged existing shape — still bare null
    expect(result.byStatus["100064"]).toEqual({ available: false, value: null, reason: "no_transaction_history" });
    expect(result.portfolio).toBeNull();
    expect(result.portfolioStatus).toEqual({ available: false, value: null, reason: "no_transaction_history" });
  });

  it("reports no_transaction_history when a holding has transactions but no current NAV to close the series", () => {
    const transactions = [{ schemeCode: "100064", transactionType: "purchase", transactionDate: "2026-01-01", amount: 10000 }];
    const holdings = [{ schemeCode: "100064", currentValue: null }]; // NAV unavailable — no terminal inflow pushed
    const result = computePortfolioXirr(transactions, holdings);

    expect(result.byStatus["100064"]).toEqual({ available: false, value: null, reason: "no_transaction_history" });
  });

  it("computes a real value (not a reason) when real dated cash flows exist both ways", () => {
    const transactions = [{ schemeCode: "100064", transactionType: "purchase", transactionDate: "2025-01-01", amount: 10000 }];
    const holdings = [{ schemeCode: "100064", currentValue: 12000 }];
    const result = computePortfolioXirr(transactions, holdings);

    expect(result.byStatus["100064"].available).toBe(true);
    expect(result.byStatus["100064"].reason).toBeNull();
    expect(typeof result.byStatus["100064"].value).toBe("number");
    expect(result.byScheme["100064"]).toBe(result.byStatus["100064"].value); // both fields agree
  });
});

describe("statement valuation is preserved separately from MF Pulse's own live valuation", () => {
  // Per the governing directive (Phase 3): "Do not confuse statement market value with latest MF
  // Pulse valuation... preserve both." Uses a deliberately implausible statement NAV (999.9999,
  // far from any real fund's live NAV) specifically so this test proves the two are genuinely
  // independent fields, not the same value read twice under different names.
  it("keeps statementValue/statementNav/statementNavDate distinct from currentValue/nav/navDate", () => {
    const text = [
      "CAMSCASWS-TEST-Z Version:V3.5 Live-1017", "Consolidated Account Summary", "As on 20-Jul-2026", "Page 1 of 1",
      "Email Id: investor.stmt@example.test", "TEST INVESTOR", "Mobile: +919999999999",
      "Market ValueFolio No.", "(INR)", "Scheme NameUnit Balance", "NAV DateNAVRegistrar", "(INR)", "ISINCost Value", "(INR)",
      row({ folio: "88001", market: "/0199,999.90", units: "1,000.000", navDate: "20-Jul-2026", nav: "999.9999", registrar: "CAMS", isin: A.isin, cost: "90,000.000", nameLines: [A.name] }),
      "Total99,999.9090,000.00",
    ].join("\n");

    const parsed = parseCasText(text);
    const normalized = normalizeCasImport(parsed);

    expect(normalized.errors).toEqual([]);
    expect(normalized.holdings).toHaveLength(1);
    const holding = normalized.holdings[0];

    // The statement's own figures, exactly as the (synthetic) statement declared them.
    // marketValueReported is units x statement-nav (1000 x 999.9999) when both are present —
    // see extractLineSummaryHoldings — not the folio/market line's own glued figure.
    expect(holding.statementValue).toBe(999999.9);
    expect(holding.statementNav).toBe(999.9999);
    expect(holding.statementNavDate).toBe("2026-07-20");

    // MF Pulse's own live valuation is a completely different, independently-computed figure —
    // proves these are two genuinely separate data paths, not the same value under two names.
    expect(holding.nav).not.toBe(holding.statementNav);
    expect(holding.currentValue).not.toBe(holding.statementValue);
    expect(holding.currentValue).toBe(+(holding.units * holding.nav).toFixed(2)); // currentValue always derives from live nav, never from statementValue
  });
});
