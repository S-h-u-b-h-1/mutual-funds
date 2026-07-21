import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/platform/reconciliation/core.js", () => ({ getReconciliationMetrics: vi.fn() }));
vi.mock("../../../../lib/platform/reconciliation/registry.js", () => ({ registeredComparators: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({}));

const { getReconciliationMetrics } = await import("../../../../lib/platform/reconciliation/core.js");
const { registeredComparators } = await import("../../../../lib/platform/reconciliation/registry.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/internal/reconciliation/status", () => {
  it("returns open-exception counts, last runs, and registered comparators", async () => {
    getReconciliationMetrics.mockResolvedValue({
      openExceptions: [{ recon_type: "holdings-vs-provider", status: "mismatch", count: 2 }],
      lastRuns: [{ recon_type: "holdings-vs-provider", status: "completed" }],
    });
    registeredComparators.mockReturnValue(["holdings-vs-provider"]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.openExceptions[0].count).toBe(2);
    expect(body.registeredComparators).toEqual(["holdings-vs-provider"]);
  });

  it("500s with the error message when the metrics query fails", async () => {
    getReconciliationMetrics.mockRejectedValue(new Error("relation missing"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/relation missing/);
  });
});
