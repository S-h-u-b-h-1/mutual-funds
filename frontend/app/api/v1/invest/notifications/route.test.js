import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/platform/notifications/inbox.js", () => ({ listNotifications: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { listNotifications } = await import("../../../../lib/platform/notifications/inbox.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/notifications", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/v1/invest/notifications"));
    expect(res.status).toBe(401);
  });

  it("200s and parses query params into the listNotifications call", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    listNotifications.mockResolvedValue({ notifications: [{ id: "n1" }], total: 1, limit: 20, offset: 0 });
    const res = await GET(new Request("http://x/api/v1/invest/notifications?category=order&unreadOnly=true&limit=5&offset=10"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.notifications).toHaveLength(1);
    expect(listNotifications).toHaveBeenCalledWith("user-1", {
      status: null, category: "order", type: null,
      unreadOnly: true, includeArchived: false, includeDismissed: false,
      limit: 5, offset: 10,
    });
  });
});
