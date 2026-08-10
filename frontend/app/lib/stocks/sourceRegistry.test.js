import { describe, expect, it } from "vitest";
import { STOCK_SOURCES, SOURCE_STATUS, getStockSourceSummary, groupedStockSources } from "./sourceRegistry.js";

describe("stock source registry", () => {
  it("gives every source a unique id, valid status and explicit use policy", () => {
    expect(new Set(STOCK_SOURCES.map((source) => source.id)).size).toBe(STOCK_SOURCES.length);
    for (const source of STOCK_SOURCES) {
      expect(SOURCE_STATUS[source.collectionStatus]).toBeTruthy();
      expect(source.publisher).toBeTruthy();
      expect(source.category).toBeTruthy();
      expect(source.investorValue.length).toBeGreaterThan(20);
      expect(source.usePolicy.length).toBeGreaterThan(20);
    }
  });

  it("keeps active collection distinct from public reference links", () => {
    const summary = getStockSourceSummary();
    expect(summary.total).toBe(STOCK_SOURCES.length);
    expect(summary.active).toBeGreaterThan(0);
    expect(summary.ready).toBeGreaterThan(0);
    expect(summary.reference).toBeGreaterThan(0);
    expect(summary.licensed).toBeGreaterThan(0);
  });

  it("groups all sources without dropping any", () => {
    const groups = groupedStockSources();
    expect(Object.values(groups).flat()).toHaveLength(STOCK_SOURCES.length);
    expect(groups["Index universe"]).toHaveLength(2);
    expect(groups["Exchange filings"].every((source) => source.authority === "exchange")).toBe(true);
  });
});

