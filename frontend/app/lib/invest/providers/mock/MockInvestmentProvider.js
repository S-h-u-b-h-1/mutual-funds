// Mock investment/order provider (Invest Platform Phase 1, Module 4). Never contacts a real
// BSE Star MF / CAMS / KFintech endpoint or moves real money — every account number, order id,
// and status here is synthetic. Full interface is implemented now (Module 3/4 scope) even
// though only openAccount() is exercised by Module 1/2's flows this phase — placeOrder/etc. are
// ready for Module 6 (Order Engine) without a second pass.
import { InvestmentProvider } from "../types.js";
import { mockRef, mockAccountNumber } from "./ids.js";

export class MockInvestmentProvider extends InvestmentProvider {
  async openAccount(input) {
    return {
      accountNumber: mockAccountNumber(),
      status: "active",
      provider: "mock-investment",
      openedFor: input?.userId ?? null,
    };
  }

  async placeOrder(order) {
    return {
      providerOrderId: mockRef("ord"),
      status: "accepted",
      provider: "mock-investment",
      submittedOrder: order,
    };
  }

  async getOrderStatus(providerOrderId) {
    return { providerOrderId, status: "processing", provider: "mock-investment" };
  }

  async cancelOrder(providerOrderId) {
    return { providerOrderId, status: "cancelled", provider: "mock-investment" };
  }

  async createSIPMandate(mandate) {
    return {
      providerMandateId: mockRef("mandate"),
      status: "active",
      provider: "mock-investment",
      submittedMandate: mandate,
    };
  }
}
