import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/documentService.js", () => ({ archiveDocument: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { archiveDocument } = await import("../../../../../../lib/invest/documentService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/documents/[id]/archive", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(401);
  });

  it("404s when the document doesn't exist or belongs to someone else", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    archiveDocument.mockResolvedValue(null);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "not-mine" }) });
    expect(res.status).toBe(404);
  });

  it("400s and surfaces the service's error when already archived", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    archiveDocument.mockRejectedValue(new Error("Document is already archived."));
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/already archived/);
  });

  it("200s with the archived document", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    archiveDocument.mockResolvedValue({ id: "d1", status: "archived" });
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document.status).toBe("archived");
    expect(archiveDocument).toHaveBeenCalledWith("user-1", "d1");
  });
});
