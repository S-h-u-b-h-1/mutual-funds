import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/redemptionService.js", () => ({ getRedemptionEligibility: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { getRedemptionEligibility } = await import("../../../../../../lib/invest/redemptionService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/redemption/[schemeCode]/eligibility", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ schemeCode: "119551" }) });
    expect(res.status).toBe(401);
  });

  it("400s and surfaces an unknown-scheme error", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getRedemptionEligibility.mockRejectedValue(new Error("Unknown scheme code 'bogus': cannot resolve fund/NAV data."));
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ schemeCode: "bogus" }) });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Unknown scheme code/);
  });

  it("200s with the eligibility contract for the signed-in user", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getRedemptionEligibility.mockResolvedValue({ schemeCode: "119551", eligible: true, folios: [] });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ schemeCode: "119551" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.eligibility.eligible).toBe(true);
    expect(getRedemptionEligibility).toHaveBeenCalledWith("user-1", "119551");
  });
});
