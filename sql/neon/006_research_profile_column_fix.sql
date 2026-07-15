-- MF Pulse — Corrective migration for research_profile (Completion Sprint Phase 1).
--
-- 005_research_profile.sql was applied to production on 2026-07-15 using column names
-- reconstructed from a conversation summary instead of this file's actual content: the applied
-- SQL used goal/experience_level/risk_comfort_label/horizon_band/free_text_categories, while this
-- repository's 005_research_profile.sql — and the code that actually reads/writes the table
-- (frontend/app/api/v1/sync/research-profile/route.js, docs/PROFILE_DATA_CONTRACT.md) — has
-- always used primary_goal/experience/risk_comfort/horizon/preferred_categories. The mismatch
-- meant the research-profile save/load endpoint 500'd on every call from the moment 005 was
-- applied until this fix landed a few minutes later, before any real user hit it.
--
-- research_profile had 0 rows at the time both mistakes and this correction were applied (it had
-- only just been created), so a plain rename is safe and lossless. Idempotent via
-- information_schema guards, so re-running this against a database that already has the correct
-- column names (e.g. a fresh environment created from 005_research_profile.sql directly) is a
-- no-op rather than an error.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'research_profile' and column_name = 'goal') then
    alter table research_profile rename column goal to primary_goal;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'research_profile' and column_name = 'experience_level') then
    alter table research_profile rename column experience_level to experience;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'research_profile' and column_name = 'risk_comfort_label') then
    alter table research_profile rename column risk_comfort_label to risk_comfort;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'research_profile' and column_name = 'horizon_band') then
    alter table research_profile rename column horizon_band to horizon;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'research_profile' and column_name = 'free_text_categories') then
    alter table research_profile rename column free_text_categories to preferred_categories;
  end if;
end $$;
