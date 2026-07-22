import { describe, it, expect, vi, beforeEach } from "vitest";

describe("GET /api/internal/providers/status", () => {
  beforeEach(() => vi.resetModules());

  it("returns real registered providers, a platform summary, and a generatedAt timestamp", async () => {
    const { GET } = await import("./route.js");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.providers.some((p) => p.name === "kyc")).toBe(true);
    expect(body.summary.totalProviders).toBeGreaterThanOrEqual(5);
    expect(body.generatedAt).toBeTruthy();
  });

  it("500s with the error message when the registry query fails", async () => {
    vi.doMock("../../../../lib/platform/providerRegistry/core.js", () => ({
      getAllProviderStatuses: () => {
        throw new Error("registry corrupted");
      },
      getPlatformProviderSummary: () => ({}),
    }));
    vi.doMock("../../../../lib/invest/providers/index.js", () => ({}));
    const { GET } = await import("./route.js");
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/registry corrupted/);
  });
});
