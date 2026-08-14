import { describe, expect, it } from "vitest";
import { getCompanyResearch, getIndexUniverse, getStockUniverseSummary, searchIndexUniverse } from "./universe.js";

describe("stock universe snapshot", () => {
  it("exposes the validated official constituent counts", () => {
    expect(getIndexUniverse("NIFTY50").constituentCount).toBe(50);
    expect(getIndexUniverse("BSE100").constituentCount).toBe(100);
    expect(getStockUniverseSummary()).toMatchObject({ records: 150, indices: 2, identifiers: 400 });
  });

  it("searches names, industries and identifiers case-insensitively", () => {
    expect(searchIndexUniverse({ indexKey: "NIFTY50", query: "INE002A01018" }).map((row) => row.nseSymbol)).toContain("RELIANCE");
    expect(searchIndexUniverse({ indexKey: "BSE100", query: "500180" }).map((row) => row.bseCode)).toContain("500180");
    expect(searchIndexUniverse({ indexKey: "NIFTY50", query: "financial services" }).length).toBeGreaterThan(1);
  });

  it("falls back to NIFTY 50 for an unknown index key", () => {
    expect(getIndexUniverse("UNKNOWN").key).toBe("NIFTY50");
  });

  it("cross-checks BSE constituents against the official NSE equity master", () => {
    expect(getIndexUniverse("BSE100").constituents.every((company) => company.nseSymbol && company.isin)).toBe(true);
    const adaniPower = getCompanyResearch("533096");
    expect(adaniPower.nseSymbol).toBe("ADANIPOWER");
    expect(adaniPower.isin).toBe("INE814H01029");
    const reportedUuidCompany = getCompanyResearch("500477");
    expect(reportedUuidCompany.nseSymbol).toBe("ASHOKLEY");
    expect(reportedUuidCompany.name).toContain("ASHOK LEYLAND");
  });
});
