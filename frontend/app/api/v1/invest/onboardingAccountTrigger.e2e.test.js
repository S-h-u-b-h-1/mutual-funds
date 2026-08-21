// Suasion real-investor launch path, P0: an audit of the live onboarding flow found that
// OnboardingFlow.jsx only ever called openAccount() from inside the "fatca" step's own submit
// handler (`if (stepId === "fatca" && result.overallStatus === "completed")`) -- but "pep" is the
// LAST step in the wizard's fixed order, so overallStatus can never actually be "completed" at
// the moment fatca is submitted; it only reaches "completed" when pep is submitted, by which
// point stepId is "pep", not "fatca", so the old condition was always false on every normal
// walkthrough. No real investor could ever open an account through the app as it existed --
// unconditionally, not just for PEP-decliners the way the earlier PEP-array bug worked.
//
// journey1-onboarding.e2e.test.js doesn't catch this: it calls accountRoute.POST() as its own
// independent step (before any compliance submission), never gated on compliance state the way
// the UI's trigger was supposed to be -- so it proves the service layer works without proving the
// UI's trigger logic ever actually calls it at the right time. This test targets exactly that gap:
// it drives the real compliance-item routes in the UI's real step order, watches for the exact
// step where overallStatus first flips to "completed", and only THEN calls the account route --
// mirroring OnboardingFlow.jsx's fixed condition (`if (result.overallStatus === "completed")`,
// no longer gated on which step name just fired) rather than the service-layer shortcut the
// existing Journey 1 test takes.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createTestUser, deleteTestUser } from "../../../lib/invest/testHelpers.js";

vi.mock("../../../lib/auth.js", () => ({ auth: vi.fn() }));

const { auth } = await import("../../../lib/auth.js");
const accountRoute = await import("./account/route.js");
const complianceItemRoute = await import("./compliance/items/[itemKey]/route.js");
const orderRoute = await import("./orders/route.js");
const riskProfileRoute = await import("./risk-profile/route.js");

function jsonRequest(body) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

afterEach(() => vi.restoreAllMocks());

describe("Onboarding account-open trigger, driven through the real routes in the wizard's actual step order", () => {
  let userId;

  beforeAll(async () => {
    userId = await createTestUser("onboard-trigger");
  });

  beforeEach(() => {
    auth.mockResolvedValue({ user: { id: userId } });
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("overallStatus only reaches completed at the LAST wizard step (pep), never earlier -- proving the old fatca-gated trigger could never fire", async () => {
    async function submit(itemKey, payload) {
      const res = await complianceItemRoute.POST(jsonRequest(payload), { params: Promise.resolve({ itemKey }) });
      return res.json();
    }

    // Exact order from OnboardingFlow.jsx's `steps` array (compliance-item steps only).
    let body = await submit("mobile", { otp: "123456", phoneNumber: "9876543210" });
    expect(body.overallStatus).not.toBe("completed");

    body = await submit("email", { otp: "123456" });
    expect(body.overallStatus).not.toBe("completed");

    let randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    body = await submit("pan", { pan: "ABCDE1234F" });
    randomSpy.mockRestore();
    expect(body.item.status).toBe("verified");
    expect(body.overallStatus).not.toBe("completed");

    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    body = await submit("identity", { pan: "ABCDE1234F", consentToken: "consent_trigger_test" });
    randomSpy.mockRestore();
    expect(body.item.status).toBe("verified");
    expect(body.overallStatus).not.toBe("completed");

    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    body = await submit("bank", { accountNumber: "000111222333", ifsc: "HDFC0000001", accountHolderName: "Onboard Trigger" });
    randomSpy.mockRestore();
    expect(body.overallStatus).not.toBe("completed");

    body = await submit("nominee", { name: "Trigger Nominee", relationship: "Spouse", allocationPct: 100 });
    expect(body.overallStatus).not.toBe("completed");

    const riskProfileResponse = await riskProfileRoute.PUT(jsonRequest({
      horizonScore: 4,
      lossToleranceScore: 3,
      incomeStabilityScore: 4,
      experienceScore: 3,
    }));
    expect(riskProfileResponse.status).toBe(200);

    body = await submit("risk_profile", {});
    expect(body.item.status).toBe("completed");
    expect(body.overallStatus).not.toBe("completed");

    // THE bug's exact precondition: fatca submits successfully, but overall compliance is not
    // yet complete -- the old `stepId === "fatca" && overallStatus === "completed"` check would
    // evaluate false right here, every single time, for every real investor.
    body = await submit("fatca", { declared: true, taxResidencyCountry: "IN", isUsPerson: false, isUsCitizen: false });
    expect(body.item.status).toBe("completed");
    expect(body.overallStatus).not.toBe("completed");

    // pep is what actually completes it -- the fixed component's unconditional
    // `if (result.overallStatus === "completed")` check (no stepId gate) fires correctly here.
    body = await submit("pep", { declared: false });
    expect(body.item.status).toBe("completed");
    expect(body.overallStatus).toBe("completed");

    // Confirm no account exists yet -- nothing so far has opened one.
    const before = await (await accountRoute.GET()).json();
    expect(before.account).toBeNull();

    // Mirror the fixed OnboardingFlow.jsx: call openAccount() because overallStatus just became
    // "completed", regardless of which step triggered it.
    const opened = await (await accountRoute.POST()).json();
    expect(opened.account.status).toBe("active");

    // Prove the full chain: this investor can now actually place an order -- the real-world
    // consequence of the bug was a raw, unactionable "active investment account is required"
    // error at exactly this call, with no account ever having been opened.
    const order = await (await orderRoute.POST(jsonRequest({ schemeCode: "100033", orderType: "purchase", amount: 1000, draft: true }))).json();
    expect(order.order).toBeTruthy();
    expect(order.order.status).toBe("draft");
  }, 180000);
});
