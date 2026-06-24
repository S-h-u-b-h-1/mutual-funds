// Deterministic, data-backed fund analysis. No fabrication — every signal and every
// sentence references a computed metric from the AMFI-built bundle. Phase-10 rules:
// hide what we can't support, warn on stale / IDCW / insufficient history.

const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function fundSignals(f, cohort) {
  const positive = [];
  const caution = [];
  const warnings = [];

  if (f.catPct != null && f.catPct >= 90)
    positive.push(`Top ${100 - f.catPct === 0 ? "1" : (100 - f.catPct + 1)}% of ${f.plan} ${f.category} peers — rank #${f.catRank} of ${f.catSize}.`);
  if (f.r1y != null && f.r1y >= 15) positive.push(`Strong 1-year NAV return of ${pct(f.r1y)}.`);
  if (f.trend != null && f.trend >= 60) positive.push(`Improving trend — 1-month pace is running ahead of its 3-month pace.`);
  if (f.r1m != null && cohort && f.r1m > cohort.avg)
    positive.push(`Beating its ${f.plan} ${f.category} peer average (${pct(f.r1m)} vs ${pct(cohort.avg)}).`);

  if (f.trend != null && f.trend <= 40) caution.push(`Weakening trend — 1-month pace is below its 3-month pace.`);
  if (f.r1m != null && cohort && f.r1m < cohort.avg)
    caution.push(`Trailing its ${f.plan} ${f.category} peer average (${pct(f.r1m)} vs ${pct(cohort.avg)}).`);
  if (f.r1w != null && f.r1w <= -3) caution.push(`Sharp 1-week fall of ${pct(f.r1w)}.`);

  if (f.quality?.status === "stale") warnings.push(`Latest NAV is ${f.staleDays} day(s) old — figures may not reflect the most recent close.`);
  if (!f.quality?.has90d) warnings.push(`Insufficient history — fewer than ~90 days of NAV; long-window returns are hidden.`);
  if (f.isIdcw) warnings.push(`IDCW plan — NAV-based returns are distorted by dividend payouts; prefer the Growth plan for performance comparison.`);

  return { positive, caution, warnings };
}

export function researchSummary(f, cohort) {
  const parts = [];
  parts.push(`${f.name} is a ${f.plan} ${f.option} scheme in the ${f.category} category from ${f.amc}.`);
  if (f.r1m != null) {
    let s = `Over the last month its NAV returned ${pct(f.r1m)}`;
    if (f.catRank) s += `, ranking #${f.catRank} of ${f.catSize} among ${f.plan} ${f.category} peers (${f.catPct}th percentile)`;
    parts.push(s + ".");
  }
  if (f.r1y != null) parts.push(`Its 1-year NAV return is ${pct(f.r1y)}${f.r3m != null ? ` and 3-month is ${pct(f.r3m)}` : ""}.`);
  else if (f.r3m != null) parts.push(`Its 3-month NAV return is ${pct(f.r3m)}; 1-year history is not yet available.`);
  if (f.trend != null) parts.push(`The short-vs-medium momentum reading is ${f.trend >= 60 ? "improving" : f.trend <= 40 ? "weakening" : "steady"} (trend score ${f.trend}/100).`);
  if (cohort) parts.push(`The ${f.plan} ${f.category} peer set averaged ${pct(cohort.avg)} over 1 month across ${cohort.count} funds.`);
  return parts.join(" ");
}

// Visible return windows per Phase-10 rules: hide a window when its data is missing.
export function visibleReturns(f) {
  return [
    ["1D", f.r1d], ["1W", f.r1w], ["1M", f.r1m],
    ["3M", f.r3m], ["6M", f.r6m], ["1Y", f.r1y],
  ].filter(([, v]) => v != null);
}
