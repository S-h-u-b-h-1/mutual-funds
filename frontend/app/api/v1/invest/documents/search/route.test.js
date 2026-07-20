import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/documentService.js", () => ({ searchDocuments: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { searchDocuments } = await import("../../../../../lib/invest/documentService.js");
const { GET } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/documents/search", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });

  it("parses every query param, splitting tags on comma", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    searchDocuments.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/documents/search?keyword=tax&category=tax&status=generated&source=mock-generated&tags=fy25,urgent&dateFrom=2026-01-01&dateTo=2026-12-31&limit=20"));
    expect(searchDocuments).toHaveBeenCalledWith("user-1", {
      keyword: "tax", category: "tax", status: "generated", source: "mock-generated",
      tags: ["fy25", "urgent"], dateFrom: "2026-01-01", dateTo: "2026-12-31", limit: 20,
    });
  });

  it("omits unset filters rather than passing empty strings", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    searchDocuments.mockResolvedValue([]);
    await GET(new Request("http://x/api/v1/invest/documents/search"));
    expect(searchDocuments).toHaveBeenCalledWith("user-1", {
      keyword: undefined, category: undefined, status: undefined, source: undefined,
      tags: undefined, dateFrom: undefined, dateTo: undefined, limit: 50,
    });
  });

  it("wraps the result in { documents }", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    searchDocuments.mockResolvedValue([{ id: "d1" }]);
    const res = await GET(new Request("http://x/api/v1/invest/documents/search?keyword=x"));
    const body = await res.json();
    expect(body.documents).toHaveLength(1);
  });
});
