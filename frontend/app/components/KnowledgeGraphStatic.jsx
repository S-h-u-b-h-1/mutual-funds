// SSR-safe static fallback for the knowledge-graph hero — same layout dimensions as the
// Three.js version so swapping between them never shifts layout. Pure SVG, deterministic,
// zero client JS required. Renders first paint on every device, including reduced-motion,
// mobile, and no-WebGL. Same real data (asset-class hubs + top AMCs by real fund count).
const PALETTE = ["#34d399", "#60a5fa", "#fbbf24", "#c084fc", "#94a3b8"];

export default function KnowledgeGraphStatic({ classes = [], amcs = [] }) {
  if (!classes.length) return null;
  const W = 820, H = 320, cx = W / 2, cy = H / 2;
  const hubR = 118;
  const hubs = classes.map((c, i) => {
    const ang = (i / classes.length) * Math.PI * 2 - Math.PI / 2;
    return { ...c, x: cx + Math.cos(ang) * hubR, y: cy + Math.sin(ang) * hubR * 0.72, color: PALETTE[i % PALETTE.length] };
  });
  const byHub = {};
  for (const h of hubs) byHub[h.name] = h;
  const maxFunds = Math.max(...amcs.map((a) => a.total), 1);
  const list = amcs.slice(0, 18);
  const perHub = {};
  const nodes = list.map((a) => {
    const hub = byHub[a.dominantClass];
    if (!hub) return null;
    const idx = (perHub[a.dominantClass] ||= 0);
    perHub[a.dominantClass]++;
    const siblings = list.filter((x) => x.dominantClass === a.dominantClass).length;
    const ang = (idx / Math.max(siblings, 1)) * Math.PI * 2;
    const reach = 46 + (a.total / maxFunds) * 58;
    return { ...a, x: hub.x + Math.cos(ang) * reach, y: hub.y + Math.sin(ang) * reach * 0.8, color: hub.color, r: 2.5 + (a.total / maxFunds) * 6.5 };
  }).filter(Boolean);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="MF Pulse fund ecosystem graph — AMCs connected to asset classes by real fund count">
      {nodes.map((n) => (
        <path key={`e-${n.amc}`} d={`M${n.x},${n.y} Q${(n.x + byHub[n.dominantClass].x) / 2},${(n.y + byHub[n.dominantClass].y) / 2 - 8} ${byHub[n.dominantClass].x},${byHub[n.dominantClass].y}`}
          fill="none" stroke={n.color} strokeOpacity="0.16" strokeWidth="1" />
      ))}
      {hubs.map((h) => (
        <g key={h.name}>
          <circle cx={h.x} cy={h.y} r="16" fill={h.color} fillOpacity="0.12" />
          <circle cx={h.x} cy={h.y} r="7" fill={h.color} />
          <text x={h.x} y={h.y + 26} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#c7cedd">{h.name}</text>
        </g>
      ))}
      {nodes.map((n) => (
        <circle key={n.amc} cx={n.x} cy={n.y} r={n.r} fill={n.color} fillOpacity="0.85" />
      ))}
    </svg>
  );
}
