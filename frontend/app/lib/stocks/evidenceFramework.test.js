import { describe, expect, it } from "vitest";
import { FREE_RESEARCH_LANES, getEvidenceDossier } from "./evidenceFramework.js";

describe("stock evidence framework", () => {
  it("uses industry-specific operating evidence where available", () => {
    const bank = getEvidenceDossier("Private Sector Bank");
    expect(bank.operating.title).toContain("Banking");
    expect(bank.operating.metrics).toContain("GNPA / NNPA and credit cost");
  });

  it("fails back to a useful generic operating checklist", () => {
    const generic = getEvidenceDossier("Diversified Services");
    expect(generic.operating.metrics).toContain("Working capital");
    expect(generic.documents.some((item) => item.key === "results")).toBe(true);
    expect(generic.documents.some((item) => item.key === "governance")).toBe(true);
  });

  it("keeps conclusions downstream of evidence collection", () => {
    expect(FREE_RESEARCH_LANES.at(-1)[0]).toBe("What can be concluded?");
    expect(FREE_RESEARCH_LANES.at(-1)[1]).toContain("evidence is complete");
  });
});
