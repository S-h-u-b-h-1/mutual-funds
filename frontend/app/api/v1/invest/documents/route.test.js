import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/documentService.js", () => ({ listDocuments: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { listDocuments } = await import("../../../../lib/invest/documentService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/documents", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });

  it("defaults to limit=50 with no filters", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    listDocuments.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/documents"));
    expect(listDocuments).toHaveBeenCalledWith("user-1", { category: undefined, status: undefined, limit: 50 });
  });

  it("passes through category/status/limit query params", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    listDocuments.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/documents?category=tax&status=generated&limit=10"));
    expect(listDocuments).toHaveBeenCalledWith("user-1", { category: "tax", status: "generated", limit: 10 });
  });

  it("wraps the result in { documents }", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    listDocuments.mockResolvedValue([{ id: "d1", title: "Tax Statement" }]);
    const res = await GET(new Request("http://x/api/v1/invest/documents"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.documents).toHaveLength(1);
  });
});
