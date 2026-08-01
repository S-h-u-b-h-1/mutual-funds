import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  addOwnershipRecord, getOwnership, addManagementRecord, getManagement,
  addSubsidiary, getSubsidiaries, addBusinessSegment, getBusinessSegments, getCompanyPageContract,
} from "./companyProfile.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";

describe("companyProfile (integration, real Neon, disposable company)", () => {
  let companyId;

  beforeAll(async () => {
    companyId = await createTestCompany({ label: "profile" });
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
  });

  it("records ownership only with as_of_date and source — refuses provenance-free data", async () => {
    await expect(addOwnershipRecord({ companyId, holderType: "promoter", holdingPercent: 55.2 })).rejects.toThrow(/requires asOfDate and source/);

    await addOwnershipRecord({ companyId, holderType: "promoter", holderName: "Founder Family", holdingPercent: 55.2, asOfDate: "2026-06-30", source: "unit-test" });
    await addOwnershipRecord({ companyId, holderType: "institutional", holdingPercent: 20.1, asOfDate: "2026-06-30", source: "unit-test" });

    const ownership = await getOwnership(companyId);
    expect(ownership.length).toBe(2);
    expect(ownership.find((o) => o.holderType === "promoter").holdingPercent).toBe("55.2");
  });

  it("tracks management, filtering to current roles by default", async () => {
    await addManagementRecord({ companyId, personName: "Jane MD", role: "Managing Director", sinceDate: "2020-01-01", source: "unit-test" });
    await addManagementRecord({ companyId, personName: "Old CFO", role: "CFO", sinceDate: "2018-01-01", untilDate: "2024-01-01", source: "unit-test" });

    const current = await getManagement(companyId);
    expect(current.map((m) => m.personName)).toEqual(["Jane MD"]);

    const all = await getManagement(companyId, { currentOnly: false });
    expect(all.length).toBe(2);
  });

  it("records subsidiaries and business segments", async () => {
    await addSubsidiary({ companyId, subsidiaryName: "Alpha Exports Pvt Ltd", relationship: "subsidiary", ownershipPercent: 100, source: "unit-test" });
    const subs = await getSubsidiaries(companyId);
    expect(subs.some((s) => s.subsidiaryName === "Alpha Exports Pvt Ltd")).toBe(true);

    await addBusinessSegment({ companyId, segmentName: "Consumer Products", revenueSharePercent: 65, source: "unit-test" });
    await addBusinessSegment({ companyId, segmentName: "Industrial", revenueSharePercent: 35, source: "unit-test" });
    const segments = await getBusinessSegments(companyId);
    expect(segments[0].segmentName).toBe("Consumer Products"); // sorted by revenue share desc
  });

  it("assembles the full company page contract in one call", async () => {
    const contract = await getCompanyPageContract(companyId);
    expect(contract.company.id).toBe(companyId);
    expect(contract.ownership.length).toBeGreaterThan(0);
    expect(contract.management.length).toBeGreaterThan(0);
    expect(contract.subsidiaries.length).toBeGreaterThan(0);
    expect(contract.businessSegments.length).toBeGreaterThan(0);
  });

  it("returns null (not a partial object) for a company that does not exist", async () => {
    const contract = await getCompanyPageContract("00000000-0000-0000-0000-000000000000");
    expect(contract).toBeNull();
  });
});
