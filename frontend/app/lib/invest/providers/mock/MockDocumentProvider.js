// Mock document-retrieval provider (Invest Platform Phase 1, Module 4) — stands in for a real
// retrieval-assist provider (e.g. DigiLocker). Never fetches, stores, or fabricates a real
// government document; returns a synthetic reference only. See docs/INVEST_PLATFORM_ARCHITECTURE.md
// §6.1 — this is retrieval, never verification, even in the real (non-mock) design.
import { DocumentProvider } from "../types.js";
import { mockRef } from "./ids.js";

export class MockDocumentProvider extends DocumentProvider {
  async fetchDocument(consentToken, docType) {
    if (!consentToken) throw new Error("MockDocumentProvider.fetchDocument requires a consent token — no document fetch without recorded consent, even in mock mode.");
    return {
      docType,
      storageRef: mockRef("doc"),
      source: "mock-digilocker",
      fetchedAt: new Date().toISOString(),
    };
  }
}
