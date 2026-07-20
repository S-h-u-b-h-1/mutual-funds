import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/portfolioService.js", () => ({ getPortfolioSummary: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getPortfolioSummary } = await import("../../../../../lib/invest/portfolioService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/portfolio/summary", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("wraps the service result in { summary }", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioSummary.mockResolvedValue({ totalValue: 50000, holdingsCount: 4 });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.summary.totalValue).toBe(50000);
    expect(getPortfolioSummary).toHaveBeenCalledWith("user-1");
  });
});
