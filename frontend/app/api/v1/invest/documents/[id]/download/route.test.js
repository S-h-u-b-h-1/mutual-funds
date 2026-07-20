import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/documentService.js", () => ({ downloadDocument: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { downloadDocument } = await import("../../../../../../lib/invest/documentService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/documents/[id]/download", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(401);
  });

  it("404s when the document doesn't exist or belongs to someone else", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    downloadDocument.mockResolvedValue(null);
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "not-mine" }) });
    expect(res.status).toBe(404);
  });

  it("200s with the document (including its synthetic storageRef), not a binary stream", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    downloadDocument.mockResolvedValue({ id: "d1", storage_ref: "doc_abc123" });
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document.storage_ref).toBe("doc_abc123");
    expect(downloadDocument).toHaveBeenCalledWith("user-1", "d1");
  });
});
