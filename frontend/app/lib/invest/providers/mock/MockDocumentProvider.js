// Mock document provider (Invest Platform Phase 1 Module 4, extended Journey 4). Two distinct
// capabilities, kept on one class because they're both "documents" from the platform's point of
// view, never a real CDSL/BSE Star MF/CAMS/KFintech/DigiLocker endpoint:
//   - fetchDocument: RETRIEVAL — standing in for something like DigiLocker fetching a document
//     the user already holds elsewhere (used by complianceService's identity check).
//   - generateDocument: GENERATION — the platform fabricating a document (a statement, a
//     confirmation) for the vault (Journey 4). Both return a synthetic reference only, never
//     real bytes or real customer information.
import { DocumentProvider } from "../types.js";
import { mockRef } from "./ids.js";

// One plausible file-size range (bytes) per doc type — wide enough to look like a real generated
// PDF varies by content, never suspiciously identical across documents of the same type.
const DOC_TYPE_SIZE_RANGE_BYTES = {
  cas: [180_000, 620_000],
  account_statement: [90_000, 260_000],
  investment_confirmation: [35_000, 90_000],
  tax_statement: [70_000, 210_000],
  kyc_pdf: [40_000, 120_000],
  mandate: [25_000, 60_000],
  advisor_note: [15_000, 45_000],
};

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

  async generateDocument(docType, context = {}) {
    const [min, max] = DOC_TYPE_SIZE_RANGE_BYTES[docType] || [20_000, 100_000];
    return {
      docType,
      storageRef: mockRef("doc"),
      provider: "mock-document-generator",
      mimeType: "application/pdf",
      fileSizeBytes: Math.floor(min + Math.random() * (max - min)),
      generatedAt: new Date().toISOString(),
      context, // caller-supplied context (e.g. { orderId }) — passed through, never inspected here
    };
  }

  async storeUpload(fileMetadata = {}) {
    return {
      storageRef: mockRef("doc"),
      provider: "mock-document-store",
      mimeType: fileMetadata.mimeType || "application/octet-stream",
      fileSizeBytes: fileMetadata.fileSizeBytes ?? null,
    };
  }
}
