import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/orderService.js", () => ({ getOrderWithTimeline: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getOrderWithTimeline } = await import("../../../../../lib/invest/orderService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/orders/[orderId]", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ orderId: "o1" }) });
    expect(res.status).toBe(401);
  });

  it("404s when the order doesn't exist (or belongs to someone else)", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getOrderWithTimeline.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ orderId: "not-mine" }) });
    expect(res.status).toBe(404);
  });

  it("returns the order and its timeline, refreshing status first", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getOrderWithTimeline.mockResolvedValue({ order: { id: "o1", status: "processing" }, timeline: [{ to_status: "submitted" }, { to_status: "processing" }] });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ orderId: "o1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.status).toBe("processing");
    expect(body.timeline).toHaveLength(2);
    expect(getOrderWithTimeline).toHaveBeenCalledWith("user-1", "o1");
  });
});
