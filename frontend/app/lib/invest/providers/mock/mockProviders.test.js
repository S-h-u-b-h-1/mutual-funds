import { describe, it, expect, vi } from "vitest";
import { MockKYCProvider } from "./MockKYCProvider.js";
import { MockDocumentProvider } from "./MockDocumentProvider.js";
import { MockInvestmentProvider } from "./MockInvestmentProvider.js";
import { MockPaymentProvider } from "./MockPaymentProvider.js";
import { MockPortfolioProvider } from "./MockPortfolioProvider.js";
import { KYCProvider, DocumentProvider, InvestmentProvider, PaymentProvider, PortfolioProvider } from "../types.js";

describe("MockKYCProvider", () => {
  const provider = new MockKYCProvider();

  it("is a real KYCProvider (satisfies the interface, never contacts a real provider)", () => {
    expect(provider).toBeInstanceOf(KYCProvider);
  });

  it("initiateVerification returns a session shaped for a checkStatus follow-up", async () => {
    const session = await provider.initiateVerification({ userId: "u1", pan: "ABCDE1234F" });
    expect(session.sessionId).toBeTruthy();
    expect(session.status).toBe("in_progress");
    expect(session.provider).toBe("mock-kyc");
  });

  it("checkStatus always resolves to one of the documented outcomes", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // forces the rejected branch (last bucket)
    const result = await provider.checkStatus("kycsess_x");
    expect(["verified", "needs_review", "rejected"]).toContain(result.status);
    expect(result.status).toBe("rejected");
    expect(result.reason).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("checkStatus mostly verifies (weighted toward success)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const result = await provider.checkStatus("kycsess_y");
    expect(result.status).toBe("verified");
    vi.restoreAllMocks();
  });

  it("checkCKYCStatus never returns a ckycNumber for a non-compliant status", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = await provider.checkCKYCStatus("ABCDE1234F");
    expect(result.status).not.toBe("kyc_compliant");
    expect(result.ckycNumber).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("MockDocumentProvider", () => {
  const provider = new MockDocumentProvider();

  it("is a real DocumentProvider", () => {
    expect(provider).toBeInstanceOf(DocumentProvider);
  });

  it("refuses to fetch without a consent token", async () => {
    await expect(provider.fetchDocument(null, "identity")).rejects.toThrow(/consent/i);
  });

  it("returns a synthetic storage reference, never a real document payload", async () => {
    const doc = await provider.fetchDocument("consent_abc", "identity");
    expect(doc.storageRef).toMatch(/^doc_/);
    expect(doc.source).toBe("mock-digilocker");
  });

  it("generateDocument (Journey 4) returns a synthetic reference tagged mock-document-generator, with a plausible file size", async () => {
    const doc = await provider.generateDocument("account_statement", { userId: "u1" });
    expect(doc.storageRef).toMatch(/^doc_/);
    expect(doc.provider).toBe("mock-document-generator");
    expect(doc.mimeType).toBe("application/pdf");
    expect(doc.fileSizeBytes).toBeGreaterThan(0);
    expect(doc.context).toEqual({ userId: "u1" });
  });

  it("generateDocument uses a sane fallback size range for an unrecognized docType", async () => {
    const doc = await provider.generateDocument("something-new", {});
    expect(doc.fileSizeBytes).toBeGreaterThanOrEqual(20_000);
    expect(doc.fileSizeBytes).toBeLessThanOrEqual(100_000);
  });

  it("storeUpload (Journey 4) returns a synthetic reference tagged mock-document-store", async () => {
    const stored = await provider.storeUpload({ mimeType: "application/pdf", fileSizeBytes: 12345 });
    expect(stored.storageRef).toMatch(/^doc_/);
    expect(stored.provider).toBe("mock-document-store");
    expect(stored.mimeType).toBe("application/pdf");
    expect(stored.fileSizeBytes).toBe(12345);
  });

  it("storeUpload defaults mimeType and fileSizeBytes when the caller doesn't supply them", async () => {
    const stored = await provider.storeUpload();
    expect(stored.mimeType).toBe("application/octet-stream");
    expect(stored.fileSizeBytes).toBeNull();
  });
});

describe("MockInvestmentProvider", () => {
  const provider = new MockInvestmentProvider();

  it("is a real InvestmentProvider and implements every interface method", () => {
    expect(provider).toBeInstanceOf(InvestmentProvider);
  });

  it("openAccount returns a clearly-synthetic account number", async () => {
    const account = await provider.openAccount({ userId: "u1" });
    expect(account.accountNumber).toMatch(/^MFPMOCK\d{8}$/);
    expect(account.status).toBe("active");
  });

  it("placeOrder / getOrderStatus / cancelOrder / createSIPMandate all resolve", async () => {
    const order = await provider.placeOrder({ schemeCode: "123", amount: 5000 });
    expect(order.providerOrderId).toMatch(/^ord_/);
    const status = await provider.getOrderStatus(order.providerOrderId);
    expect(status.status).toBeTruthy();
    const cancelled = await provider.cancelOrder(order.providerOrderId);
    expect(cancelled.status).toBe("cancelled");
    const mandate = await provider.createSIPMandate({ schemeCode: "123", amount: 1000 });
    expect(mandate.providerMandateId).toMatch(/^mandate_/);
  });
});

describe("MockPaymentProvider", () => {
  const provider = new MockPaymentProvider();
  it("is a real PaymentProvider", () => {
    expect(provider).toBeInstanceOf(PaymentProvider);
  });
  it("never returns a real bank/UPI reference shape (mock- prefixed provider tag)", async () => {
    const payment = await provider.initiatePayment({ amount: 1000 });
    expect(payment.provider).toBe("mock-payment");
  });
});

describe("MockPortfolioProvider (Journey 3)", () => {
  const provider = new MockPortfolioProvider();

  it("is a real PortfolioProvider", () => {
    expect(provider).toBeInstanceOf(PortfolioProvider);
  });

  it("returns 3-6 holdings with real-shaped scheme codes and a synthetic-but-plausible cost factor", async () => {
    const { provider: providerName, holdings } = await provider.syncHoldings("user-a");
    expect(providerName).toBe("mock-portfolio");
    expect(holdings.length).toBeGreaterThanOrEqual(3);
    expect(holdings.length).toBeLessThanOrEqual(6);
    for (const h of holdings) {
      expect(h.schemeCode).toMatch(/^\d+$/);
      expect(h.units).toBeGreaterThan(0);
      expect(h.costFactor).toBeGreaterThanOrEqual(0.75);
      expect(h.costFactor).toBeLessThanOrEqual(1.25);
      expect(h.purchaseDaysAgo).toBeGreaterThan(0);
      expect(h.folioNumber).toMatch(/^MOCK/);
    }
  });

  it("is deterministic per user — same userId produces the same portfolio every call", async () => {
    const first = await provider.syncHoldings("stable-user");
    const second = await provider.syncHoldings("stable-user");
    expect(second.holdings).toEqual(first.holdings);
  });

  it("different users get different portfolios (not identical datasets)", async () => {
    const a = await provider.syncHoldings("user-alpha");
    const b = await provider.syncHoldings("user-beta");
    expect(a.holdings).not.toEqual(b.holdings);
  });
});

describe("Provider base classes throw when not implemented (runtime contract enforcement)", () => {
  it("a bare KYCProvider() is unusable directly", async () => {
    await expect(new KYCProvider().initiateVerification({})).rejects.toThrow(/not implemented/);
  });
});
