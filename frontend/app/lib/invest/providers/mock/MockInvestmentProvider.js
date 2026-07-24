// Mock investment/order provider. Never contacts a real BSE Star MF / CAMS / KFintech endpoint
// or moves real money — every account number, order id, and status here is synthetic.
//
// placeOrder() has a weighted, realistic outcome (not an always-succeeds stub) — a real order
// gateway can reject at submission time (bad scheme code, amount below minimum, etc.) before an
// order ever starts processing. The AFTER-submission progression (processing -> units_pending ->
// resolved, including retry_required/temporary failures) is deliberately NOT simulated here —
// that needs the order's real elapsed time since submission, which only orderService.js (reading
// investment_orders.submitted_at from Postgres) has; see orderService.js's decideOrderStatus().
import { InvestmentProvider, PROVIDER_ERROR_CODES } from "../types.js";
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
    const accepted = Math.random() < 0.92; // ~8% immediate rejection at submission — realistic gateway-level validation failure
    return {
      providerOrderId: mockRef("ord"),
      status: accepted ? "accepted" : "rejected",
      rejectionReason: accepted ? null : "Mock gateway rejection: scheme not open for subscription (simulated).",
      rejectionCode: accepted ? null : PROVIDER_ERROR_CODES.SCHEME_NOT_OPEN,
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

  // Synchronous acknowledgement only — a real RTA/bank rail's actual credit timing (T+1/T+2/T+3,
  // weekends, bank holidays) is not something this mock simulates; see
  // docs/REDEMPTION_CONTRACT.md §4 for why 'initiated' is the last state this app asserts.
  async initiatePayout(order) {
    return {
      payoutReference: mockRef("payout"),
      status: "initiated",
      provider: "mock-investment",
    };
  }
}
