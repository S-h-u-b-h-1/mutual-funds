import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/documentService.js", () => ({ getDocumentWithTimeline: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { getDocumentWithTimeline } = await import("../../../../../lib/invest/documentService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/documents/[id]", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(401);
  });

  it("404s when the document doesn't exist or belongs to someone else", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getDocumentWithTimeline.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "not-mine" }) });
    expect(res.status).toBe(404);
  });

  it("returns the document and its timeline", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    getDocumentWithTimeline.mockResolvedValue({ document: { id: "d1", status: "generated" }, timeline: [{ event_type: "generated" }] });
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.document.id).toBe("d1");
    expect(body.timeline).toHaveLength(1);
    expect(getDocumentWithTimeline).toHaveBeenCalledWith("user-1", "d1");
  });
});
