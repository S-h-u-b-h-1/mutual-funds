// Route-layer tests only — auth() and identityService are both mocked, so these test the
// request/response CONTRACT (401 handling, response shape), not the contract-building logic
// itself (already covered by identityService.test.js's real-Neon getOnboardingContract tests).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/identityService.js", () => ({
  getOnboardingContract: vi.fn(),
}));

const { auth } = await import("../../../../lib/auth.js");
const identityService = await import("../../../../lib/invest/identityService.js");
const { GET } = await import("./route.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/invest/onboarding", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(identityService.getOnboardingContract).not.toHaveBeenCalled();
  });

  it("200s with investor + readiness + steps + nextAction when signed in", async () => {
    auth.mockResolvedValue({ user: { id: "user-1", name: "Test Investor", email: "test@example.com" } });
    identityService.getOnboardingContract.mockResolvedValue({
      readiness: { status: "in_progress", percent: 25, investmentReady: false },
      steps: [{ key: "mobile", status: "completed" }],
      nextAction: { key: "email", label: "Verify email address", reason: "pending" },
    });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.investor).toEqual({ id: "user-1", name: "Test Investor", email: "test@example.com" });
    expect(body.readiness.percent).toBe(25);
    expect(body.steps).toHaveLength(1);
    expect(body.nextAction.key).toBe("email");
    expect(identityService.getOnboardingContract).toHaveBeenCalledWith("user-1");
  });

  it("falls back to null name/email if the session doesn't carry them", async () => {
    auth.mockResolvedValue({ user: { id: "user-2" } });
    identityService.getOnboardingContract.mockResolvedValue({
      readiness: { status: "pending", percent: 0, investmentReady: false },
      steps: [],
      nextAction: null,
    });

    const res = await GET();
    const body = await res.json();
    expect(body.investor).toEqual({ id: "user-2", name: null, email: null });
  });
});
