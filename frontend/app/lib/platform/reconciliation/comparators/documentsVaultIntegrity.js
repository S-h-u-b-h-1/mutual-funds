// documents-vault-integrity — every COMPLETED order must have its auto-generated
// investment_confirmation document (the guarantee documentService wires into
// orderService.transition). A missing document means that trigger regressed or a write was
// lost: exactly the class of silent breakage reconciliation exists to catch. "External" here
// is the counterpart record (the document), so a gap classifies as missing_external.
import { query } from "../../../db.js";
import { registerComparator } from "../registry.js";

registerComparator({
  type: "documents-vault-integrity",
  entityType: "order",
  async loadPairs(scope = {}) {
    const limit = Math.min(Number(scope.limit ?? 500), 2000);
    const r = await query(
      `select o.id, o.user_id, o.status, d.id as document_id
       from investment_orders o
       left join documents d
         on d.related_entity_type = 'order' and d.related_entity_id = o.id::text
        and d.doc_type = 'investment_confirmation'
       where o.status = 'completed'
       order by o.updated_at desc
       limit $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      key: row.id,
      internal: { orderId: row.id, status: row.status },
      external: row.document_id ? { documentId: row.document_id } : null,
    }));
  },
  compare() {
    return { matched: true }; // both sides existing IS the invariant
  },
});
