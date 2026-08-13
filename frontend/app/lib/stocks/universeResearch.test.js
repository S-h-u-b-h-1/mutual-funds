import { describe, expect, it } from "vitest";
import { companyResearchHref, getCompanyPeers, getCompanyResearch, getOfficialCompanyResearchLinks, getTradingViewSymbol } from "./universe";

describe("stock company research", () => {
  it("resolves a NIFTY company and preserves its official membership evidence", () => {
    const company = getCompanyResearch("RELIANCE");
    expect(company.name).toContain("Reliance");
    expect(company.memberships.some((membership) => membership.key === "NIFTY50")).toBe(true);
    expect(company.memberships.some((membership) => membership.key === "BSE100")).toBe(true);
    expect(company.bseCode).toBeTruthy();
    expect(companyResearchHref(company)).toBe("/stocks/company/RELIANCE");
  });

  it("builds official filing routes only from available exchange identifiers", () => {
    const company = getCompanyResearch("RELIANCE");
    const links = getOfficialCompanyResearchLinks(company);
    expect(links.some((link) => link.href.includes("symbol=RELIANCE"))).toBe(true);
    expect(links.every((link) => link.href.startsWith("https://"))).toBe(true);
  });

  it("does not invent a company when an identifier is unknown", () => {
    expect(getCompanyResearch("NOT-A-REAL-SECURITY")).toBeNull();
  });

  it("builds a market symbol and conservative same-industry peers", () => {
    const company = getCompanyResearch("RELIANCE");
    const peers = getCompanyPeers(company);
    expect(getTradingViewSymbol(company)).toBe("NSE:RELIANCE");
    expect(peers.every((peer) => peer.industry === company.industry)).toBe(true);
    expect(peers.every((peer) => peer.nseSymbol !== company.nseSymbol)).toBe(true);
  });
});
