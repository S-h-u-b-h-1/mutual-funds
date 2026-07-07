"use client";
import { useMemo } from "react";

const W = 760, H = 140, PAD = 28;
const WINDOW = 30; // rolling trading-day window
const SQRT252 = Math.sqrt(252);

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

export default function VolatilityChart({ points, hoveredDate, setHoveredDate, days }) {
  const series = useMemo(() => rollingVol(points), [points]);

  // Filter series based on selected day range to align X-axis with NavChart
  const filteredSeries = useMemo(() => {
    if (!series) return null;
    if (!points || points.length === 0) return series;
    const cutoff = points[points.length - 1].t;
    const start = new Date(cutoff);
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);
    return days >= 99999 ? series : series.filter((p) => p.t >= startStr);
  }, [series, points, days]);

  // Find index corresponding to shared hoveredDate
  const activeHoveredIndex = useMemo(() => {
    if (!hoveredDate || !filteredSeries) return null;
    const idx = filteredSeries.findIndex((p) => p.t === hoveredDate);
    return idx === -1 ? null : idx;
  }, [hoveredDate, filteredSeries]);

  if (!filteredSeries || filteredSeries.length < 2)
    return <div className="grid h-[110px] place-items-center text-[12.5px] text-ink-faint">Not enough daily history for rolling volatility (needs 35+ trading days).</div>;

  const vals = filteredSeries.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  
  const x = (i) => PAD + (i / (filteredSeries.length - 1)) * (W - 2 * PAD);
  const y = (v) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const line = filteredSeries.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const latest = vals[vals.length - 1];

  const stroke = "var(--warn, #fbbf24)";

  // Mouse / Touch interaction handlers updating shared hoveredDate
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * W;
    const spanWidth = W - 2 * PAD;
    const approxIndex = ((svgX - PAD) / spanWidth) * (filteredSeries.length - 1);
    const index = Math.max(0, Math.min(filteredSeries.length - 1, Math.round(approxIndex)));
    if (setHoveredDate) {
      setHoveredDate(filteredSeries[index].t);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches[0].clientX - rect.left;
    const svgX = (clientX / rect.width) * W;
    const spanWidth = W - 2 * PAD;
    const approxIndex = ((svgX - PAD) / spanWidth) * (filteredSeries.length - 1);
    const index = Math.max(0, Math.min(filteredSeries.length - 1, Math.round(approxIndex)));
    if (setHoveredDate) {
      setHoveredDate(filteredSeries[index].t);
    }
  };

  const handleMouseLeave = () => {
    if (setHoveredDate) {
      setHoveredDate(null);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[12px] min-h-[22px]">
        <span className="text-ink-muted">Rolling {WINDOW}-day annualised volatility</span>
        <span className="tnum font-semibold text-ink">
          {activeHoveredIndex !== null ? `${filteredSeries[activeHoveredIndex].v.toFixed(2)}%` : `${latest.toFixed(1)}%`}
        </span>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full select-none cursor-crosshair overflow-visible"
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          onMouseLeave={handleMouseLeave}
          onTouchEnd={handleMouseLeave}
        >
          {/* Chart path */}
          <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" />

          {/* Synced Crosshairs & Dot */}
          {activeHoveredIndex !== null && (
            <>
              {/* Vertical crosshair */}
              <line
                x1={x(activeHoveredIndex)}
                y1={PAD}
                x2={x(activeHoveredIndex)}
                y2={H - PAD}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray="3 3"
              />
              {/* Horizontal crosshair */}
              <line
                x1={PAD}
                y1={y(filteredSeries[activeHoveredIndex].v)}
                x2={W - PAD}
                y2={y(filteredSeries[activeHoveredIndex].v)}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
              />
              {/* Glowing point halo */}
              <circle
                cx={x(activeHoveredIndex)}
                cy={y(filteredSeries[activeHoveredIndex].v)}
                r="5"
                fill={stroke}
                opacity="0.3"
              />
              {/* Glowing point inner */}
              <circle
                cx={x(activeHoveredIndex)}
                cy={y(filteredSeries[activeHoveredIndex].v)}
                r="2.5"
                fill={stroke}
                stroke="#06080f"
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>
      </div>

      <p className="mt-1.5 text-[10.5px] text-ink-faint">
        Computed from trailing window returns · {min.toFixed(1)}%–{max.toFixed(1)}% range over period · last updated {filteredSeries[filteredSeries.length - 1].t}.
      </p>
    </div>
  );
}
