import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  createCompany, getCompanyById, getCompanyByIdentifier, searchCompanies,
  renameCompanyIdentifier, getIdentifierHistory, addExchangeListing, delistExchangeListing, getExchangeListings,
  normalizeCompanyName,
} from "./companyService.js";
import { deleteTestCompany } from "./testHelpers.js";

describe("companyService (integration, real Neon, disposable companies)", () => {
  let companyId;

  afterAll(async () => {
    await deleteTestCompany(companyId);
  });

  it("creates a company and reads it back by id and by every identifier", async () => {
    const suffix = `${Date.now()}`;
    const company = await createCompany({
      legalName: `Alpha Test Industries ${suffix} Ltd`,
      displayName: `Alpha Test ${suffix}`,
      isin: `INALPHA${suffix}`.slice(0, 12).toUpperCase(),
      nseSymbol: `ALPHA${suffix}`.slice(0, 15).toUpperCase(),
      bseCode: `500${suffix}`.slice(0, 9),
    });
    companyId = company.id;

    expect(company.legalName).toBe(`Alpha Test Industries ${suffix} Ltd`);
    expect(company.listingStatus).toBe("listed");

    const byId = await getCompanyById(companyId);
    expect(byId.id).toBe(companyId);

    const byIsin = await getCompanyByIdentifier({ isin: company.isin });
    expect(byIsin.id).toBe(companyId);

    const byNseSymbol = await getCompanyByIdentifier({ nseSymbol: company.nseSymbol });
    expect(byNseSymbol.id).toBe(companyId);

    const byBseCode = await getCompanyByIdentifier({ bseCode: company.bseCode });
    expect(byBseCode.id).toBe(companyId);

    const notFound = await getCompanyByIdentifier({ isin: "INNOPE00000" });
    expect(notFound).toBeNull();

    // Third-tier fallback: no ISIN/NSE/BSE match, but a normalized-name match against the same
    // company under a differently-punctuated/differently-cased name — e.g. reconciling a
    // BSE-100-only source row (no ISIN in that feed) against a company already created from NSE.
    const byNormalizedName = await getCompanyByIdentifier({ name: `ALPHA TEST INDUSTRIES ${suffix} LTD.` });
    expect(byNormalizedName?.id).toBe(companyId);

    const noNameMatch = await getCompanyByIdentifier({ name: "Definitely Not A Real Company Ltd" });
    expect(noNameMatch).toBeNull();
  });

  it("normalizeCompanyName treats legal-suffix/punctuation/case variants as equal", () => {
    expect(normalizeCompanyName("Adani Enterprises Ltd.")).toBe(normalizeCompanyName("ADANI ENTERPRISES LTD."));
    expect(normalizeCompanyName("Mahindra & Mahindra Ltd.")).toBe(normalizeCompanyName("Mahindra and Mahindra Limited"));
    expect(normalizeCompanyName("Tata Motors Passenger Vehicles Ltd.")).not.toBe(normalizeCompanyName("Tata Motors Ltd."));
    expect(normalizeCompanyName("")).toBe("");
    expect(normalizeCompanyName(null)).toBe("");
  });

  it("finds the company via a partial display-name search", async () => {
    const results = await searchCompanies("Alpha Test");
    expect(results.some((c) => c.id === companyId)).toBe(true);
  });

  it("returns an empty array for a blank search term rather than every company", async () => {
    const results = await searchCompanies("   ");
    expect(results).toEqual([]);
  });

  it("renames a display name in place and records history — never a second company row", async () => {
    const before = await getCompanyById(companyId);
    const renamed = await renameCompanyIdentifier(companyId, {
      identifierType: "display_name",
      newValue: "Alpha Test Renamed",
      reason: "test rename",
      source: "unit-test",
    });
    expect(renamed.oldValue).toBe(before.displayName);
    expect(renamed.newValue).toBe("Alpha Test Renamed");

    const after = await getCompanyById(companyId);
    expect(after.displayName).toBe("Alpha Test Renamed");
    expect(after.id).toBe(companyId); // same row, not a new one

    const history = await getIdentifierHistory(companyId);
    expect(history.length).toBe(1);
    expect(history[0].identifierType).toBe("display_name");
    expect(history[0].newValue).toBe("Alpha Test Renamed");
  });

  it("rejects an invalid identifierType rather than silently doing nothing", async () => {
    await expect(renameCompanyIdentifier(companyId, { identifierType: "not_a_real_type", newValue: "x" })).rejects.toThrow(/invalid identifierType/);
  });

  it("adds and delists exchange listings independently per exchange", async () => {
    await addExchangeListing(companyId, { exchange: "NSE", symbolOrCode: `ALPHATEST${Date.now()}`, listedAt: "2020-01-01" });
    await addExchangeListing(companyId, { exchange: "BSE", symbolOrCode: `999${Date.now()}`.slice(0, 9), listedAt: "2020-01-01" });

    let listings = await getExchangeListings(companyId);
    expect(listings.filter((l) => l.isActive).length).toBe(2);

    const delisted = await delistExchangeListing(companyId, "NSE", "2026-01-01");
    expect(delisted.isActive).toBe(false);

    listings = await getExchangeListings(companyId);
    const nse = listings.find((l) => l.exchange === "NSE");
    const bse = listings.find((l) => l.exchange === "BSE");
    expect(nse.isActive).toBe(false);
    expect(bse.isActive).toBe(true); // delisting one exchange never touches the other
  });
});
