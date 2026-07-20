import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/portfolioService.js", () => ({ getPortfolioHoldings: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getPortfolioHoldings } = await import("../../../../../lib/invest/portfolioService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/portfolio/holdings", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns { holdings, unresolved } straight through from the service", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioHoldings.mockResolvedValue({ holdings: [{ schemeCode: "119551" }], unresolved: [] });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.holdings).toHaveLength(1);
    expect(body.unresolved).toEqual([]);
    expect(getPortfolioHoldings).toHaveBeenCalledWith("user-1");
  });
});
