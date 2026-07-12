// Comparison Report (Investment Operating System mission, Phase 10) — a structured report object
// for the future PDF/export engine, not a new page. Takes the exact fund+health shape
// compare/page.js already computes (getFund() + fundHealth() per fund, annotated as
// {...fund, _h, _g}) and reshapes it into a side-by-side comparison — no new calculations, no
// fund-vs-fund cohort recomputation (that lives in investorAnalyst.js/fundDNA.js and needs
// per-fund cohort context the comparison surface doesn't currently gather; recomputing it here
// would risk silently diverging from the fund page's own cohort logic). Never declares an
// overall winner — same "no universal best fund" framing already on the Compare page.
const METRICS = [
  { key: "r1m", label: "1-month return", unit: "%", higherIsBetter: true },
  { key: "r3m", label: "3-month return", unit: "%", higherIsBetter: true },
  { key: "r1y", label: "1-year return", unit: "%", higherIsBetter: true },
  { key: "vol90", label: "90-day volatility", unit: "%", higherIsBetter: false },
  // maxdd90 is stored as a negative number (e.g. -6.2 means a 6.2% drawdown) — the smaller loss is
  // the less-negative, i.e. numerically HIGHER, value. Caught by a live test with real negative
  // sample data before this shipped: false here silently picked the WORSE drawdown as the "leader".
  { key: "maxdd90", label: "90-day max drawdown", unit: "%", higherIsBetter: true },
  { key: "consistency", label: "Consistency", unit: "%", higherIsBetter: true },
  { key: "_h", label: "Health score", unit: "/100", higherIsBetter: true },
];

function leaderFor(funds, metric) {
  const withValue = funds.filter((f) => f[metric.key] != null);
  if (!withValue.length) return null;
  const best = withValue.reduce((a, b) => (metric.higherIsBetter ? b[metric.key] > a[metric.key] : b[metric.key] < a[metric.key]) ? b : a);
  return { schemeCode: best.code, schemeName: best.name, value: best[metric.key] };
}

export function buildComparisonReport(funds) {
  if (!funds || funds.length < 2) return null;

  const rows = funds.map((f) => ({
    schemeCode: f.code,
    schemeName: f.name,
    amc: f.amc,
    category: f.category,
    healthScore: f._h ?? null,
    healthGrade: f._g ?? null,
    metrics: Object.fromEntries(METRICS.filter((m) => m.key !== "_h").map((m) => [m.key, f[m.key] ?? null])),
  }));

  const metricLeaders = METRICS.map((m) => ({ metric: m.label, unit: m.unit, leader: leaderFor(funds, m) })).filter((m) => m.leader);

  const amcCounts = {};
  const categoryCounts = {};
  for (const f of funds) {
    amcCounts[f.amc] = (amcCounts[f.amc] || 0) + 1;
    categoryCounts[f.category] = (categoryCounts[f.category] || 0) + 1;
  }
  const sharedAmc = Object.entries(amcCounts).filter(([, n]) => n > 1).map(([amc]) => amc);
  const sharedCategory = Object.entries(categoryCounts).filter(([, n]) => n > 1).map(([category]) => category);

  return {
    fundCount: funds.length,
    funds: rows,
    metricLeaders,
    overlap: {
      sharedAmc,
      sharedCategory,
      note: sharedAmc.length || sharedCategory.length
        ? `${sharedAmc.length ? `${sharedAmc.length} AMC(s) appear more than once. ` : ""}${sharedCategory.length ? `${sharedCategory.length} categor${sharedCategory.length === 1 ? "y appears" : "ies appear"} more than once.` : ""}`.trim()
        : "No AMC or category overlap among the funds compared.",
    },
    methodology: "Each metric's leader is a direct read from already-computed fund fields (fundHealth.js health score; observed return/volatility/drawdown/consistency from real AMFI NAV history) — no new calculations. A metric leader is not an overall recommendation: no fund is declared a universal winner, since risk tolerance, horizon, and existing holdings change which metric matters most to a given investor.",
  };
}
