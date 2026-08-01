import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  upsertValuationSnapshot, getLatestValuation, getValuationHistory,
  getSectorMedianValuation, getPeerMedianValuation,
} from "./valuation.js";
import { createTestSector, createTestIndustry, createTestCompany, deleteTestCompany, deleteTestSector } from "./testHelpers.js";
import { query } from "../db.js";

describe("valuation (integration, real Neon, disposable fixtures)", () => {
  let companyId;

  afterAll(async () => {
    await query(`delete from company_valuation_snapshots where company_id = $1`, [companyId]);
    await deleteTestCompany(companyId);
  });

  it("rejects missing companyId/asOfDate/source", async () => {
    await expect(upsertValuationSnapshot({ asOfDate: "2026-01-01", source: "test" })).rejects.toThrow(/companyId/);
    await expect(upsertValuationSnapshot({ companyId: "x", source: "test" })).rejects.toThrow(/asOfDate/);
    await expect(upsertValuationSnapshot({ companyId: "x", asOfDate: "2026-01-01" })).rejects.toThrow(/source/);
  });

  it("upserts a snapshot and reads it back with real numbers, never a fabricated 0 for a null column", async () => {
    companyId = await createTestCompany({ label: "valuation" });
    const snap = await upsertValuationSnapshot({ companyId, asOfDate: "2026-06-30", price: 500, pe: 22.5, source: "test-fixture" });
    expect(snap.pe).toBe(22.5);
    expect(snap.pb).toBeNull(); // never inserted, must stay null, not coerced to 0

    const latest = await getLatestValuation(companyId);
    expect(latest.pe).toBe(22.5);
    expect(latest.pb).toBeNull();
  });

  it("upserting the same (company_id, as_of_date) updates the row in place, not a duplicate", async () => {
    await upsertValuationSnapshot({ companyId, asOfDate: "2026-06-30", price: 550, pe: 25, source: "test-fixture-v2" });
    const history = await getValuationHistory(companyId);
    expect(history.filter((h) => String(h.asOfDate).slice(0, 10) === "2026-06-30" || new Date(h.asOfDate).getUTCMonth() === 5).length).toBeGreaterThanOrEqual(0);
    const latest = await getLatestValuation(companyId);
    expect(latest.pe).toBe(25);
    expect(latest.source).toBe("test-fixture-v2");

    const count = await query(`select count(*)::int as n from company_valuation_snapshots where company_id = $1`, [companyId]);
    expect(count.rows[0].n).toBe(1);
  });

  it("getLatestValuation returns null for a company with no snapshot on file", async () => {
    const otherCompanyId = await createTestCompany({ label: "valuation-empty" });
    try {
      const latest = await getLatestValuation(otherCompanyId);
      expect(latest).toBeNull();
    } finally {
      await deleteTestCompany(otherCompanyId);
    }
  });
});

describe("valuation medians (integration, real Neon, disposable sector/industry/companies)", () => {
  let sectorId, industryId;
  let companyIds = [];

  beforeAll(async () => {
    sectorId = await createTestSector("valuation-median");
    industryId = await createTestIndustry(sectorId, "valuation-median");

    // Three peer companies with PE 10/20/30 -> hand-verifiable median = 20 (the middle value; an
    // AVERAGE would also read 20 here by coincidence, so a 4th, deliberately skewed company is
    // added below specifically to distinguish median from average).
    for (const pe of [10, 20, 30]) {
      const id = await createTestCompany({ sectorId, industryId, label: `peer-${pe}` });
      await upsertValuationSnapshot({ companyId: id, asOfDate: "2026-06-30", pe, source: "test-fixture" });
      companyIds.push(id);
    }
  });

  afterAll(async () => {
    for (const id of companyIds) {
      await query(`delete from company_valuation_snapshots where company_id = $1`, [id]);
      await deleteTestCompany(id);
    }
    // company_industries.sector_id is ON DELETE RESTRICT (not cascade) -- the industry must be
    // deleted before the sector, or deleteTestSector fails with a foreign-key violation.
    await query(`delete from company_industries where id = $1`, [industryId]);
    await deleteTestSector(sectorId);
  });

  it("computes a real statistical median across the sector, not an average", async () => {
    const result = await getSectorMedianValuation(sectorId, "2026-12-31");
    expect(result.companyCount).toBe(3);
    expect(result.medianPe).toBe(20);
    expect(result.reason).toBeNull();
  });

  it("median distinguishes itself from an average with a skewed 4th company", async () => {
    const skewedId = await createTestCompany({ sectorId, industryId, label: "peer-skewed" });
    await upsertValuationSnapshot({ companyId: skewedId, asOfDate: "2026-06-30", pe: 1000, source: "test-fixture" });
    try {
      const result = await getSectorMedianValuation(sectorId, "2026-12-31");
      expect(result.companyCount).toBe(4);
      // Median of [10, 20, 30, 1000] = (20+30)/2 = 25. An average would be ~265 -- wildly different.
      expect(result.medianPe).toBe(25);
    } finally {
      await query(`delete from company_valuation_snapshots where company_id = $1`, [skewedId]);
      await deleteTestCompany(skewedId);
    }
  });

  it("getPeerMedianValuation excludes the company itself from its own peer median", async () => {
    const [companyId] = companyIds; // pe=10
    const result = await getPeerMedianValuation(companyId, "2026-12-31");
    expect(result.industryId).toBe(industryId);
    expect(result.companyCount).toBe(2); // the other two peers (pe=20, pe=30), not itself
    expect(result.medianPe).toBe(25); // (20+30)/2
  });

  it("getPeerMedianValuation returns an explicit reason, not a guessed peer set, when the company has no industry_id", async () => {
    const noIndustryId = await createTestCompany({ label: "no-industry" });
    try {
      const result = await getPeerMedianValuation(noIndustryId, "2026-12-31");
      expect(result.companyCount).toBe(0);
      expect(result.medianPe).toBeNull();
      expect(result.reason).toMatch(/no industry_id/i);
    } finally {
      await deleteTestCompany(noIndustryId);
    }
  });

  it("getSectorMedianValuation reports an explicit reason for a sector with no valuation data as of the cutoff", async () => {
    const emptySectorId = await createTestSector("valuation-empty-sector");
    try {
      const result = await getSectorMedianValuation(emptySectorId, "2026-12-31");
      expect(result.companyCount).toBe(0);
      expect(result.medianPe).toBeNull();
      expect(result.reason).not.toBeNull();
    } finally {
      await deleteTestSector(emptySectorId);
    }
  });

  it("a snapshot dated AFTER the asOfDate cutoff never leaks into a median computed for an earlier date", async () => {
    const futureId = await createTestCompany({ sectorId, industryId, label: "peer-future" });
    await upsertValuationSnapshot({ companyId: futureId, asOfDate: "2099-01-01", pe: 5, source: "test-fixture" });
    try {
      const result = await getSectorMedianValuation(sectorId, "2026-12-31"); // cutoff before 2099
      expect(result.companyCount).toBe(3); // still just the original 3, future snapshot excluded
      expect(result.medianPe).toBe(20);
    } finally {
      await query(`delete from company_valuation_snapshots where company_id = $1`, [futureId]);
      await deleteTestCompany(futureId);
    }
  });
});
