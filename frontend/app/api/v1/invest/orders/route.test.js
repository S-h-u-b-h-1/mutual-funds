import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/orderService.js", () => ({ createOrder: vi.fn(), listOrders: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { createOrder, listOrders } = await import("../../../../lib/invest/orderService.js");
const { GET, POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/orders", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns order history for the signed-in user", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    listOrders.mockResolvedValue([{ id: "o1", status: "completed" }]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.orders).toHaveLength(1);
    expect(listOrders).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/v1/invest/orders", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400s and surfaces the service's validation error message", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createOrder.mockRejectedValue(new Error("Compliance must be fully completed before placing an order."));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ schemeCode: "119551", orderType: "purchase", amount: 1000 }) }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Compliance must be fully completed/);
  });

  it("200s and forwards the parsed body to createOrder", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createOrder.mockResolvedValue({ id: "o1", status: "submitted" });
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ schemeCode: "119551", orderType: "purchase", amount: 5000 }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.status).toBe("submitted");
    expect(createOrder).toHaveBeenCalledWith("user-1", { schemeCode: "119551", orderType: "purchase", amount: 5000 });
  });
});
