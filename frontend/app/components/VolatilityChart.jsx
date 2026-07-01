"use client";
import { useMemo } from "react";

const W = 760, H = 140, PAD = 28;
const WINDOW = 30; // rolling trading-day window
const SQRT252 = Math.sqrt(252);

// Real rolling 30-trading-day annualised volatility, computed client-side from the same daily
// NAV series already fetched for the NAV chart (mfapi.in). No estimation — every point is a
// genuine trailing-window stdev of daily returns; the series is simply too short if unavailable.
function rollingVol(points) {
  if (!points || points.length < WINDOW + 5) return null;
  const rets = [];
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1].v, p1 = points[i].v;
    rets.push({ t: points[i].t, r: p0 > 0 ? (p1 - p0) / p0 : 0 });
  }
  const series = [];
  for (let i = WINDOW; i <= rets.length; i++) {
    const win = rets.slice(i - WINDOW, i).map((x) => x.r);
    const mean = win.reduce((a, b) => a + b, 0) / win.length;
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
    series.push({ t: rets[i - 1].t, v: Math.sqrt(variance) * SQRT252 * 100 });
  }
  return series.length >= 2 ? series : null;
}

export default function VolatilityChart({ points }) {
  const series = useMemo(() => rollingVol(points), [points]);

  if (!series)
    return <div className="grid h-[110px] place-items-center text-[12.5px] text-ink-faint">Not enough daily history for a rolling volatility series (needs 35+ trading days).</div>;

  const vals = series.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => PAD + (i / (series.length - 1)) * (W - 2 * PAD);
  const y = (v) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const latest = vals[vals.length - 1];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px]">
        <span className="text-ink-muted">Rolling {WINDOW}-day annualised volatility</span>
        <span className="tnum font-semibold text-ink">{latest.toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <path d={line} fill="none" stroke="var(--warn, #fbbf24)" strokeWidth="1.75" />
      </svg>
      <p className="mt-1.5 text-[10.5px] text-ink-faint">Computed from the same daily NAV series as the chart above · {min.toFixed(1)}%–{max.toFixed(1)}% range over the period · source AMFI/MFAPI.in · last updated {series[series.length - 1].t}.</p>
    </div>
  );
}
