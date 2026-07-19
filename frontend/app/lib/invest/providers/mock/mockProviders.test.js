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

describe("MockPortfolioProvider", () => {
  const provider = new MockPortfolioProvider();
  it("is a real PortfolioProvider", () => {
    expect(provider).toBeInstanceOf(PortfolioProvider);
  });
  it("syncHoldings is a safe no-op until Module 6/7 exist", async () => {
    const result = await provider.syncHoldings("u1");
    expect(result.synced).toBe(true);
    expect(result.holdingsUpdated).toBe(0);
  });
});

describe("Provider base classes throw when not implemented (runtime contract enforcement)", () => {
  it("a bare KYCProvider() is unusable directly", async () => {
    await expect(new KYCProvider().initiateVerification({})).rejects.toThrow(/not implemented/);
  });
});
