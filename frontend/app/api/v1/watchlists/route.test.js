// Route-layer tests only (401 handling, response shape) — the service logic itself is covered by
// watchlistService.test.js's real-Neon tests. Same mocking pattern as
// app/api/v1/invest/onboarding/route.test.js: auth() is mocked, requireUser() runs for real on
// top of it.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../lib/stocks/watchlistService.js", () => ({
  getWatchlists: vi.fn(),
  createWatchlist: vi.fn(),
}));

const { auth } = await import("../../../lib/auth.js");
const watchlistService = await import("../../../lib/stocks/watchlistService.js");
const { GET, POST } = await import("./route.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/watchlists", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(watchlistService.getWatchlists).not.toHaveBeenCalled();
  });

  it("200s with the signed-in user's watchlists", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    watchlistService.getWatchlists.mockResolvedValue([{ id: "w1", name: "My Watchlist" }]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.watchlists).toEqual([{ id: "w1", name: "My Watchlist" }]);
    expect(watchlistService.getWatchlists).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/v1/watchlists", () => {
  it("401s when there is no session, without ever creating a watchlist", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "x" }) }));
    expect(res.status).toBe(401);
    expect(watchlistService.createWatchlist).not.toHaveBeenCalled();
  });

  it("creates a watchlist scoped to the signed-in user", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    watchlistService.createWatchlist.mockResolvedValue({ id: "w2", name: "High Conviction" });
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "High Conviction" }) }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.watchlist.name).toBe("High Conviction");
    expect(watchlistService.createWatchlist).toHaveBeenCalledWith("user-1", "High Conviction");
  });
});
