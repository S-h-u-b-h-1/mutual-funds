import { describe, expect, it } from "vitest";
import { getCompanyResearch, getStockIndustryGroups, getUniqueStockUniverse } from "./universe.js";
import { getIndustryResearchModel, getOpenCompanyProfile, getProfileCoverage } from "./researchProfiles.js";

describe("open company research profiles", () => {
  it("covers every universe company with a sourced or explicit index-derived description", () => {
    const companies = getUniqueStockUniverse();
    expect(companies).toHaveLength(100);
    expect(companies.every((company) => getOpenCompanyProfile(company).description.length > 40)).toBe(true);
  });

  it("verifies the Asian Paints profile using its ISIN", () => {
    const profile = getOpenCompanyProfile(getCompanyResearch("ASIANPAINT"));
    expect(profile.matchBasis).toBe("verified_isin");
    expect(profile.description.toLowerCase()).toContain("paint");
    expect(profile.officialWebsite).toContain("asianpaints.com");
  });

  it("provides sector-specific KPI and risk frameworks", () => {
    expect(getIndustryResearchModel("Financial Services").kpis).toContain("NIM / VNB margin");
    expect(getIndustryResearchModel("Commodities").risks).toContain("Peak-cycle extrapolation");
    expect(Object.keys(getStockIndustryGroups()).length).toBeGreaterThan(8);
    expect(getProfileCoverage()).toMatchObject({ sourced: 32, total: 100 });
  });
});
