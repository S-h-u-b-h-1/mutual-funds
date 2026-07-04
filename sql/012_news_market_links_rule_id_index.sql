-- Phase 11 (terminal sprint) — getSimilarPastArticles() (frontend/app/lib/news.js, News
-- Intelligence 2.0's "recent similar events") filters news_market_links by rule_id with no
-- supporting index. Added while the table is still empty/small, before it matters for real
-- query latency once ingestion resumes. Applied live via Supabase MCP on 2026-07-04.
create index if not exists ix_news_market_links_rule_id on news_market_links (rule_id, created_at desc);
