import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/portfolioService.js", () => ({ getPortfolioTimeline: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getPortfolioTimeline } = await import("../../../../../lib/invest/portfolioService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/portfolio/history", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });

  it("defaults to limit=50 when no query param is given", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioTimeline.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/portfolio/history"));
    expect(getPortfolioTimeline).toHaveBeenCalledWith("user-1", { limit: 50 });
  });

  it("passes through a valid ?limit=", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioTimeline.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/portfolio/history?limit=10"));
    expect(getPortfolioTimeline).toHaveBeenCalledWith("user-1", { limit: 10 });
  });

  it("clamps an out-of-range ?limit= into [1, 200]", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioTimeline.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/portfolio/history?limit=9999"));
    expect(getPortfolioTimeline).toHaveBeenCalledWith("user-1", { limit: 200 });

    await GET(new Request("http://x/api/v1/invest/portfolio/history?limit=-5"));
    expect(getPortfolioTimeline).toHaveBeenCalledWith("user-1", { limit: 1 });
  });

  it("?limit=0 resolves to the default of 50, not 0 — parseInt('0') is falsy so `|| 50` catches it too", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioTimeline.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/portfolio/history?limit=0"));
    expect(getPortfolioTimeline).toHaveBeenCalledWith("user-1", { limit: 50 });
  });

  it("falls back to the default for a non-numeric ?limit=", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioTimeline.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/portfolio/history?limit=not-a-number"));
    expect(getPortfolioTimeline).toHaveBeenCalledWith("user-1", { limit: 50 });
  });

  it("wraps the service result in { events }", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getPortfolioTimeline.mockResolvedValue([{ type: "order_status", label: "Units allotted" }]);
    const res = await GET(new Request("http://x/api/v1/invest/portfolio/history"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(1);
  });
});
