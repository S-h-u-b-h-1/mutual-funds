import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/platform/webhooks/core.js", () => ({ getWebhookMetrics: vi.fn() }));
vi.mock("../../../../lib/platform/webhooks/registry.js", () => ({ registeredWebhookProviders: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({}));

const { getWebhookMetrics } = await import("../../../../lib/platform/webhooks/core.js");
const { registeredWebhookProviders } = await import("../../../../lib/platform/webhooks/registry.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/internal/webhooks/status", () => {
  it("returns aggregate incoming/outbound counts plus registered providers", async () => {
    getWebhookMetrics.mockResolvedValue({
      incomingLast7d: [{ provider: "mock-payments", status: "processed", count: 3 }],
      outboundLast7d: [],
    });
    registeredWebhookProviders.mockReturnValue(["mock-payments"]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.incomingLast7d[0].count).toBe(3);
    expect(body.registeredProviders).toEqual(["mock-payments"]);
  });

  it("500s with the error message when the metrics query fails", async () => {
    getWebhookMetrics.mockRejectedValue(new Error("relation missing"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/relation missing/);
  });
});
