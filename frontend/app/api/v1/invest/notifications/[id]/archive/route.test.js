import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/platform/notifications/core.js", () => ({ archiveNotification: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { archiveNotification } = await import("../../../../../../lib/platform/notifications/core.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/notifications/[id]/archive", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
  });

  it("404s when the notification is not found or already archived", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    archiveNotification.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(404);
  });

  it("200s with the updated notification", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    archiveNotification.mockResolvedValue({ id: "n1", archived_at: "2026-07-24T00:00:00Z" });
    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "n1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.notification.archived_at).toBeTruthy();
    expect(archiveNotification).toHaveBeenCalledWith("n1", "user-1");
  });
});
