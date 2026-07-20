// Journey 1 (Investment Readiness) end-to-end verification, per explicit instruction: "Before
// moving forward, verify this journey works end-to-end." Unlike Phase 1's tests — which either
// mocked the service layer (route tests) or called services directly (integration tests) — this
// drives the ACTUAL route handlers Codex will call, against real Neon, with only auth() mocked.
// Investor -> Profile -> Compliance -> Risk Profile -> Investment Ready -> Dashboard, exactly as
// specified, through the real HTTP-shaped interface.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createTestUser, deleteTestUser } from "../../../lib/invest/testHelpers.js";

vi.mock("../../../lib/auth.js", () => ({ auth: vi.fn() }));

const { auth } = await import("../../../lib/auth.js");
const profileRoute = await import("./profile/route.js");
const accountRoute = await import("./account/route.js");
const riskProfileRoute = await import("./risk-profile/route.js");
const complianceRoute = await import("./compliance/route.js");
const complianceItemRoute = await import("./compliance/items/[itemKey]/route.js");

function jsonRequest(body) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

// restoreAllMocks() resets EVERY mock function, including auth() itself (it's a vi.fn(), not a
// vi.spyOn() wrapping a real implementation, so "restore" clears it back to a bare stub) — so
// the session has to be re-established every test, not just once in beforeAll.
afterEach(() => vi.restoreAllMocks());

describe("Journey 1 — Investment Readiness, end-to-end through real routes + real Neon", () => {
  let userId;

  beforeAll(async () => {
    userId = await createTestUser("journey1");
  });

  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: userId } });
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("a fresh investor starts with an empty dashboard", async () => {
    const res = await profileRoute.GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile).toBeNull();
    expect(body.account).toBeNull();
    expect(body.onboarding.percent).toBe(0);
  });

  it("completes the profile", async () => {
    const res = await profileRoute.PUT(jsonRequest({ occupation: "Engineer", city: "Bengaluru", annualIncomeBand: "10-25L" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile.occupation).toBe("Engineer");
  });

  it("opens an investment account", async () => {
    const res = await accountRoute.POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.account.status).toBe("active");
  });

  it("completes the risk questionnaire", async () => {
    const res = await riskProfileRoute.PUT(jsonRequest({
      horizonScore: 4, lossToleranceScore: 3, incomeStabilityScore: 4, experienceScore: 3,
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.riskProfile.risk_category).toBe("moderate");
  });

  it("clears every compliance item through the real route, mobile through FATCA", async () => {
    async function submit(itemKey, payload) {
      return complianceItemRoute.POST(jsonRequest(payload), { params: Promise.resolve({ itemKey }) });
    }

    let res = await submit("mobile", { otp: "123456" });
    expect((await res.json()).item.status).toBe("completed");

    res = await submit("email", { otp: "123456" });
    expect((await res.json()).item.status).toBe("completed");

    // Targeted per-spy .mockRestore() below, never vi.restoreAllMocks() mid-test — that call
    // resets EVERY mock including auth() (see the module-level comment above afterEach), which
    // would 401 every submission after the first reset.
    let randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1); // force the mock KYC provider's "verified" bucket
    res = await submit("pan", { pan: "ABCDE1234F" });
    expect((await res.json()).item.status).toBe("verified");
    randomSpy.mockRestore();

    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    res = await submit("identity", { pan: "ABCDE1234F", consentToken: "consent_journey1" });
    expect((await res.json()).item.status).toBe("verified");
    randomSpy.mockRestore();

    res = await submit("nominee", { name: "Journey Nominee", relationship: "Spouse", allocationPct: 100 });
    expect((await res.json()).item.status).toBe("completed");

    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1); // force the penny-drop mock's success branch
    res = await submit("bank", { accountNumber: "000111222333", ifsc: "HDFC0000001", accountHolderName: "Journey Test" });
    expect((await res.json()).item.status).toBe("completed");
    randomSpy.mockRestore();

    res = await submit("fatca", { declared: true });
    expect((await res.json()).item.status).toBe("completed");

    res = await submit("risk_profile", {});
    expect((await res.json()).item.status).toBe("completed");
  }, 90000);

  it("investment_ready auto-completes and GET /compliance reports 100%", async () => {
    const res = await complianceRoute.GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.overallStatus).toBe("completed");
    expect(body.percent).toBe(100);
    const investmentReady = body.items.find((i) => i.item_key === "investment_ready");
    expect(investmentReady.status).toBe("completed");
  });

  it("the dashboard (GET /profile) now reflects a fully investment-ready investor", async () => {
    const res = await profileRoute.GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.profile.occupation).toBe("Engineer");
    expect(body.account.status).toBe("active");
    expect(body.onboarding.overallStatus).toBe("completed");
    expect(body.onboarding.percent).toBe(100);
  });
});
