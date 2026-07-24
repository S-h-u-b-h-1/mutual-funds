import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/identityService.js", () => ({ getAccount: vi.fn(), ensureAccount: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const identityService = await import("../../../../lib/invest/identityService.js");
const { GET, POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/account", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns null when no account exists yet", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    identityService.getAccount.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.account).toBeNull();
  });
});

describe("POST /api/v1/invest/account", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("returns the opened account", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    identityService.ensureAccount.mockResolvedValue({ id: "acct-1", user_id: "user-1", status: "active" });
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.account.id).toBe("acct-1");
    expect(identityService.ensureAccount).toHaveBeenCalledWith("user-1");
  });

  // Backend Hardening (2026-07-24): this route previously had no try/catch at all — a thrown
  // error from ensureAccount() would have been an unhandled server error, not a client-facing
  // 400, unlike every other invest route's established error-handling pattern.
  it("400s with the error message when ensureAccount throws, instead of an unhandled error", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    identityService.ensureAccount.mockRejectedValue(new Error("provider unavailable"));
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("provider unavailable");
  });
});
