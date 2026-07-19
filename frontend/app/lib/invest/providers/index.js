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

export const kycProvider = new MockKYCProvider();
export const documentProvider = new MockDocumentProvider();
export const investmentProvider = new MockInvestmentProvider();
export const paymentProvider = new MockPaymentProvider();
export const portfolioProvider = new MockPortfolioProvider();
