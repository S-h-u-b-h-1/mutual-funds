import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/apiAuth", () => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "Unauthorized" }, { status: 401 })),
  forbidden: vi.fn(() => Response.json({ error: "Forbidden" }, { status: 403 })),
}));
vi.mock("../../../../../../lib/platform/reconciliation/core.js", () => ({ resolveReconciliationItem: vi.fn() }));

const { requireUser, requireRole } = await import("../../../../../../lib/apiAuth");
const { resolveReconciliationItem } = await import("../../../../../../lib/platform/reconciliation/core.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

function req(body) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}
const ctx = { params: Promise.resolve({ id: "item-1" }) };

describe("POST /api/internal/reconciliation/items/[id]/resolve", () => {
  it("401s when there is no session at all", async () => {
    requireRole.mockResolvedValue(null);
    requireUser.mockResolvedValue(null);
    const res = await POST(req({ note: "ok" }), ctx);
    expect(res.status).toBe(401);
  });

  it("403s when signed in but not advisor/admin — distinct from 401", async () => {
    requireRole.mockResolvedValue(null);
    requireUser.mockResolvedValue({ id: "investor-1" });
    const res = await POST(req({ note: "ok" }), ctx);
    expect(res.status).toBe(403);
  });

  it("400s when note is missing or not a string", async () => {
    requireRole.mockResolvedValue({ id: "advisor-1" });
    expect((await POST(req({}), ctx)).status).toBe(400);
    expect((await POST(req({ note: 5 }), ctx)).status).toBe(400);
  });

  it("resolves and returns the item for an authorized advisor", async () => {
    requireRole.mockResolvedValue({ id: "advisor-1" });
    resolveReconciliationItem.mockResolvedValue({ id: "item-1", status: "resolved" });
    const res = await POST(req({ note: "Confirmed benign timing lag." }), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.item.status).toBe("resolved");
    expect(resolveReconciliationItem).toHaveBeenCalledWith("item-1", { resolvedBy: "advisor-1", note: "Confirmed benign timing lag." });
  });

  it("maps a resolve failure (already resolved) to 400 with the message", async () => {
    requireRole.mockResolvedValue({ id: "advisor-1" });
    resolveReconciliationItem.mockRejectedValue(new Error("Item item-1 is not an open exception."));
    const res = await POST(req({ note: "x" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not an open exception/);
  });
});
