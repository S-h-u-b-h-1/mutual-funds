// Market Impact Intelligence (Phase 1-7 of the Impact sprint) — server-only. Reads the same
// bundles fund/category/AMC pages already trust (funds.js, metadata.json), so every fund/AMC/
// category surfaced here is real and every route it links to is one that actually resolves.
// Never imported from a "use client" component — mirrors funds.js's own server-only contract.
import { allFunds, benchmarkSlug } from "./funds";
import { fundHealth } from "./fundHealth";
import metaData from "../data/metadata.json";

// Mirrors ingestion/market_reaction.py's RULE_META exactly — that Python file is the source of
// truth (this file has no runtime link to it). Keep both in sync by hand if a rule changes.
export const RULE_META = {
  rbi_rate_action: { theme: "Interest Rates", regulatoryWeight: 90,
    chain: ["RBI rate decision", "Interest rates", "Debt funds", "Banking sector", "Liquid funds", "Gilt funds", "Potential duration impact"] },
  sebi_mf_circular: { theme: "SEBI", regulatoryWeight: 85,
    chain: ["SEBI regulatory action", "Mutual fund industry compliance", "AMC / distributor operations", "Potential impact on fund structure or fees"] },
  mutual_fund_industry: { theme: "Mutual Funds", regulatoryWeight: 30,
    chain: ["Mutual fund industry news", "AMC business activity", "Fund category growth", "Worth reviewing the specific fund/AMC involved"] },
  oil_price: { theme: "Energy", regulatoryWeight: 50,
    chain: ["Oil price move", "Energy sector", "Transportation costs", "Inflation pressure", "Large Cap funds", "Sector funds"] },
  banking_earnings: { theme: "Banking", regulatoryWeight: 40,
    chain: ["Bank earnings", "Banking sector", "Financial Services", "Large Cap funds", "Potential re-rating of banking-heavy funds"] },
  inflation_data: { theme: "Inflation", regulatoryWeight: 70,
    chain: ["Inflation data release", "Interest-rate expectations", "Debt funds", "Gilt funds", "Potential yield / duration impact"] },
  gdp_growth: { theme: "Consumption", regulatoryWeight: 60,
    chain: ["GDP growth data", "Broad economic activity", "Large Cap funds", "Flexi Cap funds", "Potential broad-market sentiment impact"] },
  fii_dii_flows: { theme: "Global Markets", regulatoryWeight: 45,
    chain: ["FII / DII flow data", "Market liquidity", "Large Cap funds", "Flexi Cap funds", "Mid Cap funds", "Potential valuation impact"] },
  rupee_currency: { theme: "Global Markets", regulatoryWeight: 55,
    chain: ["Rupee movement", "Currency impact", "IT sector (export revenue)", "Debt funds (imported inflation)", "Potential margin impact for exporters"] },
  it_sector: { theme: "Technology", regulatoryWeight: 35,
    chain: ["IT sector news", "Technology stocks", "Large Cap funds", "Flexi Cap funds", "IT sector funds"] },
  pharma_sector: { theme: "Healthcare", regulatoryWeight: 30,
    chain: ["Pharma / healthcare news", "Healthcare sector", "Sectoral/Thematic funds", "Potential re-rating of healthcare-heavy funds"] },
  auto_sector: { theme: "Manufacturing", regulatoryWeight: 30,
    chain: ["Auto sector sales/news", "Automobile manufacturing", "Sectoral/Thematic funds", "Potential re-rating of auto-heavy funds"] },
  gold_price: { theme: "Commodities", regulatoryWeight: 25,
    chain: ["Gold price move", "Commodities", "Gold ETF funds", "Potential impact on multi-asset allocation"] },
  sensex_nifty_move: { theme: "Markets", regulatoryWeight: 35,
    chain: ["Index move (Sensex/Nifty)", "Broad market sentiment", "Large Cap funds", "Index funds / ETFs", "Potential short-term flow impact"] },
  ipo_market: { theme: "Markets", regulatoryWeight: 25,
    chain: ["IPO activity", "Primary-market sentiment", "Small Cap funds", "Mid Cap funds", "Potential liquidity / valuation impact"] },
  amfi_data: { theme: "Mutual Funds", regulatoryWeight: 40,
    chain: ["AMFI industry data", "Mutual fund industry AUM/SIP trend", "Category-wide flow signal", "Potential category-level re-rating"] },
  global_cues: { theme: "Global Markets", regulatoryWeight: 50,
    chain: ["Global market cue (Fed / US markets)", "FII sentiment", "Large Cap funds", "IT sector funds (export-linked)", "Potential short-term volatility"] },
  credit_rating: { theme: "Corporate Earnings", regulatoryWeight: 55,
    chain: ["Credit rating action", "Corporate bond risk", "Credit Risk funds", "Corporate Bond funds", "Potential NAV impact for holding funds"] },
  liquidity_rbi: { theme: "RBI", regulatoryWeight: 75,
    chain: ["RBI liquidity action", "Banking-system liquidity", "Liquid funds", "Overnight funds", "Money Market funds", "Potential short-duration yield impact"] },
  amc_mention: { theme: "Mutual Funds", regulatoryWeight: 20,
    chain: ["AMC named in coverage", "Direct AMC relevance", "Worth reviewing funds under this AMC"] },
};

export const THEMES = Array.from(new Set(Object.values(RULE_META).map((m) => m.theme))).sort();

// Real assetClass values (funds.json) — used as a fallback join when a rule's entity name is an
// asset class rather than a specific scheme category (e.g. "Debt" is not a real `category` value,
// it's an `assetClass` value — confirmed by direct inspection of funds.json this session).
const ASSET_CLASSES = new Set(["Debt", "Equity", "Hybrid", "Other", "Solution"]);

// Rule-engine sector names -> real sector_allocation sector names (metadata.json, 152-fund
// factsheet subset). Deliberately incomplete: "Commodities", "Transport", and "Export-linked"
// have no honest equivalent in this taxonomy, so they're left unmapped — sectorExposure() then
// correctly returns { available: false }, which the UI renders as "Exposure unavailable" rather
// than a forced/approximate match.
export const SECTOR_MAP = {
  Energy: ["Oil, Gas & Consumable Fuels"],
  IT: ["Information Technology"],
  Auto: ["Automobile And Auto Components"],
  Healthcare: ["Healthcare"],
  "Financial Services": ["Financial Services"],
  Banking: ["Financial Services"], // approximation: no separate "Banking" bucket in this taxonomy
};

let categoryPageSafeCache = null;
// /categories/[category]/page.js hard-filters to assetClass==="Equity" and calls notFound()
// otherwise — confirmed live: every debt category (Liquid, Gilt, Corporate Bond, etc.) has
// hundreds of real funds but ZERO that pass that page's equity-only filter, so linking to
// /categories/<debt category> would be a dead 404. This computes the real, current safe set
// from the same bundle that page reads, rather than a static list that could drift.
function categoryPageIsSafe(category) {
  if (!categoryPageSafeCache) {
    categoryPageSafeCache = new Set(
      allFunds()
        .filter((f) => f.isGrowth && !f.isIdcw && f.assetClass === "Equity" && f.r1m != null)
        .map((f) => f.category)
    );
  }
  return categoryPageSafeCache.has(category);
}

// Impact chain for an article: the causal narrative of its highest-regulatory-weight matched
// rule (the "primary" story), plus any additional distinct rule_ids as secondary chains — never
// a blended/invented chain, always exactly what a real rule produced.
export function impactChainsFor(links) {
  const ruleIds = Array.from(new Set((links || []).map((l) => l.ruleId).filter(Boolean)));
  const withMeta = ruleIds.map((id) => ({ ruleId: id, ...RULE_META[id] })).filter((m) => m.chain);
  withMeta.sort((a, b) => (b.regulatoryWeight || 0) - (a.regulatoryWeight || 0));
  return withMeta;
}

export function themesFor(links) {
  const ruleIds = new Set((links || []).map((l) => l.ruleId).filter(Boolean));
  return Array.from(new Set(Array.from(ruleIds).map((id) => RULE_META[id]?.theme).filter(Boolean)));
}

// Market Impact Score (Phase 6) — NOT sentiment-based. Breadth (distinct sectors/categories/
// AMCs/indices touched) + the regulatory weight of the most authoritative rule that fired +
// source credibility. Every input is a real, already-stored field; the weights/thresholds below
// are a fixed, documented editorial judgment call (mirrors RULE_META's own regulatoryWeight
// values), not derived from any external benchmark.
export function impactScoreFor(article) {
  const links = article.links || [];
  const byType = (t) => new Set(links.filter((l) => l.entityType === t).map((l) => l.entityName)).size;
  const breadth = byType("sector") * 8 + byType("category") * 6 + byType("amc") * 10 + byType("index") * 5;
  const ruleIds = new Set(links.map((l) => l.ruleId).filter(Boolean));
  const maxRegWeight = Math.max(0, ...Array.from(ruleIds).map((id) => RULE_META[id]?.regulatoryWeight || 0));
  const credibility = article.source?.credibility === "official" ? 100 : article.source?.credibility === "tier1_business" ? 40 : 0;

  const score = Math.min(100, Math.round(Math.min(100, breadth) * 0.35 + maxRegWeight * 0.5 + credibility * 0.15));
  const tier = score >= 75 ? "Critical" : score >= 55 ? "High" : score >= 30 ? "Medium" : "Low";
  return { score, tier };
}

// Phase 2/3 — real funds via the same allFunds()/fundHealth() the category page already trusts.
// Ranked by fundHealth().overall (established, documented 0-100 score) where available, falling
// back to 1M return — never a fabricated "best fund" ranking.
export function fundsWorthResearching(link, { limit = 3 } = {}) {
  if (!link?.entityName) return [];
  let pool = [];
  if (link.entityType === "category") {
    pool = allFunds().filter((f) => f.category === link.entityName);
    if (!pool.length && ASSET_CLASSES.has(link.entityName)) {
      pool = allFunds().filter((f) => f.assetClass === link.entityName);
    }
  } else if (link.entityType === "amc") {
    pool = allFunds().filter((f) => f.amc === link.entityName);
  } else if (link.entityType === "index") {
    const target = link.entityName.toLowerCase();
    pool = allFunds().filter((f) => {
      if (!f.benchmark) return false;
      const b = f.benchmark.trim().toUpperCase();
      if (target.includes("nifty 50") && b === "NIFTY 50 TRI") return true;
      if (target.includes("sensex") && b === "S&P BSE SENSEX TRI") return true;
      return false;
    });
  }
  pool = pool.filter((f) => f.active !== false && f.nav != null);
  return pool
    .map((f) => {
      const h = fundHealth(f);
      return { code: f.code, name: f.name, amc: f.amc, category: f.category, r1m: f.r1m ?? null, health: h?.overall ?? null, grade: h?.grade ?? null };
    })
    .sort((a, b) => (b.health ?? -1) - (a.health ?? -1) || (b.r1m ?? -999) - (a.r1m ?? -999))
    .slice(0, limit);
}

// Phase 3 — Fund Exposure Engine. Real holdings-derived sector allocation from metadata.json
// (152 funds have factsheet-sourced sector_allocation as of this session — a real but partial
// subset, not the full universe). Returns { available:false } honestly whenever the sector has
// no mapped equivalent or zero funds clear the allocation threshold — the UI must render that as
// "Exposure unavailable", never silently omit or substitute a guess.
export function sectorExposure(sectorEntityName, { limit = 3, minPct = 3 } = {}) {
  const realSectors = SECTOR_MAP[sectorEntityName];
  if (!realSectors) return { available: false, funds: [] };
  const rows = [];
  for (const m of metaData.metadata || []) {
    const allocs = (m.sector_allocation || []).filter((s) => realSectors.includes(s.sector) && (s.allocation_pct || 0) >= minPct);
    if (!allocs.length) continue;
    const pct = allocs.reduce((s, a) => s + (a.allocation_pct || 0), 0);
    // NOTE: `m.amc` here is metadata.json's full-name convention ("SBI Mutual Fund"), NOT
    // funds.json's short-name convention ("SBI") that the rest of this file and /amc/<name>
    // links use — appending " Mutual Fund" to it would double up. Display it as-is; link these
    // rows to /fund/<code> only (always safe), never construct an /amc/ href from this field.
    rows.push({ code: String(m.scheme_code), name: m.scheme_name, amc: m.amc, allocationPct: Math.round(pct * 10) / 10 });
  }
  rows.sort((a, b) => b.allocationPct - a.allocationPct);
  return { available: rows.length > 0, funds: rows.slice(0, limit), sourceCoverage: `${metaData.metadata?.length || 0} funds with factsheet holdings` };
}

// Phase 7 — Related Research. Only ever emits hrefs verified safe: /fund/<code> (fund page has
// no asset-class restriction — any real code resolves), /categories/<name> ONLY when
// categoryPageIsSafe() confirms it (equity categories only, checked live against the same
// bundle that page reads), /amc/<name + " Mutual Fund"> (the exact suffix convention every
// other AMC link in this app already uses), /benchmark/<slug> via the shared benchmarkSlug().
const REPORT_LINKS = {
  rbi: { href: "/brief", label: "Market Brief" },
  sebi: { href: "/compare", label: "AMC Comparison" },
  mutual_fund: { href: "/discover", label: "Discover funds" },
  amfi: { href: "/performance", label: "Fund Performance" },
  earnings: { href: "/performance", label: "Fund Performance" },
  macro: { href: "/brief", label: "Market Brief" },
  sector: { href: "/signals", label: "Flow Signals" },
  market_moving: { href: "/signals", label: "Flow Signals" },
  global: { href: "/brief", label: "Market Brief" },
  corporate: { href: "/performance", label: "Fund Performance" },
};

// The rule engine's index entity names ("Nifty 50", "Sensex") are short canonical labels, not
// literal fund benchmark strings — confirmed live that no fund's `benchmark` field slugifies to
// bare "nifty-50"/"sensex" (every real string carries a suffix like "TRI"), so a naive
// benchmarkSlug(entityName) link would 404. Map to the actual plain-index-tracker benchmark
// string (also used by fundsWorthResearching's index matching) before slugifying.
const INDEX_BENCHMARK_STRING = { "Nifty 50": "NIFTY 50 TRI", Sensex: "S&P BSE SENSEX TRI" };

export function researchLinksFor(article) {
  const links = [];
  const seen = new Set();
  const add = (href, label, entityType) => {
    if (href && !seen.has(href)) { seen.add(href); links.push({ href, label, entityType }); }
  };
  for (const l of article.links || []) {
    if (l.entityType === "category" && categoryPageIsSafe(l.entityName)) {
      add(`/categories/${encodeURIComponent(l.entityName)}`, `${l.entityName} category`, "category");
    } else if (l.entityType === "amc") {
      add(`/amc/${encodeURIComponent(`${l.entityName} Mutual Fund`)}`, `${l.entityName} AMC`, "amc");
    } else if (l.entityType === "index") {
      const realBenchmark = INDEX_BENCHMARK_STRING[l.entityName] || l.entityName;
      add(`/benchmark/${benchmarkSlug(realBenchmark)}`, `${l.entityName} benchmark`, "index");
    }
  }
  const report = REPORT_LINKS[article.category];
  if (report) add(report.href, report.label, "report");
  return links;
}
