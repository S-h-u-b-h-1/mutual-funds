-- MF Pulse — Backend Hardening Phase 3, M6/M7 (database quality: index cleanup).
-- Backs docs/BACKEND_TECHNICAL_DEBT.md M6/M7. Proven, not assumed:
--
-- M6 (drop 7 redundant indexes): found by a catalog query (pg_index) comparing every table's own
-- indexes against each other for a shared predicate + one column list being a prefix of (or equal
-- to) another's — the textbook "Postgres can already serve this via the wider index" pattern.
-- Confirmed none of the 7 are themselves unique (so dropping them removes no constraint) and
-- grepped the codebase for each index name by string — the only hits are each index's own
-- `create index` statement in its origin migration, nothing references an index BY NAME anywhere
-- (expected: index usage is planner-driven, not application-referenced). Each dropped index is
-- either an exact column-list duplicate of a wider unique constraint's index (portfolio_snapshots)
-- or a plain single-column index that's already a strict prefix of a wider unique constraint's
-- index on the same table (the other 6) — in both cases the wider index already serves every query
-- the narrower one could.
--
-- M7 (add 4 new composite indexes): the two real hot-path query shapes the audit named, confirmed
-- against the actual call sites, not assumed:
--   - redemptionService.js's eligibility check: `where user_id = $1 and scheme_code = $2` against
--     both investment_orders and portfolio_transactions (see redemptionService.js lines ~62-84).
--   - orderService.js's listOrders/listSipMandates: `where user_id = $1 order by created_at desc`
--     against both investment_orders and sip_mandates (lines ~277, ~402), with no existing index
--     leading with created_at on either table.
-- EXPLAIN ANALYZE against production today shows plain Seq Scans either way (investment_orders and
-- sip_mandates both have 0 rows, portfolio_transactions has 6 — Postgres correctly prefers a seq
-- scan over any index at this size regardless of what's available), so there is NO currently
-- measurable performance difference from adding these — this is cheap, structural insurance
-- against the exact bottleneck the audit described, added now while each of these tables is
-- ~empty (an index build here costs nothing) rather than later under real production write volume
-- (where the same build would need CREATE INDEX CONCURRENTLY and real planning).
--
-- Run: psql "$DATABASE_URL" -f sql/neon/026_index_cleanup.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) — see docs/TEST_DATABASE_AND_CI.md's schema-drift note.

-- M6: drop redundant indexes (each is a strict prefix of, or identical to, a surviving unique
-- constraint's index on the same table with the same partial-predicate, per the catalog query in
-- docs/BACKEND_TECHNICAL_DEBT.md M6's resolution note).
drop index if exists idx_snapshots_user_date;              -- portfolio_snapshots: dup of portfolio_snapshots_user_id_snapshot_date_key
drop index if exists idx_compliance_items_app;              -- compliance_items: prefix of compliance_items_application_id_item_key_key
drop index if exists idx_holdings_user;                     -- portfolio_holdings: prefix of portfolio_holdings_user_id_scheme_code_source_folio_number_key
drop index if exists idx_collection_items_collection;        -- user_collection_items: prefix of user_collection_items_collection_id_scheme_code_key
drop index if exists idx_collections_user;                  -- user_collections: prefix of user_collections_user_id_name_key
drop index if exists idx_notification_settings_user;        -- user_notification_settings: prefix of user_notification_settings_user_id_alert_type_channel_key
drop index if exists idx_watchlist_user;                    -- user_watchlist: prefix of user_watchlist_user_id_scheme_code_key

-- M7: add the missing composite indexes the two real hot-path query shapes above need.
create index if not exists idx_orders_user_scheme on investment_orders (user_id, scheme_code);
create index if not exists idx_transactions_user_scheme on portfolio_transactions (user_id, scheme_code);
create index if not exists idx_orders_user_created on investment_orders (user_id, created_at desc);
create index if not exists idx_sip_mandates_user_created on sip_mandates (user_id, created_at desc);
