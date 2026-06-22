// Pure-SVG sparkline (server-rendered). Points: [[date, value], ...] normalised to 100.
export default function Sparkline({ points, width = 280, height = 60 }) {
  if (!points || points.length < 2) return null;
  const vals = points.map((p) => p[1]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const n = points.length;
  const x = (i) => (i / (n - 1)) * width;
  const y = (v) => height - 4 - ((v - min) / range) * (height - 8);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");

  const first = vals[0];
  const last = vals[n - 1];
  const up = last >= first;
  const pct = ((last - first) / first) * 100;
  const color = up ? "#22c55e" : "#f87171";

  return (
    <div className="spark">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity="0.08" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className="spark-pct" style={{ color }}>
        {up ? "▲" : "▼"} {pct.toFixed(2)}%
      </span>
    </div>
  );
}
