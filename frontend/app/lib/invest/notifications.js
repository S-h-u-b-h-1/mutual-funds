// Thin, deliberately backward-compatible wrapper around the Phase 5 M5 Notification Platform's
// sendNotification(). This function's signature is UNCHANGED from the Journey 2 minimal writer
// it replaces (see git history) — every existing call site (identityService, documentService,
// orderService, portfolioService, complianceService, and this file's own callers) needed zero
// changes when M5 landed, exactly the "no business logic should need modification" goal the
// Phase 5 brief states for future providers, honored here for the notification engine's own
// very first, pre-existing caller too.
import { sendNotification } from "../platform/notifications/core.js";
import { emitEvent } from "../platform/events/core.js";

export async function notifyUser(userId, type, { title, body = null, relatedEntityType = null, relatedEntityId = null } = {}) {
  await sendNotification(userId, {
    type,
    title,
    body,
    relatedEntityType,
    relatedEntityId,
    channel: "in_app",
    category: relatedEntityType,
  });
  await emitEvent("NotificationSent", { userId, type, title }, { correlationId: userId, source: "notifications" });
}
