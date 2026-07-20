import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/portfolioService.js", () => ({ getPortfolioPerformance: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getPortfolioPerformance } = await import("../../../../../lib/invest/portfolioService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/portfolio/performance", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns the service result straight through, including an empty-state historyNote", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioPerformance.mockResolvedValue({ valuation: null, performanceLeaders: [], history: [], historyNote: "No holdings yet." });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.valuation).toBeNull();
    expect(body.historyNote).toMatch(/No holdings yet/);
    expect(getPortfolioPerformance).toHaveBeenCalledWith("user-1");
  });
});
