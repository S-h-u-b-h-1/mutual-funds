// Small, reusable SVG/CSS visual primitives (Fund Research Engine, Phase 8 — Visual
// Storytelling). Pure presentational, no data fetching — every one of these renders a real
// number or series already computed elsewhere. Deliberately minimal: the goal is reducing
// cognitive load on an existing page, not a redesign.

// Trend arrow — direction at a glance. `value` should already be centered at 0 (pass
// score-50 for a 0-100 pace score, or a raw signed delta).
export function TrendArrow({ value, size = 11 }) {
  if (value == null) return null;
  const up = value > 3;
  const down = value < -3;
  const symbol = up ? "▲" : down ? "▼" : "▬";
  const tone = up ? "text-pos" : down ? "text-neg" : "text-ink-faint";
  return (
    <span className={`${tone} inline-block leading-none`} style={{ fontSize: size }} aria-hidden="true">
      {symbol}
    </span>
  );
}

// Percentile / score bar — 0-100, with an optional marker (e.g. a category-average reference
// point) so "where do I stand vs. average" reads instantly instead of requiring a mental diff.
export function PercentileBar({ value, markerValue, markerLabel, tone = "accent" }) {
  const barTone = { accent: "bg-accent-soft", pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" }[tone] || "bg-accent-soft";
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-strong">
      <div className={`h-full rounded-full ${barTone}`} style={{ width: `${v}%` }} />
      {markerValue != null && (
        <div
          className="absolute top-0 h-full w-px bg-ink-faint/70"
          style={{ left: `${Math.max(0, Math.min(100, markerValue))}%` }}
          title={markerLabel || `Reference: ${markerValue}`}
        />
      )}
    </div>
  );
}

// Sparkline — minimal line chart for a real numeric series (e.g. a rolling-return series). No
// axes, no interaction — just shape, for at-a-glance pattern recognition. Renders nothing when
// there isn't enough real data for a shape to mean anything.
export function Sparkline({ values, width = 120, height = 32 }) {
  if (!values || values.length < 3) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
  const lineTone = values[values.length - 1] >= values[0] ? "stroke-pos" : "stroke-neg";
  // A zero-line only when the series actually crosses zero — free "above/below zero" context.
  const zeroY = max > 0 && min < 0 ? height - ((0 - min) / range) * height : null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" role="img" aria-label="Trend sparkline">
      {zeroY != null && <line x1="0" y1={zeroY} x2={width} y2={zeroY} className="stroke-line" strokeWidth="1" strokeDasharray="2,2" />}
      <polyline points={points} fill="none" className={lineTone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Gauge — a fixed-range dial for a metric with a meaningful reference point (e.g. Beta, where
// 1.0 means "moves exactly with the benchmark"). Tone reflects distance from the reference, not
// absolute value — being far from 1.0 in either direction is equally notable.
export function Gauge({ value, min = 0, max = 2, refValue = 1, label }) {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const refPct = Math.max(0, Math.min(100, ((refValue - min) / (max - min)) * 100));
  const dist = Math.abs(value - refValue);
  const tone = dist < 0.15 ? "bg-pos" : dist < 0.4 ? "bg-warn" : "bg-neg";
  return (
    <div className="w-full">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-strong">
        <div className={`absolute top-0 h-full w-1.5 rounded-full ${tone}`} style={{ left: `calc(${pct}% - 3px)` }} />
        <div className="absolute top-0 h-full w-px bg-ink-faint/60" style={{ left: `${refPct}%` }} title={`Reference: ${refValue}`} />
      </div>
      <div className="flex justify-between text-[9.5px] text-ink-faint mt-0.5">
        <span>{min}</span>
        {label && <span>{label}</span>}
        <span>{max}</span>
      </div>
    </div>
  );
}
