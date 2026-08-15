import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/distributionCompliance.js", () => ({ getDistributionExecutionReadiness: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { getDistributionExecutionReadiness } = await import("../../../../lib/invest/distributionCompliance.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/execution-readiness", () => {
  it("requires an authenticated investor", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns the platform execution gate without credential values", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getDistributionExecutionReadiness.mockResolvedValue({ mode: "blocked", liveExecutionReady: false, controls: [] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).readiness.liveExecutionReady).toBe(false);
  });
});
