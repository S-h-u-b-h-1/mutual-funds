import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/platform/notifications/inbox.js", () => ({ getUnreadCount: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getUnreadCount } = await import("../../../../../lib/platform/notifications/inbox.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/notifications/unread-count", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
  });

  it("200s with the count, passing an optional category through", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getUnreadCount.mockResolvedValue(3);
    const res = await GET(new Request("http://x?category=order"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.count).toBe(3);
    expect(getUnreadCount).toHaveBeenCalledWith("user-1", { category: "order" });
  });
});
