import { describe, expect, it, afterAll } from "vitest";
import { query } from "../db.js";
import { syncIndexMembership, getIndexMembers, getOrCreateIndex, listIndices } from "./indexMembership.js";
import { getCompanyByIdentifier } from "./companyService.js";
import { deleteTestCompany } from "./testHelpers.js";

// A disposable test index (never "NIFTY50"/"BSE100") so this suite never touches or is confused
// with the real universe sync — deleteTestIndex below is this file's own cleanup, mirroring
// testHelpers.js's deleteTestCompany pattern for the one new table it doesn't already cover.
async function deleteTestIndex(indexKey) {
  await query(`delete from stock_indices where key = $1`, [indexKey]);
}

describe("indexMembership (integration, real Neon, disposable index + companies)", () => {
  const suffix = `${Date.now()}`;
  const indexKey = `TESTIDX${suffix}`;
  const isinA = `INTESTA${suffix}`.slice(0, 12).toUpperCase();
  const isinB = `INTESTB${suffix}`.slice(0, 12).toUpperCase();
  const bseOnlyCode = `700${suffix}`.slice(0, 9);
  let companyAId, companyBId, companyCId;

  afterAll(async () => {
    await deleteTestCompany(companyAId);
    await deleteTestCompany(companyBId);
    await deleteTestCompany(companyCId);
    await deleteTestIndex(indexKey);
  });

  it("creates companies and opens memberships on first sync", async () => {
    const result = await syncIndexMembership({
      indexKey,
      indexName: `Test Index ${suffix}`,
      provider: "Test Provider",
      constituents: [
        { name: `Test Alpha Co ${suffix} Ltd`, isin: isinA, nseSymbol: `TALPHA${suffix}`.slice(0, 15) },
        { name: `Test Beta Co ${suffix} Ltd`, isin: isinB, nseSymbol: `TBETA${suffix}`.slice(0, 15) },
      ],
      source: "Test Provider",
      sourceEffectiveDate: "2026-08-01",
      retrievedAt: "2026-08-01T00:00:00Z",
    });
    expect(result.total).toBe(2);
    expect(result.opened).toBe(2);
    expect(result.closed).toBe(0);

    const companyA = await getCompanyByIdentifier({ isin: isinA });
    const companyB = await getCompanyByIdentifier({ isin: isinB });
    expect(companyA).toBeTruthy();
    expect(companyB).toBeTruthy();
    companyAId = companyA.id;
    companyBId = companyB.id;

    const members = await getIndexMembers(indexKey);
    expect(members.length).toBe(2);
    expect(members.every((m) => m.isCurrent)).toBe(true);
    expect(members.every((m) => m.joinedAt === "2026-08-01")).toBe(true);
  });

  it("re-syncing with an unchanged constituent list opens/closes nothing", async () => {
    const result = await syncIndexMembership({
      indexKey,
      indexName: `Test Index ${suffix}`,
      provider: "Test Provider",
      constituents: [
        { name: `Test Alpha Co ${suffix} Ltd`, isin: isinA, nseSymbol: `TALPHA${suffix}`.slice(0, 15) },
        { name: `Test Beta Co ${suffix} Ltd`, isin: isinB, nseSymbol: `TBETA${suffix}`.slice(0, 15) },
      ],
      source: "Test Provider",
      sourceEffectiveDate: "2026-08-02",
      retrievedAt: "2026-08-02T00:00:00Z",
    });
    expect(result.opened).toBe(0);
    expect(result.closed).toBe(0);
    expect(result.unchanged).toBe(2);
  });

  it("a name-only match (no isin/nse/bse) backfills the missing identifier onto the existing company, never creating a duplicate", async () => {
    const before = await getCompanyByIdentifier({ isin: isinA });
    expect(before.bseCode).toBeNull();

    const result = await syncIndexMembership({
      indexKey,
      indexName: `Test Index ${suffix}`,
      provider: "Test Provider",
      constituents: [
        // Same company as isinA, but this "source" only supplies name + bseCode (mirrors BSE 100's
        // real shape: no ISIN in that feed) — must resolve to the SAME company, not create a new one.
        { name: `TEST ALPHA CO ${suffix} LTD.`, isin: null, nseSymbol: null, bseCode: bseOnlyCode },
        { name: `Test Gamma Co ${suffix} Ltd`, isin: null, nseSymbol: null, bseCode: `800${suffix}`.slice(0, 9) },
      ],
      source: "Test Provider Two",
      sourceEffectiveDate: "2026-08-03",
      retrievedAt: "2026-08-03T00:00:00Z",
    });
    // Only Gamma is "opened" -- Alpha already has a current membership for this index from the
    // first sync (its identifier got backfilled, but it was never NOT a member), so re-listing it
    // here correctly touches zero membership rows, matching the idempotent-unless-changed contract
    // the previous test already exercises.
    expect(result.opened).toBe(1);

    const after = await getCompanyByIdentifier({ isin: isinA });
    expect(after.id).toBe(before.id); // same company row, not a duplicate
    expect(after.bseCode).toBe(bseOnlyCode);

    const gamma = await getCompanyByIdentifier({ bseCode: `800${suffix}`.slice(0, 9) });
    companyCId = gamma.id;

    const allCompanies = await query(`select count(*)::int as n from companies where isin = $1`, [isinA]);
    expect(allCompanies.rows[0].n).toBe(1); // never duplicated
  });

  it("an unambiguous truncated-name prefix match reconciles to the existing company (BSE's real fixed-width SCRIPNAME truncation), never a duplicate", async () => {
    const longName = `Test Delta Special Economic Extended Company ${suffix} Ltd`;
    const truncatedName = longName.slice(0, 30); // mirrors BSE's real ~30-char truncation
    const deltaIsin = `INTESTD${suffix}`.slice(0, 12).toUpperCase();

    const first = await syncIndexMembership({
      indexKey: `${indexKey}B`,
      indexName: "Prefix Test Index A",
      provider: "Test Provider",
      constituents: [{ name: longName, isin: deltaIsin }],
      source: "Test Provider",
      retrievedAt: "2026-08-05T00:00:00Z",
    });
    expect(first.opened).toBe(1);

    const deltaCompany = await getCompanyByIdentifier({ isin: deltaIsin });
    const second = await syncIndexMembership({
      indexKey: `${indexKey}C`,
      indexName: "Prefix Test Index B",
      provider: "Test Provider Two",
      // No isin/nseSymbol/bseCode at all here -- exactly BSE100's real shape when it independently
      // lists a company NIFTY 50 already created: name-only, and truncated at that.
      constituents: [{ name: truncatedName }],
      source: "Test Provider Two",
      retrievedAt: "2026-08-05T00:00:00Z",
    });
    expect(second.opened).toBe(1); // a new MEMBERSHIP row (different index), not a new COMPANY

    const stillOne = await query(`select count(*)::int as n from companies where isin = $1`, [deltaIsin]);
    expect(stillOne.rows[0].n).toBe(1); // never duplicated despite the truncated name

    const membersB = await getIndexMembers(`${indexKey}C`);
    expect(membersB.length).toBe(1);
    expect(membersB[0].companyId).toBe(deltaCompany.id); // resolved to the SAME company

    await deleteTestIndex(`${indexKey}B`);
    await deleteTestIndex(`${indexKey}C`);
    await deleteTestCompany(deltaCompany.id);
  });

  it("closes a membership for a company no longer in the constituent list", async () => {
    const result = await syncIndexMembership({
      indexKey,
      indexName: `Test Index ${suffix}`,
      provider: "Test Provider",
      constituents: [{ name: `Test Alpha Co ${suffix} Ltd`, isin: isinA }],
      source: "Test Provider",
      sourceEffectiveDate: "2026-08-04",
      retrievedAt: "2026-08-04T00:00:00Z",
    });
    expect(result.closed).toBeGreaterThanOrEqual(1);

    const members = await getIndexMembers(indexKey);
    expect(members.some((m) => m.companyId === companyBId)).toBe(false); // beta dropped out
    expect(members.some((m) => m.companyId === companyAId)).toBe(true); // alpha stays current
  });

  it("getOrCreateIndex is idempotent and listIndices includes the test index", async () => {
    const first = await getOrCreateIndex({ key: indexKey, name: "Renamed Test Index", provider: "Test Provider" });
    const second = await getOrCreateIndex({ key: indexKey, name: "Renamed Test Index", provider: "Test Provider" });
    expect(first.id).toBe(second.id);

    const all = await listIndices();
    expect(all.some((i) => i.key === indexKey && i.name === "Renamed Test Index")).toBe(true);
  });

  it("rejects an empty constituent list rather than silently wiping membership", async () => {
    await expect(
      syncIndexMembership({ indexKey, indexName: "x", provider: "x", constituents: [], source: "x", retrievedAt: "2026-08-01T00:00:00Z" })
    ).rejects.toThrow(/non-empty constituents/);
  });
});
