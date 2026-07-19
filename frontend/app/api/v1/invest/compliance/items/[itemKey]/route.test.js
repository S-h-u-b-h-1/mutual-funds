import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../../lib/invest/complianceService.js", () => ({ submitItem: vi.fn() }));

const { auth } = await import("../../../../../../lib/auth.js");
const { submitItem } = await import("../../../../../../lib/invest/complianceService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/compliance/items/[itemKey]", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ itemKey: "mobile" }) });
    expect(res.status).toBe(401);
  });

  it("400s when the service rejects the item (e.g. investment_ready guard, validation failure)", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    submitItem.mockRejectedValue(new Error("investment_ready is derived automatically, not directly submittable."));

    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ itemKey: "investment_ready" }) });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/derived automatically/);
  });

  it("200s and returns the item + overall status on success, forwarding itemKey and body to the service", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    submitItem.mockResolvedValue({ item: { item_key: "mobile", status: "completed" }, overallStatus: "in_progress" });

    const res = await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ otp: "123456" }) }),
      { params: Promise.resolve({ itemKey: "mobile" }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.item.status).toBe("completed");
    expect(submitItem).toHaveBeenCalledWith("user-1", "mobile", { otp: "123456" });
  });

  it("tolerates an empty request body for items with no payload requirement", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    submitItem.mockResolvedValue({ item: { item_key: "fatca", status: "rejected" }, overallStatus: "pending" });

    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ itemKey: "fatca" }) });
    expect(res.status).toBe(200);
    expect(submitItem).toHaveBeenCalledWith("user-1", "fatca", {});
  });
});
