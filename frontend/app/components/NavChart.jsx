"use client";
import { useMemo } from "react";
import { track } from "../lib/track";

const RANGES = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["Max", 99999]];
const W = 760, H = 240, PAD = 28;

export default function NavChart({ points, code, hoveredDate, setHoveredDate, days, setDays }) {
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
    
    let peak = vals[0], ddPct = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] > peak) peak = vals[i];
      const dd = (vals[i] - peak) / peak;
      if (dd < ddPct) ddPct = dd;
    }
    const ret = ((slice[slice.length - 1].v - slice[0].v) / slice[0].v) * 100;
    return { slice, x, y, line, area, min, max, iMax, iMin, ret, ddPct: ddPct * 100 };
  }, [points, days]);

  // Translate shared hoveredDate to local active index
  const activeHoveredIndex = useMemo(() => {
    if (!hoveredDate || !view) return null;
    const idx = view.slice.findIndex((p) => p.t === hoveredDate);
    return idx === -1 ? null : idx;
  }, [hoveredDate, view]);

  if (!points?.length)
    return <div className="grid h-[200px] place-items-center text-[13px] text-ink-faint">NAV history unavailable for this scheme.</div>;
  if (!view)
    return <div className="grid h-[200px] place-items-center text-[13px] text-ink-faint">Insufficient history for this range.</div>;

  const up = view.ret >= 0;
  const stroke = up ? "var(--pos, #34d399)" : "var(--neg, #f87171)";

  // Mouse / Touch handlers mapping coordinates to date strings
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * W;
    const spanWidth = W - 2 * PAD;
    const approxIndex = ((svgX - PAD) / spanWidth) * (view.slice.length - 1);
    const index = Math.max(0, Math.min(view.slice.length - 1, Math.round(approxIndex)));
    if (setHoveredDate) {
      setHoveredDate(view.slice[index].t);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches[0].clientX - rect.left;
    const svgX = (clientX / rect.width) * W;
    const spanWidth = W - 2 * PAD;
    const approxIndex = ((svgX - PAD) / spanWidth) * (view.slice.length - 1);
    const index = Math.max(0, Math.min(view.slice.length - 1, Math.round(approxIndex)));
    if (setHoveredDate) {
      setHoveredDate(view.slice[index].t);
    }
  };

  const handleMouseLeave = () => {
    if (setHoveredDate) {
      setHoveredDate(null);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between min-h-[28px]">
        {/* Dynamic Interactive Stats */}
        <div className="text-[13px]">
          {activeHoveredIndex !== null ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Date: <strong className="text-white font-semibold">{view.slice[activeHoveredIndex].t}</strong></span>
              <span className="h-1 w-1 rounded-full bg-white/20 hidden sm:inline" />
              <span>NAV: <strong className="text-accent-soft font-semibold font-mono">₹{view.slice[activeHoveredIndex].v.toFixed(4)}</strong></span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-ink-muted">Range return </span>
              <span className={up ? "text-pos tnum font-semibold" : "text-neg tnum font-semibold"}>
                {up ? "+" : ""}{view.ret.toFixed(2)}%
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
              <span className="text-ink-faint tnum">max drawdown {view.ddPct.toFixed(1)}%</span>
            </div>
          )}
        </div>
        
        {/* Range Selector */}
        <div className="flex gap-1">
          {RANGES.map(([l, d]) => (
            <button
              key={l}
              onClick={() => { setDays(d); if (setHoveredDate) setHoveredDate(null); track("time_range_changed", { code, range: l }); }}
              className={`rounded-md px-2 py-1 text-[11.5px] transition-colors ${days === d ? "bg-white/[0.08] text-ink" : "text-ink-faint hover:text-ink-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full select-none cursor-crosshair overflow-visible"
          role="img"
          aria-label="NAV history chart"
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          onMouseLeave={handleMouseLeave}
          onTouchEnd={handleMouseLeave}
        >
          <defs>
            <linearGradient id="navfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={PAD} y1={PAD} x2={W - PAD} y2={PAD} stroke="rgba(255,255,255,0.02)" />
          <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="rgba(255,255,255,0.02)" />
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgba(255,255,255,0.02)" />

          {/* Area & Line */}
          <path d={view.area} fill="url(#navfill)" />
          <path d={view.line} fill="none" stroke={stroke} strokeWidth="1.6" />

          {/* High / Low static markers */}
          {activeHoveredIndex === null && (
            <>
              <circle cx={view.x(view.iMax)} cy={view.y(view.max)} r="3" fill="var(--pos, #34d399)" />
              <text x={view.x(view.iMax)} y={view.y(view.max) - 7} fill="#8b93a7" fontSize="10" fontWeight="bold" textAnchor="middle">
                ₹{view.max.toFixed(1)}
              </text>
              <circle cx={view.x(view.iMin)} cy={view.y(view.min)} r="3" fill="var(--neg, #f87171)" />
              <text x={view.x(view.iMin)} y={view.y(view.min) + 14} fill="#8b93a7" fontSize="10" fontWeight="bold" textAnchor="middle">
                ₹{view.min.toFixed(1)}
              </text>
            </>
          )}

          {/* Hover Crosshairs & Glowing indicator */}
          {activeHoveredIndex !== null && (
            <>
              {/* Vertical crosshair */}
              <line
                x1={view.x(activeHoveredIndex)}
                y1={PAD}
                x2={view.x(activeHoveredIndex)}
                y2={H - PAD}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray="3 3"
              />
              {/* Horizontal crosshair */}
              <line
                x1={PAD}
                y1={view.y(view.slice[activeHoveredIndex].v)}
                x2={W - PAD}
                y2={view.y(view.slice[activeHoveredIndex].v)}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
              />
              {/* Outer halo */}
              <circle
                cx={view.x(activeHoveredIndex)}
                cy={view.y(view.slice[activeHoveredIndex].v)}
                r="6"
                fill={stroke}
                opacity="0.3"
              />
              {/* Inner dot */}
              <circle
                cx={view.x(activeHoveredIndex)}
                cy={view.y(view.slice[activeHoveredIndex].v)}
                r="3"
                fill={stroke}
                stroke="#06080f"
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>
      </div>

      <div className="mt-1 flex justify-between text-[10.5px] text-ink-faint font-semibold">
        <span>{view.slice[0].t}</span>
        <span>{view.slice[view.slice.length - 1].t}</span>
      </div>
    </div>
  );
}
