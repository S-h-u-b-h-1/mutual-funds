-- Journey 5 Notification Read APIs — priority-list item 3/5 (= M5 Slice 4 Timeline, reframed
-- under the 2026-07-24 backend contract brief). Additive only: one targeted index.
--
-- Migration 016's existing indexes (idx_notifications_user_status, idx_notifications_user_unread)
-- are scoped to a specific status or unread-only, not the general "active inbox" shape this
-- slice's listNotifications() actually queries by default (excludes dismissed/archived,
-- ordered newest-first, any read state) — this index serves that query directly.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/020_notification_read_apis.sql

create index if not exists idx_notifications_user_active on notifications (user_id, created_at desc) where dismissed_at is null and archived_at is null;
