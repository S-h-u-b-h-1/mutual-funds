import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../../lib/auth.js", () => ({ auth: vi.fn() }));
vi.mock("../../../../../lib/invest/portfolioService.js", () => ({ connectMockPortfolio: vi.fn() }));

const { auth } = await import("../../../../../lib/auth.js");
const { connectMockPortfolio } = await import("../../../../../lib/invest/portfolioService.js");
const { POST } = await import("./route.js");

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/invest/portfolio/connect", () => {
  it("401s when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it("returns the freshly-connected portfolio for a first-time call", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    connectMockPortfolio.mockResolvedValue({ alreadyConnected: false, holdings: [{ schemeCode: "119551" }] });
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyConnected).toBe(false);
    expect(body.holdings).toHaveLength(1);
    expect(connectMockPortfolio).toHaveBeenCalledWith("user-1");
  });

  it("returns alreadyConnected:true on a repeat call, still 200 (idempotent, not an error)", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    connectMockPortfolio.mockResolvedValue({ alreadyConnected: true, holdings: [{ schemeCode: "119551" }] });
    const res = await POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyConnected).toBe(true);
  });
});
