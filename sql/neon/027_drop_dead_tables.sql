-- MF Pulse — Backend Hardening Phase 3, L5 (database quality: drop dead tables).
-- Backs docs/BACKEND_TECHNICAL_DEBT.md L5. Both tables confirmed dead by direct evidence, not
-- assumption, immediately before writing this file:
--   - 0 rows in production (select count(*) from each).
--   - 0 application code references anywhere in the repo (grepped `\binvestor_profile\b` and
--     `\bportfolio_sips\b` — the only hits are each table's own `create table`/`create index`
--     statement in its origin migration, plus comments in 005/007's headers that explicitly
--     explain investor_profile is a DIFFERENT table from the live, still-used `investor_profiles`
--     (plural) and `research_profile` tables — never confused with those in this file).
--   - 0 foreign keys anywhere reference either table (queried pg_constraint's confrelid).
-- investor_profile (singular, migration 003) was superseded by investor_profiles (plural,
-- migration 002) 10 days before 003 ever shipped — a naming collision from the original design,
-- never actually wired to any route. portfolio_sips (migration 002) was superseded before ever
-- being wired up; SIP mandates live in sip_mandates (migration 010) instead.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/027_drop_dead_tables.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) — see docs/TEST_DATABASE_AND_CI.md's schema-drift note.

drop table if exists investor_profile;
drop table if exists portfolio_sips;
