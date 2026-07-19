# Data Inventory

Data Platform Mission 1. Every table across both live databases, verified directly (not
reasoned from schema files, which have been shown to drift from reality this session — see
`docs/METADATA_PROVENANCE_SCHEMA.md`'s correction). Two databases, two purposes:

- **Supabase** (`fffxwcpptpyjuifknayj`, "MF-Pulse") — the market-data warehouse. Read live by the
  frontend via PostgREST (`frontend/app/lib/supabase.js`'s `sb()`), refreshed by
  `production-refresh.yml` and `flow_monthly.yml`.
- **Neon** (`super-surf-43536488`, project `MFPulse`, branch `production`) — auth, user data,
  portfolio, and the provenance/factsheet layer. Read via `frontend/app/lib/db.js`'s `query()`.

Row counts captured 2026-07-17. Re-run the queries at the bottom of this doc to refresh.

---

## Supabase — market data warehouse

| Table | Rows | Purpose | Source | Update frequency | Owner (writer) |
|---|---:|---|---|---|---|
| `dim_scheme` | 14,224 | Scheme dimension: code, name, AMC, category, asset class | AMFI NAVAll.txt | Daily (twice) | `scripts/cloud_pipeline.py` |
| `fact_nav_daily` | 101,284 | Daily NAV fact table, accumulates history | AMFI NAVAll.txt | Daily (twice) | `scripts/cloud_pipeline.py` |
| `fact_flow_monthly` | 234 | Real monthly net flow per fund category (pivoted from sample this session) | AMFI Monthly Report (MCR) | Weekly (self-healing, rechecks 3mo) | `scripts/ingest_flows.py` |
| `flow_signals` | 5 | Z-score flow anomalies, derived from `fact_flow_monthly` | Computed (`ingestion/spike_detect.py`) | Same cadence as flows | `scripts/ingest_flows.py` |
| `fact_pipeline_runs` | 46 | Append-only ingestion audit log | Internal | Every pipeline run | `scripts/cloud_pipeline.py` and others |
| `fact_system_health` | 44 | Freshness/staleness snapshots | Internal | Every pipeline run | `scripts/cloud_pipeline.py` |
| `news_sources` | 11 | RSS/regulatory feed registry | Hardcoded in `scripts/ingest_news.py` | Static | — |
| `news_articles` | 6,062 | Ingested financial news, deduped by URL | ET/Mint/CNBC-TV18/NDTV/BusinessLine RSS, RBI/SEBI press releases | Every 3h | `scripts/ingest_news.py` |
| `news_entities` | 61 | Entity registry (AMC/category names) for news linking | Derived from `dim_scheme` | On news ingest | `scripts/ingest_news.py` |
| `news_market_links` | 2,458 | Article-to-entity relevance links | Computed (`ingestion/market_reaction.py`) | On news ingest | `scripts/ingest_news.py` |
| `news_sentiment` | 30,163 | Per-article/entity sentiment scores | Computed | On news ingest | `scripts/ingest_news.py` |
| `news_ingestion_runs` | 2,070 | Append-only news pipeline audit log | Internal | Every run | `scripts/ingest_news.py` |
| `factsheet_archive` | 152 | Archived factsheet PDF metadata (SBI only) | AMC factsheet PDF | Manual/occasional | `scripts/ingest_factsheets.py` |
| `user_events` | 2,895 | Product analytics (search/view/watchlist/etc.) | Client-side tracking | Real-time | Frontend API routes |
| `alerts` | 0 | Alert engine backend — built, never triggered | Internal | Event-driven | `frontend/app/api/v1/internal/alerts/run` |
| `advisor_leads` | 0 | Suasion Securities engagement leads | User-submitted | Event-driven | Frontend forms |
| `fund_history_events` | 0 | Manager/factsheet-change detection log — designed, never populated (needs 2+ factsheet snapshots per scheme; only 1 exists) | Derived | Would be per factsheet re-ingest | Not yet wired to any writer |

### Confirmed orphaned (zero code references anywhere in the repo)
`profiles`, `workspaces`, `saved_research`, `saved_comparisons`, `watchlist_items`, `notifications`
— all 0 rows, all RLS-enabled, all pre-date the Neon migration for user data (superseded by
`users`/`user_watchlist`/`user_research_notes`/etc. on Neon). Safe drop candidates once confirmed
with the user; not dropped here (destructive, out of scope for an inventory pass).

---

## Neon — auth, user data, portfolio, provenance

### Auth (NextAuth.js)
| Table | Rows | Note |
|---|---:|---|
| `users` | 9 | Includes real registrations + disposable test accounts from this session's verification passes — not pruned (see note below) |
| `accounts` | 0 | OAuth provider links — expected empty, no OAuth provider configured, credentials-only auth |
| `sessions` | 0 | Expected empty if the app uses JWT session strategy (cookie-based, not DB-backed) rather than database sessions — **not independently confirmed this pass**, flagged as worth a quick config check rather than asserted |
| `verification_tokens` | 0 | Password reset / email verification tokens, expected mostly-empty (short-lived) |

### User data
| Table | Rows | Purpose |
|---|---:|---|
| `investor_profile` | 0 | Designed for signup profile (role/goal/risk/horizon) in `sql/neon/003_investor_intelligence.sql` — **confirmed orphaned**: zero references anywhere in application code. Superseded by `research_profile` below (later migration, `005_research_profile.sql`), which has the same fields and is what `/api/v1/sync/research-profile` actually reads/writes. Same pattern as the 6 orphaned Supabase tables above — an earlier design superseded without the old table being dropped. |
| `research_profile` | 5 | **The real signup/research profile table** — role, primary_goal, experience, risk_comfort, horizon, aum_band, preferred_categories. Confirmed live: this session's own test registration (role "Analyst/researcher") is very likely one of these 5 rows. |
| `user_watchlist` | 0 | Cloud-synced watchlist |
| `user_collections` / `user_collection_items` | 0 / 0 | Saved fund collections |
| `user_research_history` | 28 | Research activity log |
| `user_research_notes` | 0 | User notes on funds |
| `user_saved_comparisons` | 0 | Saved fund comparisons |
| `user_preferences` / `user_notification_settings` / `user_devices` | 0 / 0 / 0 | Account settings |
| `audit_log` | 37 | Append-only auth/account audit trail |

### Portfolio
| Table | Rows | Purpose | Note |
|---|---:|---|---|
| `portfolio` | 3 | Per-user cached summary (total value, holdings count) | |
| `portfolio_holdings` | 14 | Current holdings | |
| `portfolio_transactions` | 0 | Transaction ledger (enables real XIRR) | 0 despite this session's testing having inserted real rows — consistent with the disposable-account cleanup routine used throughout, not a bug |
| `portfolio_snapshots` | 2 | Daily allocation snapshots | |
| `portfolio_metrics` / `portfolio_reports` | 164 / 164 | Cached health-report computations, one row per `/intelligence` call | High count reflects repeated dev/test API calls this session, not 164 distinct real analyses |
| `portfolio_events` | 1,476 | Exposure-theme events from health reports | |
| `portfolio_uploads` | 16 | CAS upload audit log | |
| `portfolio_sips` | 0 | SIP schedule tracking — schema exists, never populated (no SIP data source, confirmed this session) |
| `portfolio_corporate_actions` | 0 | Dividend/split/merger tracking — schema exists, never populated |

### Provenance & factsheet pipeline (Mission 4 wired 2026-07-17, extended 2026-07-19 x2)
| Table | Rows | Purpose |
|---|---:|---|
| `source_documents` | 169 | Logical document identity (AMC + type + URL) — 41 SBI + 53 HDFC + 75 ICICI funds |
| `source_document_versions` | 169 | One row per actual fetch, checksum-deduped |
| `source_extractions` | 6,196 | Per-field extracted value + provenance — SBI (152 schemes) + HDFC (241) + ICICI (580) |
| `field_validation_results` | grows each backfill (idempotency guard fixed 2026-07-19, see below) | Per-extraction validation checks |
| `metadata_quarantine` | 0 | Failed-validation holding area — clean so far, not unused |
| `parser_versions` | 1 | Row is generic (`parser_name`/`version_label`), not per-AMC — each AMC registers under its own `parser_name` value in practice |
| `fund_metadata_values` / `fund_metadata_history` | 6,196 / 6,196 (views) | Derived from `source_extractions`, confirmed returning real rows for all three AMCs |
| `fact_factsheet_runs` | 0 | Factsheet pipeline audit log — schema exists, still never written to (unchanged, real, still-open gap) |

Mission 5 (2026-07-19) added a real second AMC (HDFC, 241 schemes) to the same pipeline — see
`docs/FACTSHEET_PIPELINE.md` for the full story, including a duplicate half-built factsheet
framework found and consolidated into rather than built around. `field_validation_results` grew
to 3,235 (not 2,455) because re-running the pipeline twice in the same session against unchanged
SBI data exposed a real gap: that table had no idempotency guard, so identical validation checks
kept re-inserting on every run. Fixed with a `NOT EXISTS` guard in `provenance.py`; the 780 extra
rows already in production from before the fix were not retroactively cleaned up (harmless
audit-log duplication, not data corruption — `fund_metadata_values`/`history` are unaffected since
they read from `source_extractions`, which was never the affected table).

Coverage: 393 of ~14,224 schemes (≈2.76%), two of the many AMCs on the platform.
`scripts/ingest_factsheets.py` remains unscheduled (confirmed via grep, no GH Actions workflow
calls it) — unchanged from Mission 4's disclosure.

### Other
| Table | Rows | Purpose |
|---|---:|---|
| `market_quotes` | 19 | Appears to be a small, separate real-time-quote experiment — not referenced by any current page found this pass; needs a follow-up check before calling it dead or reviving it |
| `market_quote_runs` | 1 | Audit log for the above |

---

## Cross-database consistency (dual-write drift, real finding)

`fact_nav_daily`: **92,670 rows on Neon vs. 101,284 on Supabase** — an 8,614-row gap.
`factsheet_archive`: **8 rows on Neon vs. 152 on Supabase** — Neon's copy is a small subset.
`dim_scheme`: 14,224 on both — consistent.

Neither gap is investigated further in this pass (Mission 1 is inventory, not remediation) —
flagged here as a concrete, measured fact for Mission 9 (Data Quality Engine) to act on, not
asserted as either "broken" or "fine" without checking whether dual-write coverage for these two
tables was ever supposed to be complete.

## Reproduction

```sql
-- Supabase: mcp__...__list_tables (includes row counts directly)
-- Neon: mcp__...__run_sql against br-raspy-glitter-atut1ur7 with one UNION ALL SELECT count(*) per table
```
