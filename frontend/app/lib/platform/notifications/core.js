// Notification Platform core (Phase 5 M5, sub-step 1) — the sendNotification() pipeline and
// state machine. See docs/NOTIFICATION_PLATFORM.md for architecture, the state diagram, and
// failure modes.
//
// Pipeline: Business Event -> Notification Request -> Template Resolution -> Preference
// Evaluation -> Channel Selection -> Provider Selection -> Retry -> Circuit Breaker -> Queue ->
// Delivery -> Tracking -> Audit. In-app is synchronous (writing the row IS the delivery, there
// is no external call); every other channel is queued as an M1 job ('notification-deliver') for
// the actual delivery attempt, so its retry/backoff comes from the job platform's own
// requeue-with-run_at mechanism, not retry/core.js's withRetry (same split documented in
// docs/RETRY_FRAMEWORK.md: job-queue-backed retries use the job platform's own loop). Circuit
// breaking, when a channel needs it, is each channel PROVIDER's own internal responsibility
// (wrap its send() in a breaker) — core.js stays channel-agnostic, matching "no business logic
// should know provider details".
//
// status is the DELIVERY sub-machine only: queued -> processing -> delivered | failed |
// retrying | dead_letter, or queued -> cancelled. read_at/dismissed_at/archived_at are
// independent, additive timestamps layered on top (reading a notification is orthogonal to how
// it was delivered) — every one of the ten states the brief names is still reachable and
// auditable, just not folded into one enum that would have to "un-deliver" a read notification.
import { query } from "../../db.js";
import { enqueueJob } from "../jobs/core.js";
import { registerHandler } from "../jobs/registry.js";
import { renderTemplate } from "../templates/core.js";
import { getChannelProvider } from "./registry.js";
import { getPreferences, resolveChannelEnabled } from "./preferences.js";

const PRIORITY_TO_JOB_PRIORITY = { critical: 1, high: 3, normal: 5, low: 7 };

async function recordEvent(notificationId, event, detail = {}) {
  await query(`insert into notification_events (notification_id, event, detail) values ($1, $2, $3)`, [
    notificationId,
    event,
    JSON.stringify(detail),
  ]);
}

/** Same as recordEvent but for several events on one notification in a single round trip —
 * used for the immediate/queued paths, which always log two events (created + delivered, or
 * created + queued) back to back. Uses clock_timestamp() rather than created_at's own now()
 * default: now()/transaction_timestamp() is frozen for the whole statement, so every row in one
 * multi-row INSERT would otherwise get an IDENTICAL created_at with no other ordering column to
 * break the tie (id is a random uuid) — silently losing the events' real relative order, which
 * the brief requires to stay auditable. clock_timestamp() re-evaluates per row, so ordering by
 * created_at still reflects true chronological order even though both rows land in one round trip. */
async function recordEvents(notificationId, events) {
  const values = [];
  const params = [];
  events.forEach(([event, detail], i) => {
    values.push(`($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}, clock_timestamp())`);
    params.push(notificationId, event, JSON.stringify(detail ?? {}));
  });
  await query(
    `insert into notification_events (notification_id, event, detail, created_at) values ${values.join(", ")}`,
    params
  );
}

/**
 * Core send pipeline. Returns { sent: false, reason } if preference evaluation blocks it
 * (never throws for this — a disabled channel is an expected, common outcome, not an error),
 * or { sent: true, notification } once a row exists (delivered immediately for in-app, queued
 * for everything else).
 *
 * opts: type (required), category, priority ('critical'|'high'|'normal'|'low', default
 * 'normal'), channel (default 'in_app'), title/body (direct content) OR templateName +
 * templateContext (resolved via the Template Engine), data (jsonb payload), correlationId,
 * relatedEntityType/relatedEntityId, scheduledFor (ISO string/Date, null = immediate),
 * expiresAt.
 */
export async function sendNotification(userId, opts = {}) {
  const {
    type,
    category = null,
    priority = "normal",
    channel = "in_app",
    title = null,
    body = null,
    templateName = null,
    templateContext = {},
    data = {},
    correlationId = null,
    relatedEntityType = null,
    relatedEntityId = null,
    scheduledFor = null,
    expiresAt = null,
  } = opts;

  if (!userId) throw new Error("sendNotification: userId is required");
  if (!type) throw new Error("sendNotification: type is required");

  let resolvedTitle = title;
  let resolvedBody = body;
  let templateVersion = null;
  if (templateName) {
    const rendered = renderTemplate(templateName, templateContext);
    resolvedBody = rendered.text;
    templateVersion = rendered.version;
    resolvedTitle = resolvedTitle ?? templateContext.title ?? null;
  }
  if (!resolvedTitle) throw new Error("sendNotification: title is required, directly or via templateContext.title");

  // in_app is the always-on system-of-record channel (every user's schema default is
  // enabled_channels = ['in_app'], and there is deliberately no UI/API yet for disabling it) —
  // not an interruption channel a user opts out of the way they would push/SMS/email, so it
  // skips the preference round-trip entirely. This also preserves notifyUser()'s exact pre-M5
  // behavior (which had no concept of preferences at all) with zero added latency on its hot
  // path. Every other channel goes through full preference evaluation, including per-category
  // inheritance (Slice 3) — e.g. a 'security' category override can force email/SMS through even
  // if the user has those channels off globally.
  if (channel !== "in_app") {
    const preferences = await getPreferences(userId);
    if (!resolveChannelEnabled(preferences, category, channel)) {
      return { sent: false, reason: "channel_disabled" };
    }
  }

  const isImmediate = channel === "in_app" && !scheduledFor;
  const initialStatus = isImmediate ? "delivered" : "queued";

  const r = await query(
    `insert into notifications (user_id, type, category, priority, channel, status, title, body,
       template_name, template_version, correlation_id, data, related_entity_type,
       related_entity_id, scheduled_for, expires_at, delivered_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning *`,
    [
      userId, type, category, priority, channel, initialStatus, resolvedTitle, resolvedBody,
      templateName, templateVersion, correlationId, JSON.stringify(data), relatedEntityType,
      relatedEntityId, scheduledFor, expiresAt, isImmediate ? new Date().toISOString() : null,
    ]
  );
  const notification = r.rows[0];

  if (isImmediate) {
    const provider = getChannelProvider(channel);
    if (provider) await provider.send(notification);
    await recordEvents(notification.id, [
      ["created", { channel, priority, category }],
      ["delivered", { channel }],
    ]);
    return { sent: true, notification };
  }

  const delaySeconds = scheduledFor
    ? Math.max(0, Math.round((new Date(scheduledFor).getTime() - Date.now()) / 1000))
    : 0;
  const { job } = await enqueueJob(
    "notification-deliver",
    { notificationId: notification.id },
    {
      priority: PRIORITY_TO_JOB_PRIORITY[priority] ?? 5,
      delaySeconds: delaySeconds > 0 ? delaySeconds : undefined,
      correlationId: notification.id,
      idempotencyKey: `notification-deliver:${notification.id}`,
    }
  );
  await query(`update notifications set job_id = $2, updated_at = now() where id = $1`, [notification.id, job.id]);
  await recordEvents(notification.id, [
    ["created", { channel, priority, category }],
    ["queued", { jobId: job.id, delaySeconds }],
  ]);

  return { sent: true, notification: { ...notification, job_id: job.id } };
}

/** The 'notification-deliver' job handler — the async half of the pipeline (Queue -> Delivery).
 * Real failures are recorded on the notification row AND rethrown, so the job platform's own
 * failJob() still drives the underlying job's requeue-with-backoff / dead-letter decision;
 * this keeps the notification row and the job row as two independently-truthful records of the
 * same underlying attempt, matching how M3's reconciliation_items stay separate from job rows. */
export async function deliverNotification({ notificationId }) {
  const r = await query(`select * from notifications where id = $1`, [notificationId]);
  const notification = r.rows[0];
  if (!notification) throw new Error(`deliverNotification: notification ${notificationId} not found.`);

  if (notification.status === "cancelled") return { skipped: true, reason: "cancelled" };
  // Backend Hardening (2026-07-24): a lease-expiry requeue (see jobs/core.js's
  // reclaimExpiredLeases) can hand this same notification to a second worker after the first
  // one's provider.send() already succeeded but crashed before this function reached its own
  // 'delivered' write below. Without this guard, deliverNotification would re-run from the top
  // and send a real duplicate the moment a real (non-mock) channel provider replaces the mock.
  if (notification.status === "delivered") return { skipped: true, reason: "already_delivered" };
  // Backend Hardening (2026-07-27, notification exactly-once): the guard above only catches a
  // worker that got ALL the way to 'delivered' before crashing. A worker that crashes in the
  // narrower window AFTER provider.send() succeeds but BEFORE the 'delivered' write just below
  // leaves the row stuck at 'processing' — NOT caught by that guard. claimJobs()'s FOR UPDATE
  // SKIP LOCKED guarantees only one worker ever holds this notification's job lease at a time, so
  // the only way deliverNotification runs again while status is still 'processing' is after that
  // job's full lease expired and reclaimExpiredLeases() presumed the prior worker dead — meaning
  // the prior attempt genuinely might already have reached the provider. Unlike enqueue's own
  // idempotency key (which only dedupes the JOB row, not the underlying send), a real SMS/email/
  // push send is not naturally idempotent — sending it twice is a real, user-visible duplicate.
  // So this deliberately does NOT retry: it dead-letters the row to surface the ambiguity for
  // manual follow-up, rather than either silently risking a duplicate send or silently leaving
  // the row stuck at 'processing' forever with no signal and no further retries.
  if (notification.status === "processing") {
    const message = "Ambiguous delivery state: a prior attempt reached 'processing' but never confirmed completion (worker likely crashed mid-send). Not retried automatically to avoid a duplicate delivery — needs manual verification.";
    await query(`update notifications set status = 'dead_letter', last_error = $2, updated_at = now() where id = $1`, [notification.id, message]);
    await recordEvent(notification.id, "dead_lettered", { reason: "ambiguous_processing_state" });
    return { skipped: true, reason: "ambiguous_processing_state" };
  }
  // A prior invocation already dead-lettered this notification (via the branch above, or via
  // max_attempts exhaustion below) — never a fresh 'processing' claim, so nothing left to do here.
  if (notification.status === "dead_letter") return { skipped: true, reason: "already_dead_lettered" };
  if (notification.expires_at && new Date(notification.expires_at) < new Date()) {
    await query(`update notifications set status = 'failed', last_error = 'expired before delivery', updated_at = now() where id = $1`, [notification.id]);
    await recordEvent(notification.id, "failed", { reason: "expired" });
    return { skipped: true, reason: "expired" };
  }

  const provider = getChannelProvider(notification.channel);
  if (!provider) throw new Error(`deliverNotification: no channel provider registered for '${notification.channel}'.`);

  const nextAttempt = notification.attempts + 1;
  await query(`update notifications set status = 'processing', attempts = $2, updated_at = now() where id = $1`, [notification.id, nextAttempt]);
  await recordEvent(notification.id, "processing", { attempt: nextAttempt });

  try {
    await provider.send(notification);
  } catch (err) {
    const willRetry = nextAttempt < notification.max_attempts;
    const message = String(err?.message ?? err).slice(0, 2000);
    await query(`update notifications set status = $2, last_error = $3, updated_at = now() where id = $1`, [
      notification.id,
      willRetry ? "retrying" : "dead_letter",
      message,
    ]);
    await recordEvent(notification.id, willRetry ? "retry_scheduled" : "dead_lettered", { error: message, attempt: nextAttempt });
    throw err;
  }

  await query(`update notifications set status = 'delivered', delivered_at = now(), updated_at = now() where id = $1`, [notification.id]);
  await recordEvent(notification.id, "delivered", { channel: notification.channel });
  return { delivered: true };
}

registerHandler("notification-deliver", async (payload) => deliverNotification(payload));

// --- User-facing state transitions. Every one is scoped "and user_id = $2" so a caller can
// never act on another user's notification even with a guessed id — no separate RBAC check
// needed at the API layer beyond passing the authenticated user's own id through. ---

export async function markRead(notificationId, userId) {
  const r = await query(
    `update notifications set read_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and read_at is null returning *`,
    [notificationId, userId]
  );
  if (r.rows.length === 0) return null;
  await recordEvent(notificationId, "read", {});
  return r.rows[0];
}

export async function markUnread(notificationId, userId) {
  const r = await query(
    `update notifications set read_at = null, updated_at = now()
     where id = $1 and user_id = $2 and read_at is not null returning *`,
    [notificationId, userId]
  );
  if (r.rows.length === 0) return null;
  await recordEvent(notificationId, "unread", {});
  return r.rows[0];
}

export async function dismissNotification(notificationId, userId) {
  const r = await query(
    `update notifications set dismissed_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and dismissed_at is null returning *`,
    [notificationId, userId]
  );
  if (r.rows.length === 0) return null;
  await recordEvent(notificationId, "dismissed", {});
  return r.rows[0];
}

export async function archiveNotification(notificationId, userId) {
  const r = await query(
    `update notifications set archived_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and archived_at is null returning *`,
    [notificationId, userId]
  );
  if (r.rows.length === 0) return null;
  await recordEvent(notificationId, "archived", {});
  return r.rows[0];
}

/** Only a still-queued (not yet processing/delivered) notification can be cancelled — matches
 * "Cancellation before send" from the brief's Scheduling section literally. */
export async function cancelNotification(notificationId, userId) {
  const r = await query(
    `update notifications set status = 'cancelled', cancelled_at = now(), updated_at = now()
     where id = $1 and user_id = $2 and status = 'queued' returning *`,
    [notificationId, userId]
  );
  if (r.rows.length === 0) return null;
  await recordEvent(notificationId, "cancelled", {});
  return r.rows[0];
}
