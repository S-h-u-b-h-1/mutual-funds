// Provider registry — the ONE place that decides which concrete implementation backs each
// interface. Every service module imports providers from here, never a concrete Mock* class
// directly, so swapping in a real CDSL/BSE Star MF/CAMS/KFintech/DigiLocker adapter later is a
// change in this one file, not a hunt-and-replace across every service. Today every slot is
// mocked — see docs/INVEST_PLATFORM_ARCHITECTURE.md §11 for why that's deliberate this phase.
import { MockKYCProvider } from "./mock/MockKYCProvider.js";
import { MockDocumentProvider } from "./mock/MockDocumentProvider.js";
import { MockInvestmentProvider } from "./mock/MockInvestmentProvider.js";
import { MockPaymentProvider } from "./mock/MockPaymentProvider.js";
import { MockPortfolioProvider } from "./mock/MockPortfolioProvider.js";
import { KYCProvider, DocumentProvider, InvestmentProvider, PaymentProvider, PortfolioProvider } from "./types.js";
import { registerProvider, deriveCapabilities } from "../../platform/providerRegistry/core.js";
import { getProviderConfig } from "../../platform/config/core.js";

export const kycProvider = new MockKYCProvider();
export const documentProvider = new MockDocumentProvider();
export const investmentProvider = new MockInvestmentProvider();
export const paymentProvider = new MockPaymentProvider();
export const portfolioProvider = new MockPortfolioProvider();

// Operational registration (Phase 4.5 step 4) — additive metadata for cross-cutting
// health/version/capability reporting, NOT a second swap mechanism (that stays above: swapping
// a mock for a real adapter is still a one-line change to the exports, nothing to do with this
// registry). Capabilities are derived from each interface's own declared methods rather than
// hand-typed, so a registration can't silently drift from what the interface actually requires.
// Mocks report a static 'healthy' status rather than fabricated latency/error-rate numbers —
// there is no real operational signal to report yet, and inventing one would be misleading.
for (const [name, provider, InterfaceClass] of [
  ["kyc", kycProvider, KYCProvider],
  ["document", documentProvider, DocumentProvider],
  ["investment", investmentProvider, InvestmentProvider],
  ["payment", paymentProvider, PaymentProvider],
  ["portfolio", portfolioProvider, PortfolioProvider],
]) {
  registerProvider(name, {
    version: "mock-1.0.0",
    capabilities: deriveCapabilities(InterfaceClass),
    supportedFeatures: [],
    mode: "sandbox",
    getHealth: () => ({ status: "healthy", mode: "mock" }),
    getConfig: () => getProviderConfig(name),
  });
}
