import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../lib/platform/webhooks/core.js", () => ({ getWebhookMetrics: vi.fn() }));
vi.mock("../../../../lib/platform/webhooks/registry.js", () => ({ registeredWebhookProviders: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({}));

const { getWebhookMetrics } = await import("../../../../lib/platform/webhooks/core.js");
const { registeredWebhookProviders } = await import("../../../../lib/platform/webhooks/registry.js");
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

describe("GET /api/internal/webhooks/status", () => {
  it("returns aggregate incoming/outbound counts plus registered providers", async () => {
    getWebhookMetrics.mockResolvedValue({
      incomingLast7d: [{ provider: "mock-payments", status: "processed", count: 3 }],
      outboundLast7d: [],
    });
    registeredWebhookProviders.mockReturnValue(["mock-payments"]);
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.incomingLast7d[0].count).toBe(3);
    expect(body.registeredProviders).toEqual(["mock-payments"]);
  });

  it("500s with a generic message when the metrics query fails, not the raw error", async () => {
    // M10: catch blocks now log the real error server-side (logError) and return a generic
    // message instead of interpolating err.message into the response — deliberate, not a bug.
    getWebhookMetrics.mockRejectedValue(new Error("relation missing"));
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("Webhook metrics query failed.");
    expect(body.error).not.toMatch(/relation missing/);
  });
});
