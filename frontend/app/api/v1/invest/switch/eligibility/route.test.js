import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/switchService.js", () => ({ getSwitchEligibility: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getSwitchEligibility } = await import("../../../../../lib/invest/switchService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/switch/eligibility", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/v1/invest/switch/eligibility?source=119551&destination=100033"));
    expect(res.status).toBe(401);
  });

  it("400s when either query parameter is missing", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    const res = await GET(new Request("http://x/api/v1/invest/switch/eligibility?source=119551"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/'source' and 'destination'/);
    expect(getSwitchEligibility).not.toHaveBeenCalled();
  });

  it("400s and surfaces a same-AMC error", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getSwitchEligibility.mockRejectedValue(new Error("Not eligible: Switch requires the same AMC on both sides."));
    const res = await GET(new Request("http://x/api/v1/invest/switch/eligibility?source=119551&destination=100219"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/same AMC/);
  });

  it("200s with the eligibility contract, passing both codes through", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getSwitchEligibility.mockResolvedValue({ sourceSchemeCode: "119551", destinationSchemeCode: "100033", eligible: true });
    const res = await GET(new Request("http://x/api/v1/invest/switch/eligibility?source=119551&destination=100033"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.eligibility.eligible).toBe(true);
    expect(getSwitchEligibility).toHaveBeenCalledWith("user-1", "119551", "100033");
  });
});
