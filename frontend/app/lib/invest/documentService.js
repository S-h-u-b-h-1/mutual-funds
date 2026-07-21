// Journey 4 — Document Vault. The canonical document layer for the whole platform (Research and
// Invest can both write into `documents` in the future — nothing here is Invest-specific beyond
// where it's called from today). No real binary storage backend exists this phase ("No real
// providers yet. Only architecture, persistence and APIs" — explicit brief scope): every
// storage_ref comes from documentProvider (mock today), never synthesized here, so swapping in a
// real object-storage/DigiLocker-generation provider later never touches this file.
import { query } from "../db.js";
import { documentProvider } from "./providers/index.js";
import { logAudit } from "./audit.js";
import { notifyUser } from "./notifications.js";
import { emitEvent } from "../platform/events/core.js";

export const CATEGORIES = [
  "identity", "compliance", "portfolio", "transactions", "statements", "tax",
  "mandates", "research_exports", "advisor_documents", "other",
];
export const DOC_TYPES = [
  "cas", "account_statement", "investment_confirmation", "tax_statement",
  "kyc_pdf", "mandate", "advisor_note", "user_upload",
];
export const STATUSES = ["generated", "uploaded", "reviewed", "verified", "archived", "expired"];
export const VISIBILITIES = ["private", "shared", "advisor", "internal"];

const DOC_TYPE_DEFAULT_CATEGORY = {
  cas: "statements", account_statement: "statements", investment_confirmation: "transactions",
  tax_statement: "tax", kyc_pdf: "identity", mandate: "mandates", advisor_note: "advisor_documents",
  user_upload: "other",
};
const DOC_TYPE_DEFAULT_TITLE = {
  cas: "Consolidated Account Statement", account_statement: "Account Statement",
  investment_confirmation: "Investment Confirmation", tax_statement: "Tax Statement",
  kyc_pdf: "KYC Document", mandate: "SIP Mandate", advisor_note: "Advisor Note",
};
const NOTIFICATION_COPY = {
  generated: { type: "document_generated", title: "New document ready" },
  uploaded: { type: "document_uploaded", title: "Document uploaded" },
};

function assertCategory(category) {
  if (!CATEGORIES.includes(category)) throw new Error(`category must be one of: ${CATEGORIES.join(", ")}`);
}
function assertDocType(docType) {
  if (!DOC_TYPES.includes(docType)) throw new Error(`docType must be one of: ${DOC_TYPES.join(", ")}`);
}

async function recordEvent(documentId, eventType, actorUserId, metadata = {}) {
  await query(
    `insert into document_events (document_id, event_type, actor_user_id, metadata) values ($1, $2, $3, $4)`,
    [documentId, eventType, actorUserId, JSON.stringify(metadata)]
  );
}

export async function listDocuments(userId, { category, status, limit = 50 } = {}) {
  const clauses = ["user_id = $1"];
  const params = [userId];
  if (category) { params.push(category); clauses.push(`category = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  params.push(Math.min(200, Math.max(1, limit)));
  const r = await query(
    `select * from documents where ${clauses.join(" and ")} order by created_at desc limit $${params.length}`,
    params
  );
  return r.rows;
}

export async function getDocumentRaw(userId, documentId) {
  const r = await query(`select * from documents where id = $1 and user_id = $2`, [documentId, userId]);
  return r.rows[0] ?? null;
}

export async function getDocumentWithTimeline(userId, documentId) {
  const document = await getDocumentRaw(userId, documentId);
  if (!document) return null;
  const events = await query(`select * from document_events where document_id = $1 order by created_at asc`, [documentId]);
  return { document, timeline: events.rows };
}

// Full-text + multi-filter search. `keyword` ranks by relevance (ts_rank) when present; every
// other filter is an exact/overlap match, all combinable. Always scoped to the caller's own
// documents — there is no `owner` filter param because accepting an arbitrary owner override
// would be a cross-user data leak, not a feature.
export async function searchDocuments(userId, { keyword, category, status, tags, source, dateFrom, dateTo, limit = 50 } = {}) {
  const clauses = ["user_id = $1"];
  const params = [userId];
  let keywordParamIndex = null;

  if (keyword) {
    params.push(keyword);
    keywordParamIndex = params.length;
    clauses.push(`search_vector @@ plainto_tsquery('english', $${keywordParamIndex})`);
  }
  if (category) { params.push(category); clauses.push(`category = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (source) { params.push(source); clauses.push(`source = $${params.length}`); }
  if (tags && tags.length) { params.push(tags); clauses.push(`tags && $${params.length}::text[]`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`created_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`created_at <= $${params.length}`); }

  params.push(Math.min(200, Math.max(1, limit)));
  const limitIndex = params.length;
  const orderBy = keywordParamIndex
    ? `ts_rank(search_vector, plainto_tsquery('english', $${keywordParamIndex})) desc, created_at desc`
    : `created_at desc`;

  const r = await query(
    `select * from documents where ${clauses.join(" and ")} order by ${orderBy} limit $${limitIndex}`,
    params
  );
  return r.rows;
}

// User-initiated upload. Mock phase persists metadata only — storage_ref is a synthetic
// reference from documentProvider.storeUpload(), never real bytes (see file header).
export async function uploadDocument(userId, { category, docType = "user_upload", title, description = null, tags = [], mimeType = null, fileSizeBytes = null, relatedEntityType = null, relatedEntityId = null } = {}) {
  assertCategory(category);
  assertDocType(docType);
  if (!title) throw new Error("title is required.");

  const stored = await documentProvider.storeUpload({ mimeType, fileSizeBytes });
  const r = await query(
    `insert into documents (user_id, category, doc_type, title, description, tags, source, provider, storage_ref, mime_type, file_size_bytes, status)
     values ($1,$2,$3,$4,$5,$6,'user-upload',$7,$8,$9,$10,'uploaded')
     returning *`,
    [userId, category, docType, title, description, tags, stored.provider, stored.storageRef, stored.mimeType, stored.fileSizeBytes]
  );
  const document = r.rows[0];
  await recordEvent(document.id, "uploaded", userId);
  await logAudit(userId, "document_uploaded", { documentId: document.id, category, docType });
  const copy = NOTIFICATION_COPY.uploaded;
  await notifyUser(userId, copy.type, { title: copy.title, body: title, relatedEntityType: relatedEntityType || "document", relatedEntityId: relatedEntityId || document.id });
  return document;
}

// Platform-generated document — called both directly (e.g. a future "generate my tax statement"
// action) and internally by other services on a real lifecycle event (see orderService.js's
// order-completion hook, which generates an investment_confirmation the same way a real
// brokerage issues a contract note on settlement).
export async function generateDocument(userId, { docType, title = null, description = null, tags = [], category = null, relatedEntityType = null, relatedEntityId = null } = {}) {
  assertDocType(docType);
  const resolvedCategory = category || DOC_TYPE_DEFAULT_CATEGORY[docType] || "other";
  assertCategory(resolvedCategory);
  const resolvedTitle = title || `${DOC_TYPE_DEFAULT_TITLE[docType] || docType} — ${new Date().toISOString().slice(0, 10)}`;

  const generated = await documentProvider.generateDocument(docType, { userId, relatedEntityType, relatedEntityId });
  const r = await query(
    `insert into documents (user_id, category, doc_type, title, description, tags, source, provider, storage_ref, mime_type, file_size_bytes, status, related_entity_type, related_entity_id)
     values ($1,$2,$3,$4,$5,$6,'mock-generated',$7,$8,$9,$10,'generated',$11,$12)
     returning *`,
    [userId, resolvedCategory, docType, resolvedTitle, description, tags, generated.provider, generated.storageRef, generated.mimeType, generated.fileSizeBytes, relatedEntityType, relatedEntityId]
  );
  const document = r.rows[0];
  await recordEvent(document.id, "generated", null, { docType });
  await logAudit(userId, "document_generated", { documentId: document.id, docType, relatedEntityType, relatedEntityId });
  const copy = NOTIFICATION_COPY.generated;
  await notifyUser(userId, copy.type, { title: copy.title, body: resolvedTitle, relatedEntityType: relatedEntityType || "document", relatedEntityId: relatedEntityId || document.id });
  await emitEvent("DocumentGenerated", { userId, documentId: document.id, docType, relatedEntityType, relatedEntityId }, { correlationId: userId, source: "documentService" });
  return document;
}

export async function archiveDocument(userId, documentId) {
  const document = await getDocumentRaw(userId, documentId);
  if (!document) return null;
  if (document.status === "archived") throw new Error("Document is already archived.");

  const r = await query(`update documents set status = 'archived', updated_at = now() where id = $1 returning *`, [documentId]);
  await recordEvent(documentId, "archived", userId);
  await logAudit(userId, "document_archived", { documentId });
  return r.rows[0];
}

// Mock phase: there is no real object-storage backend to stream bytes from (see file header) —
// this records the download event and returns the document (including its synthetic storageRef)
// rather than a binary response. Never changes status; a document can be downloaded any number
// of times regardless of lifecycle stage.
export async function downloadDocument(userId, documentId) {
  const document = await getDocumentRaw(userId, documentId);
  if (!document) return null;

  await recordEvent(documentId, "downloaded", userId);
  await logAudit(userId, "document_downloaded", { documentId });
  return document;
}

// Updates visibility (also how a share is revoked — pass visibility: 'private'). No recipient/
// grant table this pass — see the schema's note 3 on why cross-user enforcement is deferred to
// Journey 5 (CRM); this only changes the DOCUMENT's own visibility flag and records the event.
export async function shareDocument(userId, documentId, { visibility, note = null } = {}) {
  if (!VISIBILITIES.includes(visibility)) throw new Error(`visibility must be one of: ${VISIBILITIES.join(", ")}`);
  const document = await getDocumentRaw(userId, documentId);
  if (!document) return null;

  const r = await query(`update documents set visibility = $2, updated_at = now() where id = $1 returning *`, [documentId, visibility]);
  await recordEvent(documentId, "shared", userId, { visibility, note });
  await logAudit(userId, "document_shared", { documentId, visibility });
  return r.rows[0];
}
