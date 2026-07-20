import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/portfolioService.js", () => ({ getPortfolioAllocation: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getPortfolioAllocation } = await import("../../../../../lib/invest/portfolioService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/portfolio/allocation", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("wraps the service result in { allocation }", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioAllocation.mockResolvedValue({ amc: [{ name: "Axis", pct: 40 }], category: [], benchmark: [], sector: null });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.allocation.amc[0].name).toBe("Axis");
    expect(getPortfolioAllocation).toHaveBeenCalledWith("user-1");
  });
});
