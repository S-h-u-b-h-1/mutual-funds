import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/portfolioService.js", () => ({ getPortfolio: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { getPortfolio } = await import("../../../../lib/invest/portfolioService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/portfolio", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns the combined portfolio view for the signed-in user", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolio.mockResolvedValue({ holdings: [{ schemeCode: "119551" }], summary: { holdingsCount: 1 } });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.holdings).toHaveLength(1);
    expect(body.summary.holdingsCount).toBe(1);
    expect(getPortfolio).toHaveBeenCalledWith("user-1");
  });
});
