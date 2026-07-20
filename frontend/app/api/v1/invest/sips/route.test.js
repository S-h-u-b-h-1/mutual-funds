import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../lib/invest/orderService.js", () => ({ createSipMandate: vi.fn(), listSipMandates: vi.fn() }));

const { auth } = await import("../../../../lib/auth.js");
const { createSipMandate, listSipMandates } = await import("../../../../lib/invest/orderService.js");
const { GET, POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/invest/sips", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("lists the user's SIP mandates", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    listSipMandates.mockResolvedValue([{ id: "s1", mandate_status: "active" }]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sips).toHaveLength(1);
  });
});

describe("POST /api/v1/invest/sips", () => {
  it("400s and surfaces the service's validation error", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createSipMandate.mockRejectedValue(new Error("schemeCode, amount (>0), frequency (monthly|weekly|quarterly), and startDate are required."));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });

  it("200s and returns the created mandate", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    createSipMandate.mockResolvedValue({ id: "s1", mandate_status: "active" });
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ schemeCode: "119551", amount: 2000, frequency: "monthly", startDate: "2026-08-01" }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sip.mandate_status).toBe("active");
  });
});
