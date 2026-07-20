// Minimal notification writer (Journey 2's own requirement: "every state transition should
// generate...notifications"). Deliberately just a writer this pass — the full service (list,
// mark-read APIs, the complete event vocabulary across every journey) is Journey 6. Building
// once now and extending later avoids building this twice; every other service calls this one
// function rather than knowing anything about how notifications are stored or delivered — the
// decoupling the brief explicitly asked for ("avoid tightly coupling services").
import { query } from "../db.js";

export async function notifyUser(userId, type, { title, body = null, relatedEntityType = null, relatedEntityId = null } = {}) {
  await query(
    `insert into notifications (user_id, type, title, body, related_entity_type, related_entity_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [userId, type, title, body, relatedEntityType, relatedEntityId]
  );
}
