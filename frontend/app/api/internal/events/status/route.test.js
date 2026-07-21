import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/platform/events/core.js", () => ({ getEventMetrics: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({}));

const { getEventMetrics } = await import("../../../../lib/platform/events/core.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/internal/events/status", () => {
  it("returns the metrics payload plus a generatedAt timestamp", async () => {
    getEventMetrics.mockResolvedValue({
      last24h: [{ event_type: "OrderCompleted", count: 3 }],
      last7d: [{ event_type: "OrderCompleted", count: 10 }],
      catalog: ["OrderCompleted"],
      registeredListeners: { InvestmentReady: ["notify-investor"] },
    });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.last24h[0].count).toBe(3);
    expect(body.registeredListeners.InvestmentReady).toEqual(["notify-investor"]);
    expect(body.generatedAt).toBeTruthy();
  });

  it("500s with the error message when the metrics query fails", async () => {
    getEventMetrics.mockRejectedValue(new Error("relation missing"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/relation missing/);
  });
});
