// Portfolio Foundation (Personal Operating System sprint, Phase 6) — ARCHITECTURE ONLY.
// No UI reads or writes this yet, and nothing here talks to a database. This file exists so
// that when CAS/broker-import parsing is actually built, every future producer (a CAS PDF
// parser, a Groww/Zerodha/Kuvera CSV importer, a manual-entry form) writes the SAME shape, and
// every future consumer (portfolio overlap, portfolio-aware news, a risk dashboard) reads the
// same shape — instead of each import path inventing its own fields.
//
// Storage today, if this were wired up: localStorage under "mfp_portfolio" (same convention as
// mfp_watchlist/mfp_research_notes), one Holding[] per portfolio. Storage tomorrow, once login
// exists: a `portfolio_holdings` table keyed by (user_id, scheme_code, source), so multiple
// import sources can coexist without overwriting each other — see the SQL sketch at the bottom.
//
// A Holding never stores a derived number (current value, return, weight) — those are computed
// at read time from the SAME real NAV data every other page uses (funds.json / fact_nav_daily),
// so a portfolio can never show a stale or double-counted figure independent of the rest of the
// platform.

/**
 * @typedef {Object} Holding
 * @property {string} schemeCode        - AMFI scheme code (the same "code" used everywhere else in the app)
 * @property {number} units             - Units held, as reported by the source (never estimated)
 * @property {number|null} avgCost      - Average cost per unit, if the source provides it (CAS/broker exports do; manual entry may not)
 * @property {string} source            - One of PORTFOLIO_SOURCES below
 * @property {string} importedAt        - ISO timestamp of when this holding was recorded
 * @property {string|null} folioNumber  - AMC folio number, if the source provides it (CAS does)
 */

export const PORTFOLIO_SOURCES = {
  cas: "Consolidated Account Statement (CAMS/KFintech PDF)",
  groww: "Groww import",
  zerodha: "Zerodha Coin import",
  kuvera: "Kuvera import",
  manual: "Manually entered",
};

// Deliberately NOT implemented: parsing any of the above formats, a localStorage read/write
// pair, or any UI. That is real, separate work — this file only fixes the shape everything else
// will be built against, per this sprint's explicit "architecture only, no UI" scope.

/*
Future DB shape (NOT applied — no migration has been run for this):

create table if not exists portfolio_holdings (
  id bigint generated always as identity primary key,
  user_id uuid not null,               -- once accounts exist
  scheme_code text not null,
  units numeric not null,
  avg_cost numeric,
  source text not null,                -- one of PORTFOLIO_SOURCES' keys
  folio_number text,
  imported_at timestamptz not null default now(),
  unique (user_id, scheme_code, source, folio_number)
);
-- RLS: a user only ever reads/writes their own rows (auth.uid() = user_id) — never public-read,
-- unlike every other table in this schema. Portfolio data is the one dataset here that is never
-- aggregate/anonymous.
*/
