// Canonical fund normalization (client mirror of scripts/canonical.py). Collapses the
// Direct/Regular × Growth/IDCW scheme variants into one investment idea so search, rankings
// and insights show one row per fund — not four.
const CUT = /\s*[-–]\s*(?:Direct|Regular|Growth|IDCW|Income\s+Distribution|Dividend|Bonus|Payout|Reinvest|Plan\b).*$/i;
const TAIL = /\s*[-–]\s*(?:Growth|IDCW|Dividend|Bonus|Payout)\s*$/i;

export function canonicalName(name) {
  let n = String(name || "").replace(CUT, "").trim();
  n = n.replace(TAIL, "").trim().replace(/-+$/, "").trim();
  return n.replace(/\s{2,}/g, " ");
}

export function canonicalKey(name) {
  return canonicalName(name).toLowerCase().replace(/&/g, "and").replace(/-/g, " ").replace(/\s{2,}/g, " ").trim();
}

// Group raw scheme rows into canonical funds; route each to its Direct-Growth variant.
export function groupCanonical(rows, limit = 8) {
  const groups = new Map();
  for (const r of rows) {
    const k = canonicalKey(r.scheme_name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, { name: canonicalName(r.scheme_name), amc: r.amc_name, asset_class: r.asset_class, variants: [] });
    groups.get(k).variants.push(r);
  }
  const isDG = (s) => /direct/i.test(s) && /growth/i.test(s);
  return [...groups.values()].map((g) => {
    const pick = g.variants.find((v) => isDG(v.scheme_name)) || g.variants.find((v) => /growth/i.test(v.scheme_name)) || g.variants[0];
    return { ...g, code: pick.scheme_code, count: g.variants.length };
  }).slice(0, limit);
}
