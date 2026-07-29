import { describe, expect, it } from "vitest";
import { parseCasText } from "./casParser";

describe("parseCasText account summary PDFs", () => {
  it("extracts every holding from merged CAMS/KFin account summaries", () => {
    const text = `CAMSCASWS-TEST-A Version:V3.5 Live-1017
Consolidated Account Summary
As on 29-Jul-2026
Page 1 of 2
Email Id: investor.one@example.test
TEST INVESTOR
Mobile: +919999999999
Market ValueFolio No.
(INR)
Scheme NameUnit Balance
NAV DateNAVRegistrar
(INR)
ISINCost Value
(INR)
11021607192/0341,049.83
101SCGPG - Canara Robeco Small Cap Fund
- Regular Growth (Non Demat)
8,466.97728-Jul-202640.28KFINTECHINF760K01JF9100,000.000
17728771823/0107,686.65
101FEGPG - Canara Robeco Focused Fund -
Regular Growth (Non Demat)
5,485.82028-Jul-202619.63KFINTECHINF760K01JT064,000.000
Total448,736.48164,000.00
CAMSCASWS-TEST-A Version:V3.5 Live-1017
Consolidated Account Summary
As on 29-Jul-2026
Page 2 of 2
Loads and Fees
CAMSCASWS-TEST-B Version:V3.5 Live-1017
Consolidated Account Summary
As on 29-Jul-2026
Page 1 of 2
Email Id: investor.two@example.test
TEST INVESTOR
Mobile: +919999999999
Market ValueFolio No.
(INR)
Scheme NameUnit Balance
NAV DateNAVRegistrar
(INR)
ISINCost Value
(INR)
10395230/0499,868.16
D13 - DSP India T.I.G.E.R. Fund - Regular
Plan - Growth (Non-Demat)
280.93128-Jul-2026355.490CAMSINF740K01151100,000.000
904617/090,443.79
JIO180 - JioBlackRock Flexi Cap Fund -
Direct - Growth (Non-Demat)
9,134.99828-Jul-20269.9008CAMSINF22M00109390,000.000
61018426864/098,157.59
176FSGP - SUNDARAM FINANCIAL SERVICES
OPPORTUNITIES FUND - REGULAR GROWTH
(Non Demat)
915.66228-Jul-2026107.1985KFINTECHINF903J01629100,000.000
Total288,469.54290,000.00`;

    const parsed = parseCasText(text);

    expect(parsed.format).toBe("summary");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.statementDeclaredTotal).toEqual({ marketValueTotal: 737206.02, costValueTotal: 454000 });
    expect(Math.round(parsed.rows.reduce((sum, row) => sum + row.marketValueReported, 0) * 100) / 100).toBe(737206.02);
    expect(Math.round(parsed.rows.reduce((sum, row) => sum + row.purchaseValue, 0) * 100) / 100).toBe(454000);

    expect(parsed.rows.map((row) => row.isin)).toEqual([
      "INF760K01JF9",
      "INF760K01JT0",
      "INF740K01151",
      "INF22M001093",
      "INF903J01629",
    ]);
    expect(parsed.rows.find((row) => row.isin === "INF740K01151")).toMatchObject({
      folioNumber: "10395230",
      units: 280.931,
      nav: 355.49,
      purchaseValue: 100000,
      marketValueReported: 99868.16,
      registrar: "CAMS",
    });
    expect(parsed.rows.find((row) => row.isin === "INF903J01629")?.schemeName).toBe(
      "176FSGP - SUNDARAM FINANCIAL SERVICES OPPORTUNITIES FUND - REGULAR GROWTH"
    );
  });
});

describe("parseCasText transaction-ledger (full CAS with purchase/redemption history)", () => {
  it("classifies every real transaction type, keeping SIP distinct from a lump-sum purchase", () => {
    const text = `Folio No: 12345678/01
ABC Large Cap Fund - Regular Growth (Non Demat)
ISIN: INF200K01234
01-Apr-2026 Purchase 50000.00 1580.400 31.6400 1580.400
05-Apr-2026 Purchase - SIP Installment 5000.00 156.250 32.0000 1736.650
10-Apr-2026 Switch In from XYZ Debt Fund 10000.00 310.559 32.2000 2047.209
15-Apr-2026 Switch Out to PQR Fund -5000.00 -152.671 32.7500 1894.538
20-Apr-2026 Dividend Reinvestment 200.00 6.024 33.2000 1900.562
25-Apr-2026 Dividend Payout 300.00 0.000 33.5000 1900.562
30-Apr-2026 Redemption -2000.00 -58.824 34.0000 1841.738
Closing Balance: 1841.738
Cost Value: 63000.00
Market Value: 65000.00
Folio No: 12345678/02
DEF Debt Fund - Direct Growth (Non Demat)
ISIN: INF300K05678
01-Apr-2026 Stamp Duty Adjustment 5.00 0.000 10.0000 500.000
Closing Balance: 500.000
Cost Value: 5000.00
Market Value: 5100.00`;

    const parsed = parseCasText(text);

    expect(parsed.format).toBe("ledger");
    expect(parsed.rows).toHaveLength(2);

    // Every row is preserved, in statement order — SIP is never merged into "purchase", and an
    // unrecognized line is stored as "unknown" rather than dropped (UNKNOWN IS BETTER THAN WRONG).
    expect(parsed.transactions.map((t) => t.transactionType)).toEqual([
      "purchase",
      "sip",
      "switch_in",
      "switch_out",
      "dividend_reinvest",
      "dividend_payout",
      "redemption",
      "unknown",
    ]);

    const sipTxn = parsed.transactions.find((t) => t.transactionType === "sip");
    expect(sipTxn).toMatchObject({ isin: "INF200K01234", amount: 5000, units: 156.25, navValue: 32, unitBalance: 1736.65, description: "Purchase - SIP Installment" });
    const purchaseTxn = parsed.transactions.find((t) => t.transactionType === "purchase");
    expect(purchaseTxn).toMatchObject({ amount: 50000, units: 1580.4, navValue: 31.64, unitBalance: 1580.4 });

    // An unrecognized line (e.g. a standalone charges/stamp-duty entry) is never guessed into one
    // of the known types, but it IS kept — as an "unknown"-typed record with its raw description
    // preserved — rather than silently dropped. The holding itself was always captured regardless
    // (its closing balance is independently extractable), so this is purely about not losing the
    // transaction-level detail.
    expect(parsed.warnings.some((w) => /Unrecognized transaction type/.test(w) && /Stamp Duty Adjustment/.test(w))).toBe(true);
    const unknownTxn = parsed.transactions.find((t) => t.isin === "INF300K05678");
    expect(unknownTxn).toMatchObject({ transactionType: "unknown", description: "Stamp Duty Adjustment", amount: 5, units: 0, navValue: 10, unitBalance: 500 });
    expect(parsed.rows.find((r) => r.isin === "INF300K05678")).toMatchObject({
      units: 500,
      purchaseValue: 5000,
      marketValueReported: 5100,
    });
  });

  it("still classifies purchases correctly when the description reads only 'Systematic Investment'", () => {
    const text = `Folio No: 99887766/01
XYZ Flexi Cap Fund - Direct Growth (Non Demat)
ISIN: INF400K09999
01-May-2026 Systematic Investment 2500.00 62.500 40.0000 62.500
Closing Balance: 62.500
Cost Value: 2500.00
Market Value: 2600.00`;

    const parsed = parseCasText(text);

    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0].transactionType).toBe("sip");
  });

  it("classifies directional STP legs as switch_in/switch_out and SWP as redemption, but never guesses a bare undirected STP", () => {
    const text = `Folio No: 55443322/01
PQR Balanced Advantage Fund - Regular Growth (Non Demat)
ISIN: INF500K01111
01-Jun-2026 STP Out to XYZ Fund 3000.00 75.000 40.0000 425.000
05-Jun-2026 STP In from ABC Fund 3000.00 74.000 40.5000 499.000
10-Jun-2026 SWP - Systematic Withdrawal 1000.00 -24.691 40.5000 474.309
15-Jun-2026 Systematic Transfer Plan 500.00 12.000 41.0000 486.309
Closing Balance: 486.309
Cost Value: 15000.00
Market Value: 19938.68`;

    const parsed = parseCasText(text);

    expect(parsed.transactions.map((t) => t.transactionType)).toEqual([
      "switch_out", // STP Out — directional, safe to classify as a switch leg
      "switch_in", // STP In — directional, safe to classify as a switch leg
      "redemption", // SWP is unambiguous — money only ever leaves the fund
      "unknown", // bare "Systematic Transfer Plan" has no direction — never guessed
    ]);
  });
});
