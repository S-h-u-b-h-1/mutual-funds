import { NextResponse } from "next/server";
import { allFunds, getFund } from "../../lib/funds";
import { allManagers } from "../../lib/metadata";
import { canonicalName, canonicalKey } from "../../lib/canonical";
import { fundHealth } from "../../lib/fundHealth";
import { searchCompanies } from "../../lib/stocks/companyService";
import { listSectors } from "../../lib/stocks/sectors";

export const revalidate = 600;

// Server-side, multi-field search (Phase 8) — runs where funds.json/metadata.json actually
// live (never shipped to the client, per lib/funds.js). Supabase's dim_scheme only carries
// name/AMC/asset_class/ISIN; benchmark and manager search need this server-side path instead.
// Every match is real: no field here is guessed or ranked by anything but exact/substring hits.
function matches(f, q, qLower) {
  if (f.code === q) return "Exact fund match";
  if (f.isin && f.isin.toUpperCase() === q.toUpperCase()) return "ISIN";
  if (f.name?.toLowerCase().includes(qLower)) return "Fund name";
  if (f.amc?.toLowerCase().includes(qLower)) return "AMC";
  if (f.category?.toLowerCase().includes(qLower)) return "Category";
  if (f.benchmark?.toLowerCase().includes(qLower)) return "Benchmark";
  return null;
}

function researchResult(f, matchType = "Exact fund match") {
  const health = fundHealth(f);
  return {
    code: f.code,
    name: f.name,
    amc: f.amc,
    category: f.category,
    assetClass: f.assetClass,
    plan: f.plan,
    isDirect: f.isDirect,
    isIdcw: f.isIdcw,
    nav: f.nav ?? null,
    navDate: f.navDate ?? null,
    staleDays: f.staleDays ?? null,
    matchType,
    r1m: f.r1m ?? null,
    r3m: f.r3m ?? null,
    r1y: f.r1y ?? null,
    vol90: f.vol90 ?? null,
    maxdd90: f.maxdd90 ?? null,
    consistency: f.consistency ?? null,
    catRank: f.catRank ?? null,
    catSize: f.catSize ?? null,
    catPct: f.catPct ?? null,
    _h: health?.overall ?? null,
    _g: health?.grade ?? null,
    kind: "fund",
    path: `/fund/${f.code}`,
  };
}

const STATIC_SEARCH_SURFACES = [
  { name: "Learn mutual funds", kind: "learn", path: "/learn", subtitle: "NAV, AUM, expense ratio, risk, SIP, redemption and switch basics", keywords: ["learn", "education", "mutual fund", "nav", "aum", "expense", "sip", "redemption", "switch", "xirr", "cagr"] },
  { name: "Stocks research", kind: "workspace", path: "/stocks", subtitle: "Company research, screeners, sectors and learning", keywords: ["stocks", "equity", "company", "companies", "research"] },
  { name: "Stock screener", kind: "tool", path: "/stocks/screener", subtitle: "ROCE, debt, growth, cash flow and dividend screens", keywords: ["screener", "screen", "roce", "debt", "growth", "dividend"] },
  { name: "Stock sectors", kind: "workspace", path: "/stocks/sectors", subtitle: "Sector → companies → metrics → raw-material context", keywords: ["sector", "industry", "companies"] },
  { name: "Raw materials", kind: "market", path: "/markets/raw-materials", subtitle: "Commodity context when licensed/public feeds exist", keywords: ["commodity", "commodities", "raw material", "bigmint", "steel", "cement"] },
  { name: "Learn stock research", kind: "learn", path: "/learn/stocks", subtitle: "Annual reports, management, valuation, risks and thesis building", keywords: ["learn", "education", "annual report", "valuation", "management", "thesis"] },
  { name: "Suasion Invest", kind: "invest", path: "/invest", subtitle: "Mutual-fund execution workspace", keywords: ["invest", "investment", "suasion", "kyc", "order"] },
  { name: "Investment readiness", kind: "invest", path: "/invest/compliance", subtitle: "KYC, bank, nominee, FATCA and readiness steps", keywords: ["kyc", "readiness", "compliance", "bank", "fatca", "nominee"] },
  { name: "Portfolio", kind: "portfolio", path: "/portfolio", subtitle: "Mutual-fund portfolio import and intelligence", keywords: ["portfolio", "holdings", "gain", "loss", "xirr", "allocation"] },
  { name: "Invest portfolio", kind: "portfolio", path: "/invest/portfolio", subtitle: "Authenticated portfolio, holdings and pending transactions", keywords: ["portfolio", "holdings", "transactions"] },
  { name: "Profile", kind: "account", path: "/profile", subtitle: "Account, preferences and setup", keywords: ["profile", "account", "settings", "preferences"] },
  { name: "Help Center", kind: "support", path: "/help", subtitle: "Get oriented, check data status and find support paths", keywords: ["help", "support", "stuck", "contact", "status"] },
  { name: "Service status", kind: "support", path: "/status", subtitle: "Application and data-service status", keywords: ["status", "outage", "service", "health"] },
];

function staticMatches(qLower) {
  return STATIC_SEARCH_SURFACES
    .filter((item) => item.name.toLowerCase().includes(qLower) || item.subtitle.toLowerCase().includes(qLower) || item.keywords.some((keyword) => keyword.includes(qLower) || qLower.includes(keyword)))
    .map((item) => ({ ...item, code: item.path, matchType: item.kind }));
}

async function stockMatches(q) {
  try {
    const companies = await searchCompanies(q, { limit: 5 });
    return companies.map((company) => ({
      code: company.id,
      name: company.displayName,
      kind: "company",
      path: `/stocks/${company.id}`,
      matchType: company.nseSymbol ? "NSE company" : company.bseCode ? "BSE company" : "Company",
      subtitle: [company.nseSymbol || company.bseCode || company.isin, company.listingStatus].filter(Boolean).join(" · "),
    }));
  } catch {
    return [];
  }
}

async function sectorMatches(qLower) {
  try {
    const sectors = await listSectors();
    return sectors
      .filter((sector) => sector.name?.toLowerCase().includes(qLower) || sector.slug?.toLowerCase().includes(qLower))
      .slice(0, 5)
      .map((sector) => ({
        code: sector.id,
        name: sector.name,
        kind: "sector",
        path: "/stocks/sectors",
        matchType: "Sector",
        subtitle: sector.description || "Stock sector research",
      }));
  } catch {
    return [];
  }
}

export async function GET(req) {
  const amcs = (req.nextUrl.searchParams.get("amcs") || "").split(",").map((name) => name.trim()).filter(Boolean).slice(0, 4);
  if (amcs.length) {
    const selected = new Set(amcs);
    const results = allFunds()
      .filter((fund) => selected.has(`${fund.amc} Mutual Fund`))
      .map((fund) => ({ ...researchResult(fund), amcName: `${fund.amc} Mutual Fund`, isGrowth: fund.isGrowth, active: fund.active }));
    return NextResponse.json({ results });
  }

  const codes = (req.nextUrl.searchParams.get("codes") || "").split(",").map((code) => code.trim()).filter(Boolean).slice(0, 20);
  if (codes.length) {
    const results = codes.map((code) => getFund(code)).filter((fund) => fund?.active !== false && fund?.nav != null).map((fund) => researchResult(fund));
    return NextResponse.json({ results });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const plan = (req.nextUrl.searchParams.get("plan") || "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const qLower = q.toLowerCase();

  const funds = allFunds();
  const managers = allManagers();
  const managerHit = managers.find((m) => m.name.toLowerCase().includes(qLower));
  const managerCodes = managerHit ? new Set(managerHit.codes) : null; // codes is an array on allManagers(); Set for O(1) lookups here

  const hits = [];
  for (const f of funds) {
    const type = managerCodes?.has(f.code) ? "Manager" : matches(f, q, qLower);
    if (type) hits.push({ f, type });
    if (hits.length >= 400) break; // safety cap on scan collection before canonical grouping
  }

  // canonical grouping — one row per investment idea, Direct-Growth preferred
  const groups = new Map();
  for (const { f, type } of hits) {
    const k = canonicalKey(f.name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, { name: canonicalName(f.name), amc: f.amc, category: f.category, assetClass: f.assetClass, matchType: type, variants: [] });
    groups.get(k).variants.push(f);
  }
  const isDG = (f) => f.isDirect && f.isGrowth;
  const isRG = (f) => !f.isDirect && f.isGrowth && /\bregular\b/i.test(String(f.plan || f.name || ""));
  const results = [...groups.values()]
    .map((g) => {
      const pick = plan === "regular"
        ? g.variants.find(isRG)
        : g.variants.find(isDG) || g.variants.find((v) => v.isGrowth) || g.variants[0];
      if (!pick) return null;
      const health = fundHealth(pick);
      return { ...researchResult(pick, g.matchType), name: g.name, variantCount: g.variants.length, staleDays: pick.staleDays, _h: health?.overall ?? null, _g: health?.grade ?? null };
    })
    .filter(Boolean)
    .sort((a, b) => (a.staleDays ?? 999) - (b.staleDays ?? 999)) // freshest/most-active first
    .slice(0, 12);

  const [companies, sectors] = await Promise.all([stockMatches(q), sectorMatches(qLower)]);
  return NextResponse.json({ results: [...staticMatches(qLower), ...companies, ...sectors, ...results].slice(0, 18) });
}
