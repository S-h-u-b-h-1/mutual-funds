import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/orderService.js", () => ({ cancelOrder: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { cancelOrder } = await import("../../../../../../lib/invest/orderService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/orders/[orderId]/cancel", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    expect(res.status).toBe(401);
  });

  it("400s when the service refuses (e.g. already terminal)", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    cancelOrder.mockRejectedValue(new Error("Order cannot be cancelled from status: completed."));
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    expect(res.status).toBe(400);
  });

  it("200s with the cancelled order on success", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    cancelOrder.mockResolvedValue({ id: "o1", status: "cancelled" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.status).toBe("cancelled");
    expect(cancelOrder).toHaveBeenCalledWith("user-1", "o1");
  });
});
