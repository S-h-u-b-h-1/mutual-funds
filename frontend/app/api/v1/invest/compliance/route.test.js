import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/complianceService.js", () => ({ getComplianceProgress: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { getComplianceProgress } = await import("../../../../lib/invest/complianceService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/compliance", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the compliance progress for the signed-in user", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getComplianceProgress.mockResolvedValue({ overallStatus: "in_progress", percent: 44, completed: 4, total: 9, items: [] });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.percent).toBe(44);
    expect(getComplianceProgress).toHaveBeenCalledWith("user-1");
  });
});
