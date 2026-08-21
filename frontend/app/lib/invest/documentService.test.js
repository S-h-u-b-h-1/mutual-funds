import { describe, it, expect, vi } from "vitest";
import { query } from "../db.js";
import * as documentService from "./documentService.js";
import { createTestUser, deleteTestUser, makeInvestmentReadyUser } from "./testHelpers.js";
import * as orderService from "./orderService.js";

describe("documentService (integration, real Neon, disposable users)", () => {
  it("a fresh user's vault is empty — list and search both return [], not an error", async () => {
    const userId = await createTestUser("doc-empty");
    try {
      expect(await documentService.listDocuments(userId)).toEqual([]);
      expect(await documentService.searchDocuments(userId, { keyword: "statement" })).toEqual([]);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("rejects an unknown category or docType before touching the provider", async () => {
    const userId = await createTestUser("doc-validate");
    try {
      await expect(documentService.uploadDocument(userId, { category: "not-a-category", docType: "user_upload", title: "x" }))
        .rejects.toThrow(/category must be one of/);
      await expect(documentService.uploadDocument(userId, { category: "tax", docType: "not-a-type", title: "x" }))
        .rejects.toThrow(/docType must be one of/);
      await expect(documentService.uploadDocument(userId, { category: "tax", docType: "user_upload" }))
        .rejects.toThrow(/title is required/);
      await expect(documentService.generateDocument(userId, { docType: "not-a-type" }))
        .rejects.toThrow(/docType must be one of/);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("uploadDocument persists metadata, tags source='user-upload'/status='uploaded', and records an event", async () => {
    const userId = await createTestUser("doc-upload");
    try {
      const doc = await documentService.uploadDocument(userId, {
        category: "tax", docType: "user_upload", title: "My Form 16",
        tags: ["fy2025-26"], mimeType: "application/pdf", fileSizeBytes: 55000,
      });
      expect(doc.source).toBe("user-upload");
      expect(doc.status).toBe("uploaded");
      expect(doc.storage_ref).toMatch(/^doc_/);
      expect(doc.tags).toEqual(["fy2025-26"]);

      const { timeline } = await documentService.getDocumentWithTimeline(userId, doc.id);
      expect(timeline).toHaveLength(1);
      expect(timeline[0].event_type).toBe("uploaded");

      const audit = await query(`select 1 from audit_log where user_id = $1 and action = 'document_uploaded'`, [userId]);
      expect(audit.rows.length).toBe(1);
      const notif = await query(`select 1 from notifications where user_id = $1 and type = 'document_uploaded'`, [userId]);
      expect(notif.rows.length).toBe(1);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("generateDocument applies sensible category/title defaults per docType unless overridden", async () => {
    const userId = await createTestUser("doc-generate");
    try {
      const withDefaults = await documentService.generateDocument(userId, { docType: "tax_statement" });
      expect(withDefaults.category).toBe("tax");
      expect(withDefaults.title).toMatch(/Tax Statement/);
      expect(withDefaults.source).toBe("mock-generated");
      expect(withDefaults.status).toBe("generated");
      expect(withDefaults.provider).toBe("mock-document-generator");

      const overridden = await documentService.generateDocument(userId, {
        docType: "tax_statement", category: "other", title: "Custom Title",
      });
      expect(overridden.category).toBe("other");
      expect(overridden.title).toBe("Custom Title");
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("archiveDocument transitions status once, then refuses to re-archive", async () => {
    const userId = await createTestUser("doc-archive");
    try {
      const doc = await documentService.generateDocument(userId, { docType: "advisor_note" });
      const archived = await documentService.archiveDocument(userId, doc.id);
      expect(archived.status).toBe("archived");
      await expect(documentService.archiveDocument(userId, doc.id)).rejects.toThrow(/already archived/);
      expect(await documentService.archiveDocument(userId, "00000000-0000-0000-0000-000000000099")).toBeNull();
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("downloadDocument records an event without changing status, and is repeatable", async () => {
    const userId = await createTestUser("doc-download");
    try {
      const doc = await documentService.generateDocument(userId, { docType: "mandate" });
      await documentService.downloadDocument(userId, doc.id);
      await documentService.downloadDocument(userId, doc.id);

      const fresh = await documentService.getDocumentRaw(userId, doc.id);
      expect(fresh.status).toBe("generated"); // unchanged by downloading

      const { timeline } = await documentService.getDocumentWithTimeline(userId, doc.id);
      expect(timeline.filter((e) => e.event_type === "downloaded")).toHaveLength(2);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("shareDocument validates visibility, updates it, and records a share event; also how a share is revoked", async () => {
    const userId = await createTestUser("doc-share");
    try {
      const doc = await documentService.generateDocument(userId, { docType: "advisor_note" });
      await expect(documentService.shareDocument(userId, doc.id, { visibility: "not-a-visibility" }))
        .rejects.toThrow(/visibility must be one of/);

      const shared = await documentService.shareDocument(userId, doc.id, { visibility: "advisor", note: "for Q3 review" });
      expect(shared.visibility).toBe("advisor");

      const revoked = await documentService.shareDocument(userId, doc.id, { visibility: "private" });
      expect(revoked.visibility).toBe("private");

      const { timeline } = await documentService.getDocumentWithTimeline(userId, doc.id);
      expect(timeline.filter((e) => e.event_type === "shared")).toHaveLength(2);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("searchDocuments: keyword ranks by relevance, and every filter is combinable", async () => {
    const userId = await createTestUser("doc-search");
    try {
      await documentService.generateDocument(userId, { docType: "tax_statement", title: "FY2025-26 Capital Gains Tax Statement" });
      await documentService.generateDocument(userId, { docType: "mandate", title: "SIP Mandate — Axis Bluechip" });
      await documentService.uploadDocument(userId, { category: "other", docType: "user_upload", title: "Random Notes", tags: ["misc"] });

      const byKeyword = await documentService.searchDocuments(userId, { keyword: "capital gains" });
      expect(byKeyword.length).toBeGreaterThanOrEqual(1);
      expect(byKeyword[0].title).toMatch(/Capital Gains/);

      const byCategory = await documentService.searchDocuments(userId, { category: "tax" });
      expect(byCategory.every((d) => d.category === "tax")).toBe(true);

      const byTag = await documentService.searchDocuments(userId, { tags: ["misc"] });
      expect(byTag).toHaveLength(1);
      expect(byTag[0].title).toBe("Random Notes");

      const bySource = await documentService.searchDocuments(userId, { source: "mock-generated" });
      expect(bySource.length).toBe(2);

      const combined = await documentService.searchDocuments(userId, { category: "tax", status: "generated" });
      expect(combined).toHaveLength(1);
    } finally {
      await deleteTestUser(userId);
    }
  });

  it("cross-user isolation: one user's documents never appear in another user's list, get, or search", async () => {
    const userA = await createTestUser("doc-iso-a");
    const userB = await createTestUser("doc-iso-b");
    try {
      const docA = await documentService.generateDocument(userA, { docType: "advisor_note", title: "Only for A" });
      expect(await documentService.getDocumentRaw(userB, docA.id)).toBeNull();
      expect(await documentService.getDocumentWithTimeline(userB, docA.id)).toBeNull();
      expect(await documentService.listDocuments(userB)).toEqual([]);
      expect(await documentService.searchDocuments(userB, { keyword: "Only for A" })).toEqual([]);
    } finally {
      await deleteTestUser(userA);
      await deleteTestUser(userB);
    }
  });

  it("a real order reaching 'completed' automatically generates an investment_confirmation document", async () => {
    const userId = await makeInvestmentReadyUser("doc-order-confirm");
    try {
      vi.spyOn(Math, "random").mockReturnValue(0.1); // keeps placeOrder accepted AND decideNextStatus on 'completed'
      const order = await orderService.createOrder(userId, { schemeCode: "100033", orderType: "purchase", amount: 4000 });
      await query(`update investment_orders set submitted_at = now() - interval '30 seconds' where id = $1`, [order.id]);
      const completed = await orderService.refreshOrderStatus(userId, order.id);
      expect(completed.status).toBe("completed");
      vi.restoreAllMocks();

      const docs = await documentService.searchDocuments(userId, { category: "transactions" });
      const confirmation = docs.find((d) => d.related_entity_type === "order" && d.related_entity_id === order.id);
      expect(confirmation).toBeTruthy();
      expect(confirmation.doc_type).toBe("investment_confirmation");
      expect(confirmation.source).toBe("mock-generated");
    } finally {
      await deleteTestUser(userId);
    }
  });
}, 180000);
