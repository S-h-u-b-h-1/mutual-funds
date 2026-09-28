import { beforeEach, describe, expect, it, vi } from "vitest";
const { write, limit } = vi.hoisted(() => ({ write: vi.fn(), limit: vi.fn() }));
vi.mock("../../lib/db", () => ({ withTransaction: async fn => fn({ query: write }) }));
vi.mock("../../lib/platform/rateLimit/core", () => ({ checkRateLimit: limit, getClientIp: () => "test-only", rateLimitResponse: () => Response.json({ error: "Too many requests" }, { status: 429 }) }));
vi.mock("../../lib/platform/observability/core", () => ({ logInfo: vi.fn() }));
import { POST } from "./route";
const request = body => new Request("http://localhost/api/newsletter", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
beforeEach(() => { write.mockReset().mockResolvedValue({ rows: [] }); limit.mockReset().mockResolvedValue({ allowed: true }); });
describe("newsletter endpoint", () => {
  it.each([null, {}, { email: "invalid" }, { email: "x".repeat(255) + "@example.com" }])("rejects invalid input without a write: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
  it("normalizes email and uses an atomic duplicate-safe insert without delivery promises", async () => {
    const result = await POST(request({ email: " Test@Example.com " }));
    expect(result.status).toBe(200);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("on conflict (email) do nothing"), ["test@example.com"]);
    expect((await result.json()).message).toContain("Email delivery is not active");
  });
  it("blocks a denied limiter result before writing", async () => {
    limit.mockResolvedValue({ allowed: false });
    expect((await POST(request({ email: "test@example.com" }))).status).toBe(429);
    expect(write).not.toHaveBeenCalled();
  });
  it("returns a safe unavailable error on storage failure", async () => {
    write.mockRejectedValue(new Error("private backend detail"));
    const result = await POST(request({ email: "test@example.com" }));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private backend detail");
  });
});
