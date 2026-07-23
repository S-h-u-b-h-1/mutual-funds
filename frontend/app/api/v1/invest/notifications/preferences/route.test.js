// Route-layer tests only — auth() and the preferences module are both mocked, so these test the
// request/response CONTRACT (401/400 handling, correct service wiring, response shape), not the
// validation/inheritance logic itself (already covered by preferences.test.js's real-Neon tests).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/platform/notifications/preferences.js", () => ({
  getPreferences: vi.fn(),
  upsertPreferences: vi.fn(),
  KNOWN_CHANNELS: ["in_app", "email", "sms", "push", "whatsapp", "webhook"],
  SUGGESTED_CATEGORIES: ["transactional", "security"],
}));

const { auth } = await import("../../../../../lib/auth.js");
const preferences = await import("../../../../../lib/platform/notifications/preferences.js");
const { GET, PUT } = await import("./route.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/invest/notifications/preferences", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("200s with the user's preferences plus reference metadata", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    preferences.getPreferences.mockResolvedValue({ enabled_channels: ["in_app"], language: "en" });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.preferences.language).toBe("en");
    expect(body.knownChannels).toContain("email");
    expect(body.suggestedCategories).toContain("security");
    expect(preferences.getPreferences).toHaveBeenCalledWith("user-1");
  });
});

describe("PUT /api/v1/invest/notifications/preferences", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await PUT(new Request("http://x", { method: "PUT", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("400s on invalid JSON", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    const res = await PUT(new Request("http://x", { method: "PUT", body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("400s and surfaces the validation error when upsertPreferences rejects", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    preferences.upsertPreferences.mockRejectedValue(new Error("upsertPreferences: enabled_channels must be an array drawn from in_app, email"));

    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ enabled_channels: ["bogus"] }) }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/enabled_channels/);
  });

  it("passes the parsed body to upsertPreferences and returns its result", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    preferences.upsertPreferences.mockResolvedValue({ language: "hi" });

    const res = await PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ language: "hi" }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.preferences.language).toBe("hi");
    expect(preferences.upsertPreferences).toHaveBeenCalledWith("user-1", { language: "hi" });
  });
});
