// Provider abstraction contracts (Invest Platform Phase 1, Module 3). Backs
// docs/INVEST_PLATFORM_ARCHITECTURE.md §4/§6. Plain JS base classes, not TypeScript interfaces
// — this codebase has no TS tooling anywhere else, so these enforce the contract at runtime
// (an unimplemented method throws immediately, not just "missing" from a type file nobody
// checks) rather than adding a new build-time type system for one module.
//
// No concrete provider here ever talks to a real CDSL/BSE Star MF/CAMS/KFintech/DigiLocker/CKYC/
// bank/payment endpoint. Only Mock* subclasses (./mock/) exist right now — see
// docs/INVEST_PLATFORM_ARCHITECTURE.md §11 for what's explicitly out of scope this phase.

export class KYCProvider {
  /** @param {{userId: string, pan?: string}} input */
  async initiateVerification(input) { throw new Error("KYCProvider.initiateVerification not implemented"); }
  /** @param {string} sessionId */
  async checkStatus(sessionId) { throw new Error("KYCProvider.checkStatus not implemented"); }
  // CKYC = Central KYC Registry — a lookup distinct from any single provider's own verification;
  // every applicant needs this checked regardless of which document-verification provider is
  // used, per SEBI/AMFI KYC norms (see architecture doc §6.1).
  /** @param {string} pan */
  async checkCKYCStatus(pan) { throw new Error("KYCProvider.checkCKYCStatus not implemented"); }
}

export class DocumentProvider {
  // Retrieval only (e.g. DigiLocker fetching a document the user already holds there) — never a
  // KYC verification method in itself. See architecture doc §6.1 for why this is a separate
  // interface from KYCProvider rather than folded into it.
  /** @param {string} consentToken @param {string} docType */
  async fetchDocument(consentToken, docType) { throw new Error("DocumentProvider.fetchDocument not implemented"); }
}

export class InvestmentProvider {
  /** @param {{userId: string}} input */
  async openAccount(input) { throw new Error("InvestmentProvider.openAccount not implemented"); }
  /** @param {object} order */
  async placeOrder(order) { throw new Error("InvestmentProvider.placeOrder not implemented"); }
  /** @param {string} providerOrderId */
  async getOrderStatus(providerOrderId) { throw new Error("InvestmentProvider.getOrderStatus not implemented"); }
  /** @param {string} providerOrderId */
  async cancelOrder(providerOrderId) { throw new Error("InvestmentProvider.cancelOrder not implemented"); }
  /** @param {object} mandate */
  async createSIPMandate(mandate) { throw new Error("InvestmentProvider.createSIPMandate not implemented"); }
}

export class PaymentProvider {
  /** @param {object} input */
  async initiateMandate(input) { throw new Error("PaymentProvider.initiateMandate not implemented"); } // NACH/UPI Autopay, for SIPs
  /** @param {object} input */
  async initiatePayment(input) { throw new Error("PaymentProvider.initiatePayment not implemented"); } // one-time purchase payment
  /** @param {string} ref */
  async getPaymentStatus(ref) { throw new Error("PaymentProvider.getPaymentStatus not implemented"); }
}

export class PortfolioProvider {
  // Reconciles into the SAME portfolio_transactions/portfolio_holdings tables the existing
  // CAS-import engine already populates — one portfolio truth regardless of source (architecture
  // doc §7).
  /** @param {string} userId */
  async syncHoldings(userId) { throw new Error("PortfolioProvider.syncHoldings not implemented"); }
}
