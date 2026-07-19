// Mock KYC provider (Invest Platform Phase 1, Module 4). Synthetic responses only — never
// contacts a real KYC Registration Agency, CDSL, or CKYC registry. Shaped to feel like a real
// provider's response (session ids, realistic status vocabulary) so the frontend can be built
// against something that behaves like production, per this phase's explicit brief.
import { KYCProvider } from "../types.js";
import { mockRef } from "./ids.js";

// Weighted outcomes so a UI built against this mock actually has to handle more than one path —
// an always-succeeds mock would let a "needs review" screen go unbuilt and untested.
function weightedOutcome(weights) {
  const roll = Math.random();
  let cumulative = 0;
  for (const [outcome, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (roll < cumulative) return outcome;
  }
  return Object.keys(weights)[0];
}

export class MockKYCProvider extends KYCProvider {
  async initiateVerification(input) {
    const sessionId = mockRef("kycsess");
    return {
      sessionId,
      status: "in_progress",
      provider: "mock-kyc",
      providerReference: sessionId,
      submittedFor: input?.userId ?? null,
    };
  }

  async checkStatus(sessionId) {
    const status = weightedOutcome({ verified: 0.85, needs_review: 0.1, rejected: 0.05 });
    return {
      sessionId,
      status,
      provider: "mock-kyc",
      reason: status === "rejected" ? "Mock rejection: document image did not pass quality check." : null,
    };
  }

  async checkCKYCStatus(pan) {
    const status = weightedOutcome({ kyc_compliant: 0.8, not_registered: 0.15, on_hold: 0.05 });
    return {
      pan,
      ckycNumber: status === "kyc_compliant" ? mockRef("ckyc").toUpperCase() : null,
      status,
      provider: "mock-kyc",
    };
  }
}
