import { describe, it, expect, vi } from "vitest";
vi.mock("../../db.js", () => ({ query: vi.fn().mockRejectedValue(new Error("storage unavailable")) }));
import { checkRateLimit } from "./core.js";

describe("auth abuse protection during storage outage", () => {
  it("never grants unlimited attempts, including concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit("login", "test", { limit: 3, windowSeconds: 60 })));
    expect(results.every(result => !result.allowed && result.unavailable && result.retryAfter === 30)).toBe(true);
  });
});
