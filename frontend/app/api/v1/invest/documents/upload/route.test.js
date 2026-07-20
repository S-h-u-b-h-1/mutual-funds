import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/documentService.js", () => ({ uploadDocument: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { uploadDocument } = await import("../../../../../lib/invest/documentService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/documents/upload", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400s on invalid JSON", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(new Request("http://x", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("400s and surfaces the service's validation error message", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    uploadDocument.mockRejectedValue(new Error("title is required."));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ category: "tax" }) }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/title is required/);
  });

  it("200s and forwards the parsed body to uploadDocument", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    uploadDocument.mockResolvedValue({ id: "d1", status: "uploaded" });
    const payload = { category: "tax", docType: "user_upload", title: "Form 16" };
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(payload) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document.status).toBe("uploaded");
    expect(uploadDocument).toHaveBeenCalledWith("user-1", payload);
  });
});
