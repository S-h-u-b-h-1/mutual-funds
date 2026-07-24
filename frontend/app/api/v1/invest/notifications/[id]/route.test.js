import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/platform/notifications/inbox.js", () => ({ getNotificationWithTimeline: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getNotificationWithTimeline } = await import("../../../../../lib/platform/notifications/inbox.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/notifications/[id]", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
  });

  it("404s when the notification is not found (or not this user's)", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getNotificationWithTimeline.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });

  it("200s with the notification and its timeline", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getNotificationWithTimeline.mockResolvedValue({ notification: { id: "n1" }, timeline: [{ event: "created" }] });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "n1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.notification.id).toBe("n1");
    expect(body.timeline).toHaveLength(1);
    expect(getNotificationWithTimeline).toHaveBeenCalledWith("user-1", "n1");
  });
});
