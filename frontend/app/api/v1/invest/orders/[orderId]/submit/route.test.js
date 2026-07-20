import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/orderService.js", () => ({ submitOrder: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { submitOrder } = await import("../../../../../../lib/invest/orderService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/orders/[orderId]/submit", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    expect(res.status).toBe(401);
  });

  it("400s when the order isn't in draft", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    submitOrder.mockRejectedValue(new Error("Only a draft order can be submitted (current status: submitted)."));
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    expect(res.status).toBe(400);
  });

  it("200s with the submitted order", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    submitOrder.mockResolvedValue({ id: "o1", status: "submitted" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.status).toBe("submitted");
    expect(submitOrder).toHaveBeenCalledWith("user-1", "o1");
  });
});
