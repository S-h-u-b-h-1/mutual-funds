import { describe, expect, it } from "vitest";
import { getIndexUniverse, getStockUniverseSummary, searchIndexUniverse } from "./universe.js";

describe("stock universe snapshot", () => {
  it("exposes the validated official constituent counts", () => {
    expect(getIndexUniverse("NIFTY50").constituentCount).toBe(50);
    expect(getIndexUniverse("BSE100").constituentCount).toBe(100);
    expect(getStockUniverseSummary()).toMatchObject({ records: 150, indices: 2, identifiers: 200 });
  });

  it("searches names, industries and identifiers case-insensitively", () => {
    expect(searchIndexUniverse({ indexKey: "NIFTY50", query: "INE002A01018" }).map((row) => row.nseSymbol)).toContain("RELIANCE");
    expect(searchIndexUniverse({ indexKey: "BSE100", query: "500180" }).map((row) => row.bseCode)).toContain("500180");
    expect(searchIndexUniverse({ indexKey: "NIFTY50", query: "financial services" }).length).toBeGreaterThan(1);
  });

  it("falls back to NIFTY 50 for an unknown index key", () => {
    expect(getIndexUniverse("UNKNOWN").key).toBe("NIFTY50");
  });
});
