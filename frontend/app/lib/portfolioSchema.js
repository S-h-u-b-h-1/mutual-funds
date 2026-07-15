// Portfolio Foundation (Personal Operating System sprint, Phase 6 architecture; implemented for
// real in the Investor Intelligence Engine, Mission B). Every import producer (GrowwParser,
// CoinParser, KuveraParser, EtMoneyParser, ManualParser — see app/lib/portfolioImport/) writes
// the SAME shape, and every consumer (the analytics/overlap/risk engines) reads the same shape —
// instead of each import path inventing its own fields.
//
// Storage: `portfolio_holdings` (sql/neon/002_auth_and_user_data.sql), keyed by
// (user_id, scheme_code, source, folio_number), so multiple import sources can coexist without
// overwriting each other. Only the fields a source actually reports are persisted there
// (schemeCode, units, avgCost, source, folioNumber, importedAt) — everything else on a Holding
// (name, AMC, category, benchmark, expense ratio, current NAV, current value, weight) is enriched
// at read time from the SAME real NAV/metadata every other page uses (funds.js / metadata.js), so
// a portfolio can never show a stale or double-counted figure independent of the rest of the
// platform.

/**
 * @typedef {Object} Holding
 * @property {string} schemeCode        - AMFI scheme code (the same "code" used everywhere else in the app)
 * @property {string} schemeName        - As resolved against funds.js, not the raw source string
 * @property {string|null} isin         - ISIN used to resolve schemeCode, if the source provided one
 * @property {number} units             - Units held, as reported by the source (never estimated)
 * @property {number|null} avgCost      - Average cost per unit, if the source provides it (or derivable from purchaseValue/units)
 * @property {number|null} purchaseValue - Total invested amount for this holding
 * @property {number|null} currentValue - units * current NAV (computed, never a source-reported figure)
 * @property {string|null} purchaseDate - ISO date, if the source provides one
 * @property {string|null} amc
 * @property {string|null} category
 * @property {string|null} benchmark
 * @property {number|null} expenseRatio - From metadata.js's factsheet archive; null when not yet available from source (partial coverage today, same honesty convention as the rest of the app)
 * @property {number|null} nav          - Current NAV used for currentValue
 * @property {number|null} weight       - This holding's % of the portfolio's total current value (computed across the full batch, not per-row)
 * @property {string} source            - One of PORTFOLIO_SOURCES' keys
 * @property {string|null} folioNumber  - AMC folio number, if the source provides it
 * @property {string} importedAt        - ISO timestamp of when this holding was recorded
 */

export const PORTFOLIO_SOURCES = {
  groww: "Groww CSV import",
  coin: "Zerodha Coin CSV import",
  kuvera: "Kuvera CSV import",
  etmoney: "ET Money CSV import",
  manual: "Manually entered",
  // Institutional Portfolio Import Engine mission: CAS (CAMS/KFin/MF Central) PDF upload. Three
  // keys — not one generic "cas" — because that's what the already-built upload UI
  // (components/PortfolioWorkspace.jsx's STATEMENT_TYPES) sends as `source`; the CAS pipeline
  // itself is provider-agnostic (see portfolioImport/casParser.js) and normalizes all three to a
  // single `source: 'cas'` when writing to portfolio_holdings/portfolio_transactions — the
  // specific registrar is preserved separately via portfolio_uploads.provider (auto-detected from
  // the PDF text, cross-checked against whichever of these three the user picked).
  cams_cas_pdf: "CAMS CAS PDF import",
  kfin_cas_pdf: "KFIN CAS PDF import",
  mfcentral_summary: "MF Central Portfolio Summary PDF import",
};
