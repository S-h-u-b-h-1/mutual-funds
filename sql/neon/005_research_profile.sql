-- MF Pulse — Research profile (signup personalization), Neon.
--
-- This is deliberately a SEPARATE table from investor_profile (003_investor_intelligence.sql),
-- not an extension of it. investor_profile holds sensitive financial-planning data (salary,
-- income, savings, dependents) and its own header comment requires an explicit consent_given_at
-- before writing to it — "unlike the research-only sync tables, writes here should be gated on
-- the user having actively opted in, not just being logged in."
--
-- research_profile holds exactly what the signup/profile-setup flow actually collects today
-- (role, primary research goal, experience level, risk comfort, investment horizon BAND, an AUM
-- BAND with an explicit "prefer not to say" default, and free-text preferred categories) — no
-- exact income/savings figures, no PII beyond what's needed to personalize the research
-- workspace. Same posture as user_preferences (002_auth_and_user_data.sql): logged in is enough,
-- no separate consent gate. If a future mission builds the full sensitive financial-planning
-- flow investor_profile was designed for, that goes through investor_profile's own consent gate
-- — the two should never be conflated.
create table if not exists research_profile (
  user_id uuid primary key references users(id) on delete cascade,
  role text,                     -- 'individual' | 'advisor' | 'analyst' | 'family-office'
  primary_goal text,             -- 'research' | 'compare' | 'portfolio' | 'news'
  experience text,               -- 'beginner' | 'intermediate' | 'advanced' | 'professional'
  risk_comfort text,             -- 'conservative' | 'moderate' | 'aggressive'
  horizon text,                  -- '0-1' | '1-3' | '3-5' | '5+' (band, not a computed year count)
  aum_band text,                 -- 'not-specified' | 'under-5l' | '5l-25l' | '25l-1cr' | '1cr+'
  preferred_categories text,     -- free text, e.g. "Large cap, flexi cap, ELSS"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
