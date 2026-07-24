# Notification Read APIs

Backend contract slice, priority-list item 3/5 (2026-07-24 brief) — the same scope as the
originally-planned M5 Slice 4 ("Notification Timeline"), reframed under the newer priority
brief. Before this slice, the Notification Platform (M5 sub-step 1) had a complete WRITE side —
`sendNotification()`, 5 state transitions (read/unread/dismiss/archive/cancel) — and **no way to
read a user's own notifications at all**. No list, no unread count, no per-notification timeline.

Code: [frontend/app/lib/platform/notifications/inbox.js](../frontend/app/lib/platform/notifications/inbox.js)
· Schema: [sql/neon/020_notification_read_apis.sql](../sql/neon/020_notification_read_apis.sql)

## 1. Pure reads only

`inbox.js` adds exactly three functions, all read-only:

- **`listNotifications(userId, {status, category, type, unreadOnly, includeArchived, includeDismissed, limit, offset})`**
  — the inbox. Excludes dismissed/archived by default (that's what those actions are *for* —
  matching how a real inbox works), with explicit flags to include them for a separate
  "archived" view. Plain `limit`/`offset` pagination (`limit` clamped to 1–100), matching this
  codebase's existing convention rather than introducing cursor-based pagination nothing else
  here uses.
- **`getUnreadCount(userId, {category})`** — a separate, cheap endpoint from the full list (a
  nav badge polling this shouldn't have to fetch and discard a full page of notifications every
  time). Uses the exact same "active inbox" definition as the list's default (unread + not
  dismissed + not archived), so a badge count and the list underneath it can never disagree.
- **`getNotificationWithTimeline(userId, notificationId)`** — one notification plus its real
  `notification_events` history, same shape and reasoning as
  `orderService.getOrderWithTimeline()`: the platform's own delivery/read/dismiss/archive
  history, not just the current row state.

Every existing WRITE function (`markRead`, `markUnread`, `dismissNotification`,
`archiveNotification`) already existed in `core.js` since M5 sub-step 1 and was already scoped
`and user_id = $2` — this slice's only job for those was giving them routes, which they never had.

**Deliberately not built**: a bulk "mark all read" action. The priority brief's checklist item
was "mark read" (singular, matching the function that already existed) — a bulk variant is a
reasonable future inbox convenience but wasn't asked for, so it wasn't added. Also not exposed:
a route for the existing `cancelNotification()` — that's a scheduling-cancel action (Slice 5
territory), not a read-API concern.

## 2. Routes

| Method | Path | |
|---|---|---|
| GET | `/api/v1/invest/notifications` | Inbox — filters via query params (`status`, `category`, `type`, `unreadOnly`, `includeArchived`, `includeDismissed`, `limit`, `offset`) |
| GET | `/api/v1/invest/notifications/unread-count` | Optional `?category=` |
| GET | `/api/v1/invest/notifications/:id` | One notification + its timeline |
| POST | `/api/v1/invest/notifications/:id/read` | Wraps the existing `markRead` |
| POST | `/api/v1/invest/notifications/:id/unread` | Wraps the existing `markUnread` |
| POST | `/api/v1/invest/notifications/:id/dismiss` | Wraps the existing `dismissNotification` |
| POST | `/api/v1/invest/notifications/:id/archive` | Wraps the existing `archiveNotification` |

## 3. Index

One targeted, additive index: `(user_id, created_at desc) where dismissed_at is null and
archived_at is null`. Migration 016's existing indexes are scoped to a specific `status` or to
`unread-only` — neither matches the general "active inbox, any read state" shape
`listNotifications()`'s default query actually needs, so this one serves it directly rather than
relying on a partial index match Postgres would have to fall back past.

## 4. Verification record

- 12 new tests in `inbox.test.js`, real Neon, using `channel: 'in_app'` throughout (synchronous
  delivery — no job-queue/advisory-lock machinery needed, unlike `core.test.js`'s async-channel
  tests). Covers: empty inbox, newest-first ordering, category/type filtering, unread-only
  exclusion after marking read, dismissed/archived exclusion and opt-in inclusion, pagination
  with an accurate total across pages, limit clamping, unread-count accuracy and category
  scoping, timeline event ordering, and cross-user isolation (both a nonexistent id and another
  user's real notification correctly return `null`).
- 15 route tests (mocked, matching this codebase's established fast-unit-test convention for
  every other route file) across the 7 new route files.
- Migration applied directly to production Neon and verified.
