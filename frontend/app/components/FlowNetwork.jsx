// Product-specific flow network: AMCs (left) linked to Equity / Debt hubs (right),
// edge thickness = |net flow|, colour = direction. Pure SVG, deterministic layout.
export default function FlowNetwork({ nodes }) {
  if (!nodes || !nodes.length) return null;
  const W = 820, H = 460;
  const padTop = 56, padBot = 44;
  const ax = 168;
  const eq = { x: 636, y: 150, label: "Equity" };
  const dt = { x: 636, y: 330, label: "Debt" };
  const n = nodes.length;
  const max = Math.max(...nodes.flatMap((d) => [Math.abs(d.equity || 0), Math.abs(d.debt || 0)]), 1);
  const ys = nodes.map((_, i) => padTop + (i / Math.max(n - 1, 1)) * (H - padTop - padBot));
  const width = (v) => 1 + (Math.abs(v) / max) * 7;
  const color = (v) => (v >= 0 ? "#34d399" : "#f87171");
  const op = (v) => 0.22 + 0.5 * (Math.abs(v) / max);
  const edge = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="AMC to category fund-flow network">
      {nodes.map((d, i) => (
        <g key={d.name + "-e"}>
          <path d={edge(ax, ys[i], eq.x - 30, eq.y)} fill="none" stroke={color(d.equity || 0)} strokeWidth={width(d.equity || 0)} strokeOpacity={op(d.equity || 0)} strokeLinecap="round" />
          <path d={edge(ax, ys[i], dt.x - 30, dt.y)} fill="none" stroke={color(d.debt || 0)} strokeWidth={width(d.debt || 0)} strokeOpacity={op(d.debt || 0)} strokeLinecap="round" />
        </g>
      ))}

      {[eq, dt].map((h) => (
        <g key={h.label}>
          <circle cx={h.x} cy={h.y} r="30" fill="#0c1322" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
          <text x={h.x} y={h.y + 4} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#e9edf6">{h.label}</text>
        </g>
      ))}

      {nodes.map((d, i) => (
        <g key={d.name + "-n"}>
          <circle cx={ax} cy={ys[i]} r="5" fill="#9aa6ff" />
          <text x={ax - 14} y={ys[i] + 4} textAnchor="end" fontSize="12" fill="#c7cedd">{d.name}</text>
        </g>
      ))}
    </svg>
  );
}
