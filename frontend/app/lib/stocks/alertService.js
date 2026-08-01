// Stock Alerts (Stock Intelligence, Section 21). Every alert_type here is either a factual
// threshold (price_threshold) or "something objectively happened" (result_published, filing,
// concall, corporate_action, promoter_transaction, material_announcement, watchlist_event) — no
// alert_type here implies or triggers a buy/sell recommendation, matching the schema's own
// check constraint.
import { query } from "../db.js";

const ALERT_TYPES = new Set([
  "price_threshold", "result_published", "filing", "concall", "corporate_action",
  "promoter_transaction", "material_announcement", "watchlist_event",
]);
const THRESHOLD_DIRECTIONS = new Set(["above", "below"]);
const STATUSES = new Set(["active", "triggered", "disabled"]);

function shapeAlert(row) {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    alertType: row.alert_type,
    thresholdValue: row.threshold_value == null ? null : Number(row.threshold_value),
    thresholdDirection: row.threshold_direction,
    status: row.status,
    createdAt: row.created_at,
    triggeredAt: row.triggered_at,
  };
}

export async function createAlert({ userId, companyId, alertType, thresholdValue = null, thresholdDirection = null }) {
  if (!ALERT_TYPES.has(alertType)) throw new Error(`createAlert: invalid alertType '${alertType}'.`);
  if (alertType === "price_threshold" && (thresholdValue == null || !THRESHOLD_DIRECTIONS.has(thresholdDirection))) {
    throw new Error("createAlert: a price_threshold alert requires thresholdValue and thresholdDirection ('above'|'below').");
  }
  const r = await query(
    `insert into stock_alerts (user_id, company_id, alert_type, threshold_value, threshold_direction)
     values ($1,$2,$3,$4,$5) returning *`,
    [userId, companyId, alertType, thresholdValue, thresholdDirection]
  );
  return shapeAlert(r.rows[0]);
}

export async function getAlerts(userId, { status = null } = {}) {
  if (status && !STATUSES.has(status)) throw new Error(`getAlerts: invalid status '${status}'.`);
  const r = status
    ? await query(`select * from stock_alerts where user_id = $1 and status = $2 order by created_at desc`, [userId, status])
    : await query(`select * from stock_alerts where user_id = $1 order by created_at desc`, [userId]);
  return r.rows.map(shapeAlert);
}

export async function triggerAlert(alertId) {
  const r = await query(`update stock_alerts set status = 'triggered', triggered_at = now() where id = $1 and status = 'active' returning *`, [alertId]);
  return r.rows[0] ? shapeAlert(r.rows[0]) : null;
}

export async function disableAlert(alertId) {
  const r = await query(`update stock_alerts set status = 'disabled' where id = $1 returning *`, [alertId]);
  return r.rows[0] ? shapeAlert(r.rows[0]) : null;
}
