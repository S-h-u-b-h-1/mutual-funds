// Notification Read APIs — priority-list item 3/5 (= M5 Slice 4 Timeline, reframed). Backs
// docs/NOTIFICATION_READ_APIS.md. Pure reads only — every state MUTATION (markRead, markUnread,
// dismissNotification, archiveNotification, cancelNotification) already existed in core.js since
// M5 sub-step 1; this module is the read side that was genuinely missing: there was no way to
// list a user's own notifications at all before this.
import { query } from "../../db.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * The inbox listing. Excludes dismissed/archived by default — that's what those actions are
 * FOR, matching how a real notification inbox works — with explicit opt-in flags to include
 * them (e.g. for a separate "archived" tab). Plain limit/offset pagination, matching this
 * codebase's existing convention (e.g. getPortfolioTimeline's `limit`) rather than introducing
 * cursor-based pagination nothing else here uses.
 */
export async function listNotifications(userId, {
  status = null, category = null, type = null,
  unreadOnly = false, includeArchived = false, includeDismissed = false,
  limit = DEFAULT_LIMIT, offset = 0,
} = {}) {
  const conditions = ["user_id = $1"];
  const params = [userId];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
  if (unreadOnly) conditions.push("read_at is null");
  if (!includeArchived) conditions.push("archived_at is null");
  if (!includeDismissed) conditions.push("dismissed_at is null");
  const where = conditions.join(" and ");

  const safeLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const safeOffset = Math.max(0, Number(offset) || 0);

  const [rows, count] = await Promise.all([
    query(`select * from notifications where ${where} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`, [...params, safeLimit, safeOffset]),
    query(`select count(*) from notifications where ${where}`, params),
  ]);

  return { notifications: rows.rows, total: Number(count.rows[0].count), limit: safeLimit, offset: safeOffset };
}

/** Excludes dismissed/archived — same "what's actually in the active inbox" definition as
 * listNotifications' default, so a badge count and the list it corresponds to never disagree. */
export async function getUnreadCount(userId, { category = null } = {}) {
  const conditions = ["user_id = $1", "read_at is null", "dismissed_at is null", "archived_at is null"];
  const params = [userId];
  if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
  const r = await query(`select count(*) from notifications where ${conditions.join(" and ")}`, params);
  return Number(r.rows[0].count);
}

/** Same shape/reasoning as orderService.getOrderWithTimeline: the notification row plus every
 * notification_events row for it, in real chronological order — the platform's own delivery/
 * read/dismiss/archive history, not just the current state. */
export async function getNotificationWithTimeline(userId, notificationId) {
  const notifResult = await query(`select * from notifications where id = $1 and user_id = $2`, [notificationId, userId]);
  const notification = notifResult.rows[0];
  if (!notification) return null;
  const events = await query(
    `select event, detail, created_at from notification_events where notification_id = $1 order by created_at`,
    [notificationId]
  );
  return { notification, timeline: events.rows };
}
