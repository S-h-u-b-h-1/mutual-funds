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
