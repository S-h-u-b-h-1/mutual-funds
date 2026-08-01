// Route-layer tests — the interesting behavior here is the ownership check (a watchlist id in the
// URL must never be trusted without verifying it belongs to the caller), on top of the standard
// 401 gate.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/stocks/watchlistService.js", () => ({
  isWatchlistOwner: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
  getWatchlistItems: vi.fn(),
}));

const { auth } = await import("../../../../../lib/auth.js");
const watchlistService = await import("../../../../../lib/stocks/watchlistService.js");
const { GET, POST } = await import("./route.js");

const params = Promise.resolve({ id: "watchlist-1" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/watchlists/[id]/items", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), { params });
    expect(res.status).toBe(401);
    expect(watchlistService.isWatchlistOwner).not.toHaveBeenCalled();
  });

  it("404s (not 403 or a data leak) when the watchlist does not belong to the caller", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    watchlistService.isWatchlistOwner.mockResolvedValue(false);
    const res = await GET(new Request("http://x"), { params });
    expect(res.status).toBe(404);
    expect(watchlistService.getWatchlistItems).not.toHaveBeenCalled();
  });

  it("200s with items when the watchlist belongs to the caller", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    watchlistService.isWatchlistOwner.mockResolvedValue(true);
    watchlistService.getWatchlistItems.mockResolvedValue([{ companyId: "c1" }]);
    const res = await GET(new Request("http://x"), { params });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items).toEqual([{ companyId: "c1" }]);
  });
});

describe("POST /api/v1/watchlists/[id]/items", () => {
  it("404s before ever calling addToWatchlist when the caller does not own the watchlist", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    watchlistService.isWatchlistOwner.mockResolvedValue(false);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ companyId: "c1" }) }), { params });
    expect(res.status).toBe(404);
    expect(watchlistService.addToWatchlist).not.toHaveBeenCalled();
  });

  it("requires companyId in the body", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    watchlistService.isWatchlistOwner.mockResolvedValue(true);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }), { params });
    expect(res.status).toBe(400);
  });
});
