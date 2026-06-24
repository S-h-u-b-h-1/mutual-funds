"use client";
import { useMemo, useState } from "react";
import { track } from "../lib/track";

const RANGES = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["Max", 99999]];
const W = 760, H = 240, PAD = 28;

export default function NavChart({ points, code }) {
  const [days, setDays] = useState(91);

  const view = useMemo(() => {
    if (!points?.length) return null;
    const cutoff = points[points.length - 1].t;
    const start = new Date(cutoff);
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);
    const slice = days >= 99999 ? points : points.filter((p) => p.t >= startStr);
    if (slice.length < 2) return null;

    const vals = slice.map((p) => p.v);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const x = (i) => PAD + (i / (slice.length - 1)) * (W - 2 * PAD);
    const y = (v) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);

    const line = slice.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(slice.length - 1).toFixed(1)} ${H - PAD} L${x(0).toFixed(1)} ${H - PAD} Z`;
    const iMax = vals.indexOf(max), iMin = vals.indexOf(min);
    // max drawdown within the window
    let peak = vals[0], ddPct = 0, ddAt = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] > peak) peak = vals[i];
      const dd = (vals[i] - peak) / peak;
      if (dd < ddPct) { ddPct = dd; ddAt = i; }
    }
    const ret = ((slice[slice.length - 1].v - slice[0].v) / slice[0].v) * 100;
    return { slice, x, y, line, area, min, max, iMax, iMin, ret, ddPct: ddPct * 100, ddAt };
  }, [points, days]);

  if (!points?.length)
    return <div className="grid h-[200px] place-items-center text-[13px] text-ink-faint">NAV history unavailable for this scheme.</div>;
  if (!view)
    return <div className="grid h-[200px] place-items-center text-[13px] text-ink-faint">Insufficient history for this range.</div>;

  const up = view.ret >= 0;
  const stroke = up ? "var(--pos, #34d399)" : "var(--neg, #f87171)";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px]">
          <span className="text-ink-muted">Range return </span>
          <span className={up ? "text-pos tnum font-semibold" : "text-neg tnum font-semibold"}>{up ? "+" : ""}{view.ret.toFixed(2)}%</span>
          <span className="ml-3 text-ink-faint tnum">max drawdown {view.ddPct.toFixed(1)}%</span>
        </div>
        <div className="flex gap-1">
          {RANGES.map(([l, d]) => (
            <button
              key={l}
              onClick={() => { setDays(d); track("time_range_changed", { code, range: l }); }}
              className={`rounded-md px-2 py-1 text-[11.5px] transition-colors ${days === d ? "bg-white/[0.08] text-ink" : "text-ink-faint hover:text-ink-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="NAV history chart">
        <defs>
          <linearGradient id="navfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={view.area} fill="url(#navfill)" />
        <path d={view.line} fill="none" stroke={stroke} strokeWidth="1.6" />
        {/* high / low markers */}
        <circle cx={view.x(view.iMax)} cy={view.y(view.max)} r="3" fill="var(--pos, #34d399)" />
        <text x={view.x(view.iMax)} y={view.y(view.max) - 6} fill="#9aa3b5" fontSize="10" textAnchor="middle">₹{view.max.toFixed(1)}</text>
        <circle cx={view.x(view.iMin)} cy={view.y(view.min)} r="3" fill="var(--neg, #f87171)" />
        <text x={view.x(view.iMin)} y={view.y(view.min) + 14} fill="#9aa3b5" fontSize="10" textAnchor="middle">₹{view.min.toFixed(1)}</text>
      </svg>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-faint">
        <span>{view.slice[0].t}</span>
        <span>{view.slice[view.slice.length - 1].t}</span>
      </div>
    </div>
  );
}
