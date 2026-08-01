// Stock Research Notes (Stock Intelligence, Section 22-23) — private/personal only this pass;
// Section 22 explicitly defers any public/community feature ("Do not launch public social/
// community features in this backend phase unless explicitly approved"). One evolving note per
// user per company, versioned on every edit: before an update overwrites the row, the row's PRIOR
// content is snapshotted into stock_research_note_versions, so nothing is silently lost.
import { query, withTransaction } from "../db.js";

function shapeNote(row) {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    thesis: row.thesis,
    catalysts: row.catalysts,
    risks: row.risks,
    questions: row.questions,
    managementObservations: row.management_observations,
    valuationAssumptions: row.valuation_assumptions,
    attachments: row.attachments,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertResearchNote({
  userId, companyId, thesis = null, catalysts = null, risks = null, questions = null,
  managementObservations = null, valuationAssumptions = null, attachments = [],
}) {
  return withTransaction(async (client) => {
    const existing = await client.query(`select * from stock_research_notes where user_id = $1 and company_id = $2`, [userId, companyId]);

    if (existing.rows[0]) {
      const prior = existing.rows[0];
      await client.query(
        `insert into stock_research_note_versions (note_id, version, snapshot) values ($1, $2, $3)`,
        [prior.id, prior.version, JSON.stringify({
          thesis: prior.thesis, catalysts: prior.catalysts, risks: prior.risks, questions: prior.questions,
          managementObservations: prior.management_observations, valuationAssumptions: prior.valuation_assumptions,
          attachments: prior.attachments, updatedAt: prior.updated_at,
        })]
      );
      const updated = await client.query(
        `update stock_research_notes set thesis=$3, catalysts=$4, risks=$5, questions=$6, management_observations=$7,
           valuation_assumptions=$8, attachments=$9, version = version + 1, updated_at = now()
         where user_id = $1 and company_id = $2 returning *`,
        [userId, companyId, thesis, catalysts, risks, questions, managementObservations, valuationAssumptions, JSON.stringify(attachments)]
      );
      return shapeNote(updated.rows[0]);
    }

    const inserted = await client.query(
      `insert into stock_research_notes (user_id, company_id, thesis, catalysts, risks, questions, management_observations, valuation_assumptions, attachments)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [userId, companyId, thesis, catalysts, risks, questions, managementObservations, valuationAssumptions, JSON.stringify(attachments)]
    );
    return shapeNote(inserted.rows[0]);
  });
}

export async function getResearchNote(userId, companyId) {
  const r = await query(`select * from stock_research_notes where user_id = $1 and company_id = $2`, [userId, companyId]);
  return r.rows[0] ? shapeNote(r.rows[0]) : null;
}

export async function getResearchNotes(userId) {
  const r = await query(`select * from stock_research_notes where user_id = $1 order by updated_at desc`, [userId]);
  return r.rows.map(shapeNote);
}

export async function getResearchNoteVersionHistory(noteId) {
  const r = await query(`select version, snapshot, created_at from stock_research_note_versions where note_id = $1 order by version desc`, [noteId]);
  return r.rows.map((row) => ({ version: row.version, snapshot: row.snapshot, createdAt: row.created_at }));
}
