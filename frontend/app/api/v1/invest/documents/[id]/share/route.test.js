import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/documentService.js", () => ({ shareDocument: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { shareDocument } = await import("../../../../../../lib/invest/documentService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/documents/[id]/share", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(401);
  });

  it("400s on invalid JSON", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(new Request("http://x", { method: "POST", body: "not json" }), { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(400);
  });

  it("400s and surfaces the service's validation error", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    shareDocument.mockRejectedValue(new Error("visibility must be one of: private, shared, advisor, internal"));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ visibility: "public" }) }), { params: Promise.resolve({ id: "d1" }) });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/visibility must be one of/);
  });

  it("404s when the document doesn't exist or belongs to someone else", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    shareDocument.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ visibility: "advisor" }) }), { params: Promise.resolve({ id: "not-mine" }) });
    expect(res.status).toBe(404);
  });

  it("200s with the updated document", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    shareDocument.mockResolvedValue({ id: "d1", visibility: "advisor" });
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ visibility: "advisor", note: "for review" }) }), { params: Promise.resolve({ id: "d1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document.visibility).toBe("advisor");
    expect(shareDocument).toHaveBeenCalledWith("user-1", "d1", { visibility: "advisor", note: "for review" });
  });
});
