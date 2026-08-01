import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createWatchlist, getWatchlists, getOrCreateDefaultWatchlist, addToWatchlist, removeFromWatchlist, getWatchlistItems } from "./watchlistService.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";
import { createTestUser, deleteTestUser } from "../invest/testHelpers.js";

describe("watchlistService (integration, real Neon, disposable user + company)", () => {
  let userId, companyId;

  beforeAll(async () => {
    userId = await createTestUser("stock-watchlist");
    companyId = await createTestCompany({ label: "watchlist" });
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
    await deleteTestUser(userId);
  });

  it("creates no watchlist for a fresh user until asked", async () => {
    const watchlists = await getWatchlists(userId);
    expect(watchlists).toEqual([]);
  });

  it("getOrCreateDefaultWatchlist creates exactly one default, then reuses it", async () => {
    const first = await getOrCreateDefaultWatchlist(userId);
    expect(first.name).toBe("My Watchlist");
    const second = await getOrCreateDefaultWatchlist(userId);
    expect(second.id).toBe(first.id);

    const all = await getWatchlists(userId);
    expect(all.length).toBe(1);
  });

  it("supports multiple named watchlists per user", async () => {
    const custom = await createWatchlist(userId, "High Conviction");
    const all = await getWatchlists(userId);
    expect(all.length).toBe(2);
    expect(all.some((w) => w.id === custom.id)).toBe(true);
  });

  it("adds, lists, and removes a company from a watchlist", async () => {
    const watchlist = await getOrCreateDefaultWatchlist(userId);
    await addToWatchlist(watchlist.id, companyId, "Watching for Q results.");

    const items = await getWatchlistItems(watchlist.id);
    expect(items.length).toBe(1);
    expect(items[0].companyId).toBe(companyId);
    expect(items[0].notes).toBe("Watching for Q results.");

    const removed = await removeFromWatchlist(watchlist.id, companyId);
    expect(removed).toBe(true);
    const afterRemoval = await getWatchlistItems(watchlist.id);
    expect(afterRemoval.length).toBe(0);
  });
});
