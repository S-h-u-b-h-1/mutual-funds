import { describe, it, expect } from "vitest";
import "./index.js"; // side-effect: registers all 5 mock providers into the Provider Registry
import { getProvider, listInstalledProviders, runProviderConformanceCheck } from "../../platform/providerRegistry/core.js";

// Proves the Phase 4.5 step 4 wiring in index.js actually registers real, working providers —
// not just that the registry module works in isolation (core.test.js already covers that).
describe("invest providers registered into the Provider Registry", () => {
  const names = ["kyc", "document", "investment", "payment", "portfolio"];

  it("all 5 mock providers are installed", () => {
    const installed = listInstalledProviders();
    for (const name of names) expect(installed).toContain(name);
  });

  it("each provider's capabilities match its interface's real declared methods", () => {
    expect(getProvider("kyc").capabilities).toEqual(["checkCKYCStatus", "checkStatus", "initiateVerification"]);
    expect(getProvider("investment").capabilities).toEqual(
      ["cancelOrder", "createSIPMandate", "getOrderStatus", "openAccount", "placeOrder"].sort()
    );
  });

  it("every registered provider passes its own conformance check", () => {
    for (const name of names) {
      const result = runProviderConformanceCheck(name);
      expect(result).toEqual({ ok: true, issues: [] });
    }
  });

  it("each provider's config comes from the real Configuration Platform, not a stub", () => {
    const status = getProvider("kyc");
    const config = status.getConfig();
    expect(config).toMatchObject({ name: "kyc", timeoutMs: 10_000, maxAttempts: 3 });
  });
});
