// Mock payment provider (Invest Platform Phase 1, Module 4). Never contacts a real bank, UPI, or
// NACH endpoint and never moves real money — every reference here is synthetic.
import { PaymentProvider } from "../types.js";
import { mockRef } from "./ids.js";

export class MockPaymentProvider extends PaymentProvider {
  async initiateMandate(input) {
    return { mandateRef: mockRef("mandate"), status: "active", provider: "mock-payment", input };
  }

  async initiatePayment(input) {
    return { paymentRef: mockRef("pay"), status: "success", provider: "mock-payment", input };
  }

  async getPaymentStatus(ref) {
    return { ref, status: "success", provider: "mock-payment" };
  }
}
