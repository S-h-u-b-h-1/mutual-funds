import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../lib/platform/jobs/core.js", () => ({ getJobMetrics: vi.fn() }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({ registeredTypes: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));

const { getJobMetrics } = await import("../../../../lib/platform/jobs/core.js");
const { registeredTypes } = await import("../../../../lib/platform/jobs/handlers/index.js");
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

describe("GET /api/internal/jobs/status", () => {
  it("returns aggregate metrics plus the registered handler set", async () => {
    getJobMetrics.mockResolvedValue({
      countsByStatus: { queued: 2, dead: 1 },
      oldestDueSeconds: 12,
      lastHour: { succeeded: 5, dead: 0 },
      deadByType: [],
      schedules: [{ name: "vault-retention-sweep-daily" }],
    });
    registeredTypes.mockReturnValue(["job-history-prune", "vault-retention-sweep"]);
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.countsByStatus.queued).toBe(2);
    expect(body.registeredHandlers).toContain("vault-retention-sweep");
    expect(body.generatedAt).toBeTruthy();
  });

  it("500s with a generic message when the metrics query fails, not the raw error", async () => {
    // M10: catch blocks now log the real error server-side (logError) and return a generic
    // message instead of interpolating err.message into the response — deliberate, not a bug.
    getJobMetrics.mockRejectedValue(new Error("relation does not exist"));
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("Job metrics query failed.");
    expect(body.error).not.toMatch(/relation does not exist/);
  });
});
