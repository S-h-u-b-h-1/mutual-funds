// Real ecosystem-graph nodes for the hero visualization — derived live from funds.json
// (allFunds()), the SAME source of truth every other page reads. Never a separate stale
// snapshot: whatever the graph shows is exactly what the rest of the site currently knows.
// Universe-wide relationships only (AMC<->assetClass, AMC<->benchmark) — both 100%-coverage
// facts. Manager/holdings edges exist (knowledge graph) but are factsheet-limited (~1% of
// funds), so they are deliberately NOT drawn here at equal visual weight — that would
// misrepresent how complete manager/holdings coverage actually is.
export function graphNodes(funds) {
  const byClass = {};
  const byCategory = {};
  const amcClass = {}; // amc -> {assetClass: count}
  const amcCategory = {}; // amc -> {category: count}
  const amcBench = {}; // amc -> {benchmark: count}
  const totals = { direct: 0, regular: 0, growth: 0, idcw: 0, active: 0, inactive: 0 };
  for (const f of funds) {
    if (!f.amc || !f.assetClass) continue;
    byClass[f.assetClass] = (byClass[f.assetClass] || 0) + 1;
    if (f.category) byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    (amcClass[f.amc] ||= {})[f.assetClass] = (amcClass[f.amc]?.[f.assetClass] || 0) + 1;
    if (f.category) (amcCategory[f.amc] ||= {})[f.category] = (amcCategory[f.amc]?.[f.category] || 0) + 1;
    if (f.benchmark) (amcBench[f.amc] ||= {})[f.benchmark] = (amcBench[f.amc]?.[f.benchmark] || 0) + 1;
    if (f.isDirect) totals.direct++; else totals.regular++;
    if (f.isIdcw) totals.idcw++; else totals.growth++;
    if (f.active) totals.active++; else totals.inactive++;
  }
  const classes = Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  const amcs = Object.entries(amcClass)
    .map(([amc, byC]) => {
      const total = Object.values(byC).reduce((a, b) => a + b, 0);
      const dominant = Object.entries(byC).sort((a, b) => b[1] - a[1])[0][0];
      const categories = Object.entries(amcCategory[amc] || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
      return { amc, total, dominantClass: dominant, classBreakdown: byC, categories };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 24); // top AMCs by fund count — the visually meaningful set

  const benchByAmc = {};
  for (const a of amcs) {
    const bm = amcBench[a.amc];
    if (bm) benchByAmc[a.amc] = Object.entries(bm).sort((x, y) => y[1] - x[1])[0][0];
  }

  return { classes, categories, totals, amcs: amcs.map((a) => ({ ...a, benchmark: benchByAmc[a.amc] || null })) };
}
