import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// M10: this route is gated behind checkInternalSecret() — every call needs the matching header.
const SECRET = "test-internal-status-secret";
function authedRequest() {
  return { headers: new Headers({ "x-internal-secret": SECRET }) };
}

describe("GET /api/internal/providers/status", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.INTERNAL_STATUS_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.INTERNAL_STATUS_SECRET;
  });

  it("returns real registered providers, a platform summary, and a generatedAt timestamp", async () => {
    const { GET } = await import("./route.js");
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.providers.some((p) => p.name === "kyc")).toBe(true);
    expect(body.summary.totalProviders).toBeGreaterThanOrEqual(5);
    expect(body.generatedAt).toBeTruthy();
  });

  it("500s with a generic message when the registry query fails, not the raw error", async () => {
    // M10: catch blocks now log the real error server-side (logError) and return a generic
    // message instead of interpolating err.message into the response — deliberate, not a bug.
    vi.doMock("../../../../lib/platform/providerRegistry/core.js", () => ({
      getAllProviderStatuses: () => {
        throw new Error("registry corrupted");
      },
      getPlatformProviderSummary: () => ({}),
    }));
    vi.doMock("../../../../lib/invest/providers/index.js", () => ({}));
    const { GET } = await import("./route.js");
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("Provider registry query failed.");
    expect(body.error).not.toMatch(/registry corrupted/);
  });
});
