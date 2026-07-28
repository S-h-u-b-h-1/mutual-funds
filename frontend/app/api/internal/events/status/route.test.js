import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../lib/platform/events/core.js", () => ({ getEventMetrics: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({}));

const { getEventMetrics } = await import("../../../../lib/platform/events/core.js");
const { GET } = await import("./route.js");

// M10: this route is gated behind checkInternalSecret() — every call needs the matching header.
const SECRET = "test-internal-status-secret";
function authedRequest() {
  return { headers: new Headers({ "x-internal-secret": SECRET }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_STATUS_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.INTERNAL_STATUS_SECRET;
});

describe("GET /api/internal/events/status", () => {
  it("returns the metrics payload plus a generatedAt timestamp", async () => {
    getEventMetrics.mockResolvedValue({
      last24h: [{ event_type: "OrderCompleted", count: 3 }],
      last7d: [{ event_type: "OrderCompleted", count: 10 }],
      catalog: ["OrderCompleted"],
      registeredListeners: { InvestmentReady: ["notify-investor"] },
    });
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.last24h[0].count).toBe(3);
    expect(body.registeredListeners.InvestmentReady).toEqual(["notify-investor"]);
    expect(body.generatedAt).toBeTruthy();
  });

  it("500s with a generic message when the metrics query fails, not the raw error", async () => {
    // M10: catch blocks now log the real error server-side (logError) and return a generic
    // message instead of interpolating err.message into the response — deliberate, not a bug.
    getEventMetrics.mockRejectedValue(new Error("relation missing"));
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("Event metrics query failed.");
    expect(body.error).not.toMatch(/relation missing/);
  });
});
