import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../lib/platform/reconciliation/core.js", () => ({ getReconciliationMetrics: vi.fn() }));
vi.mock("../../../../lib/platform/reconciliation/registry.js", () => ({ registeredComparators: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({}));

const { getReconciliationMetrics } = await import("../../../../lib/platform/reconciliation/core.js");
const { registeredComparators } = await import("../../../../lib/platform/reconciliation/registry.js");
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

describe("GET /api/internal/reconciliation/status", () => {
  it("returns open-exception counts, last runs, and registered comparators", async () => {
    getReconciliationMetrics.mockResolvedValue({
      openExceptions: [{ recon_type: "holdings-vs-provider", status: "mismatch", count: 2 }],
      lastRuns: [{ recon_type: "holdings-vs-provider", status: "completed" }],
    });
    registeredComparators.mockReturnValue(["holdings-vs-provider"]);
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.openExceptions[0].count).toBe(2);
    expect(body.registeredComparators).toEqual(["holdings-vs-provider"]);
  });

  it("500s with a generic message when the metrics query fails, not the raw error", async () => {
    // M10: catch blocks now log the real error server-side (logError) and return a generic
    // message instead of interpolating err.message into the response — deliberate, not a bug.
    getReconciliationMetrics.mockRejectedValue(new Error("relation missing"));
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("Reconciliation metrics query failed.");
    expect(body.error).not.toMatch(/relation missing/);
  });
});
