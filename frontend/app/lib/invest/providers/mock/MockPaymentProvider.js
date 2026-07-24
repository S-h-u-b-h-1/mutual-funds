// Mock payment provider (Invest Platform Phase 1, Module 4). Never contacts a real bank, UPI, or
// NACH endpoint and never moves real money — every reference here is synthetic.
//
// Provider Metadata (2026-07-24): previously unconditionally successful with zero failure-mode
// simulation, per docs/INVEST_PLATFORM_BENCHMARK_AND_ROADMAP.md's own honesty ledger — "the
// weakest of the five mocks... worth strengthening even before a real gateway exists, since it
// currently can't exercise any payment-failure test path." Now called from a real path for the
// first time (orderService.js's purchase/SIP creation), so this is the natural moment to add a
// realistic decline rate, matching the other mocks' own weighted-outcome pattern.
import { PaymentProvider, PROVIDER_ERROR_CODES } from "../types.js";
import { mockRef } from "./ids.js";

export class MockPaymentProvider extends PaymentProvider {
  async initiateMandate(input) {
    const accepted = Math.random() < 0.95; // NACH/UPI Autopay registration — a real bank can decline mandate setup
    return {
      mandateRef: mockRef("mandate"),
      status: accepted ? "active" : "declined",
      errorCode: accepted ? null : PROVIDER_ERROR_CODES.MANDATE_DECLINED,
      provider: "mock-payment",
      input,
    };
  }

  async initiatePayment(input) {
    const accepted = Math.random() < 0.95; // a real payment gateway can decline (insufficient funds, bank timeout, etc.)
    return {
      paymentRef: mockRef("pay"),
      status: accepted ? "success" : "declined",
      errorCode: accepted ? null : PROVIDER_ERROR_CODES.PAYMENT_DECLINED,
      provider: "mock-payment",
      input,
    };
  }

  async getPaymentStatus(ref) {
    return { ref, status: "success", provider: "mock-payment" };
  }
}
