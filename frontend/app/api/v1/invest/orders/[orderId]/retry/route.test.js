import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/orderService.js", () => ({ retryOrder: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { retryOrder } = await import("../../../../../../lib/invest/orderService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/orders/[orderId]/retry", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    expect(res.status).toBe(401);
  });

  it("400s when the order isn't retry_required", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    retryOrder.mockRejectedValue(new Error("Only an order in retry_required can be retried (current status: completed)."));
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    expect(res.status).toBe(400);
  });

  it("200s with the resubmitted order", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    retryOrder.mockResolvedValue({ id: "o1", status: "submitted" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ orderId: "o1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.status).toBe("submitted");
    expect(retryOrder).toHaveBeenCalledWith("user-1", "o1");
  });
});
