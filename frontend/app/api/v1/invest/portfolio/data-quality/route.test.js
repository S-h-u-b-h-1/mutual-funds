import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/portfolioService.js", () => ({ getPortfolioDataQuality: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getPortfolioDataQuality } = await import("../../../../../lib/invest/portfolioService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/portfolio/data-quality", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("wraps the service result in { dataQuality }", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioDataQuality.mockResolvedValue({ calculatedAt: "2026-07-24T05:00:00.000Z", datasetAsOf: "2026-07-22", staleHoldingCount: 1 });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.dataQuality.datasetAsOf).toBe("2026-07-22");
    expect(getPortfolioDataQuality).toHaveBeenCalledWith("user-1");
  });
});
