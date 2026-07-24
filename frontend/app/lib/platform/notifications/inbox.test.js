// Notification Read APIs tests — real Neon. Uses channel: 'in_app' throughout (synchronous
// delivery, no job queue / advisory-lock machinery needed — see core.js's isImmediate logic),
// unlike core.test.js's async-channel tests, since this module never needs to drive a queued
// delivery to completion.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { sendNotification, markRead, dismissNotification, archiveNotification } from "./core.js";
import { listNotifications, getUnreadCount, getNotificationWithTimeline } from "./inbox.js";
import { createTestUser, deleteTestUser } from "../../invest/testHelpers.js";

const RUN = crypto.randomBytes(3).toString("hex");
const T = (name) => `test-${RUN}-${name}`;

async function send(userId, overrides = {}) {
  const result = await sendNotification(userId, {
    type: T("type"), title: "Test notification", channel: "in_app",
    ...overrides,
  });
  return result.notification;
}

describe("listNotifications", () => {
  let userId;
  beforeAll(async () => { userId = await createTestUser(`inbox-list-${RUN}`); }, 30000);
  afterAll(async () => { await deleteTestUser(userId); });

  it("returns an empty inbox for a user with no notifications", async () => {
    const freshUserId = await createTestUser(`inbox-empty-${RUN}`);
    try {
      const result = await listNotifications(freshUserId);
      expect(result.notifications).toEqual([]);
      expect(result.total).toBe(0);
    } finally {
      await deleteTestUser(freshUserId);
    }
  });

  it("lists real notifications newest-first, with an accurate total", async () => {
    await send(userId, { title: "First" });
    await send(userId, { title: "Second" });
    const result = await listNotifications(userId);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.notifications.length).toBeGreaterThanOrEqual(2);
    const idx = result.notifications.map((n) => n.title);
    expect(idx.indexOf("Second")).toBeLessThan(idx.indexOf("First")); // newest first
  });

  it("filters by category and by type", async () => {
    const category = T("category-filter");
    const type = T("type-filter");
    await send(userId, { category, type, title: "Categorized" });

    const byCategory = await listNotifications(userId, { category });
    expect(byCategory.notifications.every((n) => n.category === category)).toBe(true);
    expect(byCategory.total).toBeGreaterThanOrEqual(1);

    const byType = await listNotifications(userId, { type });
    expect(byType.notifications.every((n) => n.type === type)).toBe(true);
  });

  it("unreadOnly excludes notifications that have been marked read", async () => {
    const notification = await send(userId, { title: "Will be read" });
    await markRead(notification.id, userId);
    const result = await listNotifications(userId, { unreadOnly: true });
    expect(result.notifications.some((n) => n.id === notification.id)).toBe(false);
  });

  it("excludes dismissed and archived by default; includeDismissed/includeArchived opt back in", async () => {
    const dismissed = await send(userId, { title: "Will be dismissed" });
    const archived = await send(userId, { title: "Will be archived" });
    await dismissNotification(dismissed.id, userId);
    await archiveNotification(archived.id, userId);

    const defaultView = await listNotifications(userId, { limit: 100 });
    expect(defaultView.notifications.some((n) => n.id === dismissed.id)).toBe(false);
    expect(defaultView.notifications.some((n) => n.id === archived.id)).toBe(false);

    const withDismissed = await listNotifications(userId, { includeDismissed: true, limit: 100 });
    expect(withDismissed.notifications.some((n) => n.id === dismissed.id)).toBe(true);

    const withArchived = await listNotifications(userId, { includeArchived: true, limit: 100 });
    expect(withArchived.notifications.some((n) => n.id === archived.id)).toBe(true);
  });

  it("paginates with limit/offset while total reflects the full matching count", async () => {
    const category = T("pagination");
    for (let i = 0; i < 5; i++) await send(userId, { category, title: `Page item ${i}` });

    const page1 = await listNotifications(userId, { category, limit: 2, offset: 0 });
    const page2 = await listNotifications(userId, { category, limit: 2, offset: 2 });
    expect(page1.notifications.length).toBe(2);
    expect(page2.notifications.length).toBe(2);
    expect(page1.total).toBe(5);
    expect(page2.total).toBe(5);
    expect(page1.notifications[0].id).not.toBe(page2.notifications[0].id);
  });

  it("clamps an out-of-range limit rather than erroring", async () => {
    const result = await listNotifications(userId, { limit: 99999 });
    expect(result.limit).toBe(100); // MAX_LIMIT
  });
});

describe("getUnreadCount", () => {
  let userId;
  beforeAll(async () => { userId = await createTestUser(`inbox-count-${RUN}`); }, 30000);
  afterAll(async () => { await deleteTestUser(userId); });

  it("counts only unread, non-dismissed, non-archived notifications, and updates after marking read", async () => {
    const before = await getUnreadCount(userId);
    const notification = await send(userId, { title: "Countable" });
    const afterSend = await getUnreadCount(userId);
    expect(afterSend).toBe(before + 1);

    await markRead(notification.id, userId);
    const afterRead = await getUnreadCount(userId);
    expect(afterRead).toBe(before);
  });

  it("scopes to a category when given one", async () => {
    const category = T("count-category");
    await send(userId, { category, title: "Scoped" });
    const scoped = await getUnreadCount(userId, { category });
    expect(scoped).toBeGreaterThanOrEqual(1);
  });
});

describe("getNotificationWithTimeline", () => {
  let userId, otherUserId;
  beforeAll(async () => {
    userId = await createTestUser(`inbox-timeline-${RUN}`);
    otherUserId = await createTestUser(`inbox-timeline-other-${RUN}`);
  }, 30000);
  afterAll(async () => {
    await deleteTestUser(userId);
    await deleteTestUser(otherUserId);
  });

  it("returns the notification plus its real created+delivered timeline", async () => {
    const notification = await send(userId, { title: "Timelined" });
    const result = await getNotificationWithTimeline(userId, notification.id);
    expect(result.notification.id).toBe(notification.id);
    expect(result.timeline.map((e) => e.event)).toEqual(["created", "delivered"]);
  });

  it("returns null for a nonexistent notification, and for another user's real one", async () => {
    expect(await getNotificationWithTimeline(userId, crypto.randomUUID())).toBeNull();
    const notification = await send(userId, { title: "Not yours" });
    expect(await getNotificationWithTimeline(otherUserId, notification.id)).toBeNull();
  });
});
