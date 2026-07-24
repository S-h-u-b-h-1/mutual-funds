import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/redemptionService.js", () => ({ createRedemptionOrder: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { createRedemptionOrder } = await import("../../../../lib/invest/redemptionService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/redemption", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400s and surfaces the service's eligibility error message", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createRedemptionOrder.mockRejectedValue(new Error("Folio is not eligible for redemption: ELSS units carry a mandatory 3-year lock-in."));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ schemeCode: "100175", folioNumber: "F1", units: 5 }) }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not eligible for redemption/);
  });

  it("200s and forwards the parsed body to createRedemptionOrder", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createRedemptionOrder.mockResolvedValue({ id: "o1", status: "submitted", order_type: "redemption" });
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ schemeCode: "119551", folioNumber: "F1", units: 10 }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.status).toBe("submitted");
    expect(createRedemptionOrder).toHaveBeenCalledWith("user-1", { schemeCode: "119551", folioNumber: "F1", units: 10 });
  });
});
