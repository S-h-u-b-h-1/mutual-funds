import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  upsertCommodity, getCommodityByName, listCommodities, recordCommodityPrice, ingestLatestPrice,
  getLatestCommodityPrice, getCommodityPriceHistory, addCompanyCommodityExposure, getCompanyCommodityExposures,
  explainCompanyCommodityExposure,
} from "./commodityService.js";
import { MockCommodityProvider } from "./providers/mock/MockCommodityProvider.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";
import { query } from "../db.js";

describe("commodityService (integration, real Neon, disposable fixtures)", () => {
  const provider = new MockCommodityProvider();
  let commodityId;
  let companyId;

  afterAll(async () => {
    await deleteTestCompany(companyId);
    if (commodityId) await query(`delete from commodities where id = $1`, [commodityId]);
  });

  it("rejects an unregistered commodity via upsertCommodity's required fields", async () => {
    await expect(upsertCommodity({ name: "" })).rejects.toThrow(/requires name, category, and defaultUnit/);
  });

  it("upserts a commodity idempotently (same name never creates a second row)", async () => {
    const name = `Test HRC Steel ${Date.now()}`;
    const first = await upsertCommodity({ name, category: "steel", defaultUnit: "INR/tonne" });
    const second = await upsertCommodity({ name, category: "steel", defaultUnit: "INR/tonne", description: "updated" });
    commodityId = first.id;
    expect(second.id).toBe(first.id);
    expect(second.description).toBe("updated");

    const all = await listCommodities();
    expect(all.some((c) => c.id === commodityId)).toBe(true);
  });

  it("records a price and reads it back as the latest", async () => {
    await recordCommodityPrice(commodityId, { unit: "INR/tonne", price: 52000, assessmentDate: "2026-07-01", source: "unit-test" });
    await recordCommodityPrice(commodityId, { unit: "INR/tonne", price: 54000, assessmentDate: "2026-07-31", source: "unit-test" });

    const latest = await getLatestCommodityPrice(commodityId);
    expect(latest.price).toBe(54000);
    expect(latest.assessmentDate).not.toBeNull();

    const history = await getCommodityPriceHistory(commodityId, { limit: 10 });
    expect(history.length).toBe(2);
  });

  it("rejects recordCommodityPrice missing required fields", async () => {
    await expect(recordCommodityPrice(commodityId, { unit: "INR/tonne", assessmentDate: "2026-07-01", source: "x" })).rejects.toThrow(/requires price/);
  });

  it("ingests a real mock-provider response end to end (provider -> lookup/register -> persist)", async () => {
    const recorded = await ingestLatestPrice(provider, "Iron Ore Fines");
    expect(recorded).not.toBeNull();
    expect(recorded.source).toBe("mock-commodity");

    const commodity = await getCommodityByName("Iron Ore Fines");
    expect(commodity).not.toBeNull();
    try {
      const latest = await getLatestCommodityPrice(commodity.id);
      expect(latest.price).toBeGreaterThan(0);
    } finally {
      await query(`delete from commodities where id = $1`, [commodity.id]);
    }
  });

  it("returns null from ingestLatestPrice for a commodity the provider doesn't recognize", async () => {
    const result = await ingestLatestPrice(provider, "Definitely Not A Real Commodity");
    expect(result).toBeNull();
  });

  it("records company exposure and explains price direction without claiming profit impact", async () => {
    companyId = await createTestCompany({ label: "commodity-exposure" });
    await addCompanyCommodityExposure({ companyId, commodityId, exposureType: "input", significance: "primary", description: "Primary raw material input.", source: "unit-test" });

    const exposures = await getCompanyCommodityExposures(companyId);
    expect(exposures.length).toBe(1);
    expect(exposures[0].commodityName).toContain("Test HRC Steel");

    const explanations = await explainCompanyCommodityExposure(companyId);
    expect(explanations.length).toBe(1);
    const [exp] = explanations;
    expect(exp.direction).toBe("up"); // 52000 -> 54000 across the two prices inserted above
    expect(exp.percentChange).toBeGreaterThan(0);
    expect(exp.note).toMatch(/does not imply a specific profit impact/);
    expect(exp.note.toLowerCase()).not.toMatch(/buy|sell|profit will|margin will (rise|fall)/);
  });

  it("rejects an invalid exposureType", async () => {
    await expect(addCompanyCommodityExposure({ companyId, commodityId, exposureType: "sideways" })).rejects.toThrow(/invalid exposureType/);
  });
});
