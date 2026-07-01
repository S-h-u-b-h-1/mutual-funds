// AMC Intelligence — real, deterministic analytics for one AMC within an asset class,
// computed from funds.json (no flow data needed). Canonical-fund grouping, AMC performance
// score, peer rank, category-strength breakdown, best/weakest. Pure functions (testable).
import { canonicalKey, canonicalName } from "./canonical";
import { fundHealth } from "./fundHealth";

export const amcSlugify = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// AMC-level grading is a distinct 6-band scale (A/B+/B/C/D/E) from the fund-level 5-band scale
// in fundHealth.js (A/B/C/D/E) — NOT the same tone function, do not conflate the two.
export const gradeTone = (g) => (g === "A" || g === "B+" || g === "B" ? "pos" : g === "C" ? "warn" : "neg");

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function amcIntel(allFunds, amcSlug, assetSlug) {
  const universe = allFunds.filter((f) => (f.assetClass || "").toLowerCase() === assetSlug && f.isGrowth && !f.isIdcw && f.r1m != null);
  const amcFunds = universe.filter((f) => amcSlugify(f.amc) === amcSlug);
  if (!amcFunds.length) return null;
  const amcName = amcFunds[0].amc;
  const assetClass = amcFunds[0].assetClass;

  // canonical grouping — one row per investment idea (Direct Growth preferred)
  const groups = new Map();
  for (const f of amcFunds) {
    const k = canonicalKey(f.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const canon = [...groups.values()].map((vs) => {
    const pick = vs.find((f) => f.isDirect && f.isGrowth) || vs.find((f) => f.isGrowth) || vs[0];
    const h = fundHealth(pick);
    return {
      name: canonicalName(pick.name), code: pick.code, category: pick.category,
      direct: vs.some((f) => f.isDirect), regular: vs.some((f) => !f.isDirect),
      navDate: pick.navDate, r1m: pick.r1m, r3m: pick.r3m, r1y: pick.r1y, r3y: pick.r3y,
      vol90: pick.vol90, maxdd90: pick.maxdd90, benchmark: pick.benchmark, catPct: pick.catPct,
      health: h?.overall ?? null, grade: h?.grade ?? null, quality: pick.quality?.status,
      variantCount: vs.length, variants: vs.map((v) => ({ code: v.code, name: v.name, plan: v.plan, option: v.option, r1y: v.r1y })),
    };
  });

  // ---- AMC performance score (0–100), available components reweighted ----
  const avgHealth = mean(canon.map((c) => c.health).filter((v) => v != null));
  const bySubAll = {};
  for (const f of universe) (bySubAll[f.category] ||= []).push(f);
  const catAvg1y = {};
  for (const [c, fs] of Object.entries(bySubAll)) catAvg1y[c] = mean(fs.map((f) => f.r1y).filter((v) => v != null));
  const with1y = canon.filter((c) => c.r1y != null);
  const beat = with1y.filter((c) => catAvg1y[c.category] != null && c.r1y > catAvg1y[c.category]).length;
  const beatPct = with1y.length ? (100 * beat) / with1y.length : null;
  const topQ = canon.filter((c) => c.catPct != null && c.catPct >= 75).length;
  const topQPct = canon.length ? (100 * topQ) / canon.length : 0;
  const avgVol = mean(canon.map((c) => c.vol90).filter((v) => v != null));
  const riskScore = avgVol != null ? Math.max(0, Math.min(100, 100 - avgVol * 2)) : null;
  const completeness = canon.length ? (100 * canon.filter((c) => c.r1y != null && c.vol90 != null).length) / canon.length : 0;

  const comps = [];
  if (avgHealth != null) comps.push([30, avgHealth]);
  if (beatPct != null) comps.push([25, beatPct]);
  comps.push([20, topQPct]);
  if (riskScore != null) comps.push([15, riskScore]);
  comps.push([10, completeness]);
  const tw = comps.reduce((s, [w]) => s + w, 0);
  const score = Math.round(comps.reduce((s, [w, v]) => s + (w / tw) * v, 0));
  const grade = score >= 85 ? "A" : score >= 70 ? "B+" : score >= 60 ? "B" : score >= 50 ? "C" : score >= 40 ? "D" : "E";

  // ---- peer rank vs all AMCs in this asset class (avg 1Y) ----
  const amcGroups = {};
  for (const f of universe) (amcGroups[f.amc] ||= []).push(f);
  const ranked = Object.entries(amcGroups)
    .map(([a, fs]) => ({ amc: a, avg1y: mean(fs.map((f) => f.r1y).filter((v) => v != null)), n: fs.length }))
    .filter((r) => r.avg1y != null && r.n >= 3)
    .sort((a, b) => b.avg1y - a.avg1y);
  const rankIdx = ranked.findIndex((r) => r.amc === amcName);
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;
  const totalAmcs = ranked.length;
  const percentile = rank != null ? Math.round((100 * (totalAmcs - rank + 1)) / totalAmcs) : null;

  // ---- category-strength breakdown within this AMC+asset ----
  const subBy = {};
  for (const c of canon) (subBy[c.category] ||= []).push(c);
  const categories = Object.entries(subBy).map(([cat, cs]) => {
    const avgH = mean(cs.map((c) => c.health).filter((v) => v != null));
    const top = cs.slice().sort((a, b) => (b.r1y ?? -1e9) - (a.r1y ?? -1e9))[0];
    return {
      category: cat, count: cs.length, avgHealth: avgH != null ? Math.round(avgH) : null,
      avgR1y: mean(cs.map((c) => c.r1y).filter((v) => v != null)), avgVol: mean(cs.map((c) => c.vol90).filter((v) => v != null)),
      topCode: top?.code, topName: top?.name,
      rating: avgH == null ? "—" : avgH >= 70 ? "Strong" : avgH >= 55 ? "Moderate" : "Weak",
    };
  }).sort((a, b) => (b.avgHealth ?? -1) - (a.avgHealth ?? -1));

  const best = canon.slice().sort((a, b) => (b.health ?? -1) - (a.health ?? -1)).slice(0, 5);
  const weakest = canon.slice().sort((a, b) => (a.health ?? 1e9) - (b.health ?? 1e9)).slice(0, 5);

  return {
    amcName, assetClass, fundCount: canon.length, totalVariants: amcFunds.length,
    score, grade, avgHealth: avgHealth != null ? Math.round(avgHealth) : null,
    beatPct: beatPct != null ? Math.round(beatPct) : null, topQ, topQPct: Math.round(topQPct),
    avgVol: avgVol != null ? +avgVol.toFixed(1) : null, completeness: Math.round(completeness),
    rank, totalAmcs, percentile,
    myAvg1y: rankIdx >= 0 ? +ranked[rankIdx].avg1y.toFixed(2) : null,
    catAvgRet: ranked.length ? +mean(ranked.map((r) => r.avg1y)).toFixed(2) : null,
    topAmc: ranked[0]?.amc, weakAmc: ranked[ranked.length - 1]?.amc,
    canon: canon.slice().sort((a, b) => (b.r1y ?? -1e9) - (a.r1y ?? -1e9)),
    categories, best, weakest,
  };
}
