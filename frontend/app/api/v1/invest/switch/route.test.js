import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/switchService.js", () => ({ createSwitchOrder: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { createSwitchOrder } = await import("../../../../lib/invest/switchService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/switch", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400s and surfaces the service's eligibility error message", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createSwitchOrder.mockRejectedValue(new Error("Not eligible for switch: Switch requires the same AMC on both sides."));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ sourceSchemeCode: "119551", destinationSchemeCode: "100219", folioNumber: "F1", units: 5 }) }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/same AMC/);
  });

  it("200s and forwards the parsed body to createSwitchOrder, returning both legs", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createSwitchOrder.mockResolvedValue({ switchOut: { id: "o1", status: "submitted" }, switchIn: { id: "o2", status: "submitted" } });
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ sourceSchemeCode: "119551", destinationSchemeCode: "100033", folioNumber: "F1", units: 10 }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.switchOut.status).toBe("submitted");
    expect(body.switchIn.status).toBe("submitted");
    expect(createSwitchOrder).toHaveBeenCalledWith("user-1", { sourceSchemeCode: "119551", destinationSchemeCode: "100033", folioNumber: "F1", units: 10 });
  });
});
