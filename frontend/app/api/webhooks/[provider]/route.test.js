import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/platform/webhooks/core.js", () => ({ receiveWebhook: vi.fn() }));
vi.mock("../../../lib/platform/jobs/handlers/index.js", () => ({}));

const { receiveWebhook } = await import("../../../lib/platform/webhooks/core.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

function makeRequest(body = "{}", headers = {}) {
  return new Request("http://x/api/webhooks/mock-payments", { method: "POST", body, headers });
}
const ctx = { params: { provider: "mock-payments" } };

describe("POST /api/webhooks/[provider]", () => {
  it("passes the RAW body and lowercased headers through to receiveWebhook", async () => {
    receiveWebhook.mockResolvedValue({ status: "received", deliveryId: "d1" });
    const raw = `{"a": 1}`;
    const res = await POST(makeRequest(raw, { "X-Webhook-Signature": "sig" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).deliveryId).toBe("d1");
    const [provider, args] = receiveWebhook.mock.calls[0];
    expect(provider).toBe("mock-payments");
    expect(args.rawBody).toBe(raw);
    expect(args.headers["x-webhook-signature"]).toBe("sig");
  });

  it("acks duplicates with 200 so providers stop retrying", async () => {
    receiveWebhook.mockResolvedValue({ status: "duplicate", originalDeliveryId: "d0" });
    const res = await POST(makeRequest(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
  });

  it("maps unknown provider → 404, rejected → 401, malformed → 400, disabled/unconfigured → 503", async () => {
    const cases = [
      [{ status: "unknown_provider" }, 404],
      [{ status: "rejected", reason: "Signature mismatch." }, 401],
      [{ status: "malformed" }, 400],
      [{ status: "disabled" }, 503],
      [{ status: "unconfigured" }, 503],
    ];
    for (const [result, expected] of cases) {
      receiveWebhook.mockResolvedValue(result);
      expect((await POST(makeRequest(), ctx)).status).toBe(expected);
    }
  });
});
