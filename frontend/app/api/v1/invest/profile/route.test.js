// Route-layer tests only — auth() and identityService are both mocked, so these test the
// request/response CONTRACT (401 handling, correct service wiring, response shape), not the
// service logic itself (already covered by identityService.test.js's real-Neon integration tests).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/identityService.js", () => ({
  getProfile: vi.fn(),
  getAccount: vi.fn(),
  getPreferences: vi.fn(),
  getRmAssignment: vi.fn(),
  getOnboardingProgress: vi.fn(),
  upsertProfile: vi.fn(),
}));

const { auth } = await import("../../../../lib/auth.js");
const identityService = await import("../../../../lib/invest/identityService.js");
const { GET, PUT } = await import("./route.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/invest/profile", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("200s and returns the combined identity summary when signed in", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    identityService.getProfile.mockResolvedValue({ occupation: "Engineer" });
    identityService.getAccount.mockResolvedValue({ status: "active" });
    identityService.getPreferences.mockResolvedValue({ preferred_plan: "direct" });
    identityService.getRmAssignment.mockResolvedValue(null);
    identityService.getOnboardingProgress.mockResolvedValue({ percent: 40 });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile.occupation).toBe("Engineer");
    expect(body.onboarding.percent).toBe(40);
    expect(identityService.getProfile).toHaveBeenCalledWith("user-1");
  });
});

describe("PUT /api/v1/invest/profile", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400s on invalid JSON", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    const res = await PUT(new Request("http://x", { method: "PUT", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("passes the parsed body to upsertProfile and returns its result", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    identityService.upsertProfile.mockResolvedValue({ occupation: "Doctor" });

    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ occupation: "Doctor" }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile.occupation).toBe("Doctor");
    expect(identityService.upsertProfile).toHaveBeenCalledWith("user-1", { occupation: "Doctor" });
  });
});
