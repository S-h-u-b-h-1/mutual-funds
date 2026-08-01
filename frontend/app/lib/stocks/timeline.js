// Company Timeline (Stock Intelligence, Section 7-8) — a dated, sourced, typed event tied to one
// company, directly mirroring fund_history_events' shape and role (this team's own established
// idiom for exactly this concept) as a new sibling table, not a shared one: a company event and a
// fund metadata-change event have different type vocabularies and no reason to share storage.
import { query } from "../db.js";

export const EVENT_TYPES = new Set([
  "results", "filing", "annual_report", "investor_presentation", "concall",
  "dividend", "buyback", "bonus", "split", "rights_issue", "fundraising", "ma",
  "promoter_activity", "management_change", "credit_rating", "capacity_expansion",
  "order", "regulatory",
]);

function shapeEvent(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    eventType: row.event_type,
    eventDate: row.event_date,
    headline: row.headline,
    summary: row.summary,
    source: row.source,
    sourceUrl: row.source_url,
    rawDocumentRef: row.raw_document_ref,
    createdAt: row.created_at,
  };
}

export async function recordCompanyEvent({ companyId, eventType, eventDate, headline, summary = null, source, sourceUrl = null, rawDocumentRef = null }) {
  if (!EVENT_TYPES.has(eventType)) throw new Error(`recordCompanyEvent: invalid eventType '${eventType}'.`);
  if (!headline || !source) throw new Error("recordCompanyEvent requires headline and source — every timeline entry must be attributable.");
  const r = await query(
    `insert into company_events (company_id, event_type, event_date, headline, summary, source, source_url, raw_document_ref)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [companyId, eventType, eventDate, headline, summary, source, sourceUrl, rawDocumentRef]
  );
  return shapeEvent(r.rows[0]);
}

export async function getCompanyTimeline(companyId, { eventType = null, limit = 50 } = {}) {
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const r = eventType
    ? await query(
        `select * from company_events where company_id = $1 and event_type = $2 order by event_date desc, created_at desc limit $3`,
        [companyId, eventType, clampedLimit]
      )
    : await query(`select * from company_events where company_id = $1 order by event_date desc, created_at desc limit $2`, [companyId, clampedLimit]);
  return r.rows.map(shapeEvent);
}

// ============================================================================
// Results Tracker (Section 8) — forward-looking (expected/board-meeting/concall dates), separate
// from company_events because events are recorded after the fact; this is one row per
// company+period, updated in place as its status moves from expected to published/delayed.
// ============================================================================

const RESULTS_STATUSES = new Set(["expected", "published", "delayed", "cancelled"]);

function shapeResultsRow(row) {
  return {
    companyId: row.company_id,
    periodEndDate: row.period_end_date,
    periodType: row.period_type,
    expectedDate: row.expected_date,
    boardMeetingDate: row.board_meeting_date,
    concallDate: row.concall_date,
    actualPublicationDate: row.actual_publication_date,
    status: row.status,
    source: row.source,
    updatedAt: row.updated_at,
  };
}

export async function upsertResultsCalendarEntry({
  companyId, periodEndDate, periodType, expectedDate = null, boardMeetingDate = null, concallDate = null,
  actualPublicationDate = null, status = "expected", source = null,
}) {
  if (!RESULTS_STATUSES.has(status)) throw new Error(`upsertResultsCalendarEntry: invalid status '${status}'.`);
  const r = await query(
    `insert into company_results_calendar (company_id, period_end_date, period_type, expected_date, board_meeting_date, concall_date, actual_publication_date, status, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (company_id, period_end_date, period_type) do update set
       expected_date = excluded.expected_date, board_meeting_date = excluded.board_meeting_date,
       concall_date = excluded.concall_date, actual_publication_date = excluded.actual_publication_date,
       status = excluded.status, source = excluded.source, updated_at = now()
     returning *`,
    [companyId, periodEndDate, periodType, expectedDate, boardMeetingDate, concallDate, actualPublicationDate, status, source]
  );
  return shapeResultsRow(r.rows[0]);
}

export async function getResultsCalendar(companyId, { limit = 8 } = {}) {
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 40);
  const r = await query(
    `select * from company_results_calendar where company_id = $1 order by period_end_date desc limit $2`,
    [companyId, clampedLimit]
  );
  return r.rows.map(shapeResultsRow);
}

// Cross-company view for an "upcoming results" surface — every company with a still-outstanding
// expected/board-meeting/concall date on or after fromDate, soonest first. Never returns a
// fabricated estimate for a company with no calendar row on file; it simply won't appear.
export async function getUpcomingResults({ fromDate = new Date().toISOString().slice(0, 10), limit = 50 } = {}) {
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const r = await query(
    `select * from company_results_calendar
     where status in ('expected', 'delayed') and coalesce(expected_date, board_meeting_date, concall_date) >= $1
     order by coalesce(expected_date, board_meeting_date, concall_date) asc
     limit $2`,
    [fromDate, clampedLimit]
  );
  return r.rows.map(shapeResultsRow);
}
