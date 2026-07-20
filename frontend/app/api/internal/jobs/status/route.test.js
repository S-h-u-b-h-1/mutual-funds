import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/platform/jobs/core.js", () => ({ getJobMetrics: vi.fn() }));
vi.mock("../../../../lib/platform/jobs/handlers/index.js", () => ({ registeredTypes: vi.fn() }));
vi.mock("../../../../lib/db.js", () => ({ hasDatabaseUrl: true }));

const { getJobMetrics } = await import("../../../../lib/platform/jobs/core.js");
const { registeredTypes } = await import("../../../../lib/platform/jobs/handlers/index.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

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
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.countsByStatus.queued).toBe(2);
    expect(body.registeredHandlers).toContain("vault-retention-sweep");
    expect(body.generatedAt).toBeTruthy();
  });

  it("500s with the error message when the metrics query fails", async () => {
    getJobMetrics.mockRejectedValue(new Error("relation does not exist"));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toMatch(/relation does not exist/);
  });
});
