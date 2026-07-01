import { NextResponse } from "next/server";
import { allFunds } from "../../lib/funds";
import { allManagers } from "../../lib/metadata";
import { canonicalName, canonicalKey } from "../../lib/canonical";

export const revalidate = 600;

// Server-side, multi-field search (Phase 8) — runs where funds.json/metadata.json actually
// live (never shipped to the client, per lib/funds.js). Supabase's dim_scheme only carries
// name/AMC/asset_class/ISIN; benchmark and manager search need this server-side path instead.
// Every match is real: no field here is guessed or ranked by anything but exact/substring hits.
function matches(f, q, qLower) {
  if (f.code === q) return "Scheme code";
  if (f.isin && f.isin.toUpperCase() === q.toUpperCase()) return "ISIN";
  if (f.name?.toLowerCase().includes(qLower)) return "Fund name";
  if (f.amc?.toLowerCase().includes(qLower)) return "AMC";
  if (f.category?.toLowerCase().includes(qLower)) return "Category";
  if (f.benchmark?.toLowerCase().includes(qLower)) return "Benchmark";
  return null;
}

export async function GET(req) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
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
  const results = [...groups.values()]
    .map((g) => {
      const pick = g.variants.find(isDG) || g.variants.find((v) => v.isGrowth) || g.variants[0];
      return {
        code: pick.code, name: g.name, amc: g.amc, category: g.category, assetClass: g.assetClass,
        matchType: g.matchType, variantCount: g.variants.length,
        r1m: pick.r1m, staleDays: pick.staleDays,
      };
    })
    .sort((a, b) => (a.staleDays ?? 999) - (b.staleDays ?? 999)) // freshest/most-active first
    .slice(0, 12);

  return NextResponse.json({ results });
}
