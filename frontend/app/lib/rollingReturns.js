// Calendar returns + rolling returns (Phase 5 — terminal sprint). Pure functions over the same
// real NAV history (`{t, v}` points, ascending) already fetched via lib/mfapi.js for the NAV
// trend chart — no new data source, no fabrication. Both degrade to an empty result (never a
// guessed value) when there isn't enough real history for a given window.

// Real calendar-year return: first available NAV on/after Jan 1 to last available NAV on/before
// Dec 31, for each year with at least 2 real data points spanning it. A year with only partial
// coverage (fund launched mid-year, or history starts mid-year) is still shown — real coverage,
// clearly the actual first/last dates used, not silently extrapolated to a full year.
export function calendarReturns(points) {
  if (!points?.length) return [];
  const byYear = new Map();
  for (const p of points) {
    const year = p.t.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(p);
  }
  const out = [];
  for (const [year, pts] of byYear) {
    if (pts.length < 2) continue;
    const first = pts[0], last = pts[pts.length - 1];
    if (first.v <= 0) continue;
    out.push({ year, return: +(((last.v / first.v) - 1) * 100).toFixed(2), from: first.t, to: last.t });
  }
  return out.sort((a, b) => b.year.localeCompare(a.year));
}

// Rolling N-month return series: for each real NAV date T with a real NAV point ~N months
// earlier (within a 10-day tolerance, since NAV dates don't fall on exact calendar boundaries),
// return = NAV(T)/NAV(T-N months) - 1. Sampled at ~weekly intervals (not every single day) to
// keep the resulting series a reasonable size for charting without losing the real shape.
export function rollingReturns(points, months = 12) {
  if (!points || points.length < 30) return [];
  const byDate = new Map(points.map((p) => [p.t, p.v]));
  const dates = points.map((p) => p.t);
  const out = [];
  for (let i = 0; i < points.length; i += 5) {
    const t = points[i].t;
    const target = new Date(t);
    target.setMonth(target.getMonth() - months);
    const targetStr = target.toISOString().slice(0, 10);
    // nearest real NAV date within 10 days of the target (NAV dates aren't evenly spaced —
    // weekends/holidays mean there's rarely an exact match)
    let match = null;
    for (let d = 0; d <= 10; d++) {
      const before = new Date(target); before.setDate(before.getDate() - d);
      const after = new Date(target); after.setDate(after.getDate() + d);
      const bStr = before.toISOString().slice(0, 10), aStr = after.toISOString().slice(0, 10);
      if (byDate.has(bStr)) { match = bStr; break; }
      if (byDate.has(aStr)) { match = aStr; break; }
    }
    if (!match) continue;
    const startNav = byDate.get(match);
    const endNav = byDate.get(t);
    if (startNav > 0) out.push({ t, return: +(((endNav / startNav) - 1) * 100).toFixed(2) });
  }
  return out;
}
