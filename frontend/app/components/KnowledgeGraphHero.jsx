"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import KnowledgeGraphStatic from "./KnowledgeGraphStatic";

// Lazy-load the 3D layer only on the client, only when used — matches HeroVisual.jsx's pattern.
const KnowledgeGraph3D = dynamic(() => import("./visuals/KnowledgeGraph3D"), { ssr: false });

const PALETTE = ["#34d399", "#60a5fa", "#fbbf24", "#c084fc", "#94a3b8"];

// A real ecosystem graph, not decoration: node size = actual fund count per AMC, edges = an
// AMC's dominant asset class (both 100%-coverage facts, computed live from funds.json).
export default function KnowledgeGraphHero({ classes, amcs, fundCount, amcCount, categoryCount, benchmarkCount }) {
  // SSR + first client render = static SVG (matches markup, no layout shift, no blocked paint).
  const [three, setThree] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 820;
    if (!reduced && !small) setThree(true);
  }, []);

  return (
    <div>
      {three ? <KnowledgeGraph3D classes={classes} amcs={amcs} /> : <KnowledgeGraphStatic classes={classes} amcs={amcs} />}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-faint">
        {classes.slice(0, 5).map((c, i) => (
          <span key={c.name} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{c.name}</span>
        ))}
        <span>· node size = real fund count per AMC</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
        {fundCount.toLocaleString("en-IN")} funds · {amcCount} AMCs · {categoryCount} categories · {benchmarkCount} benchmarks — one connected research graph, computed from AMFI NAV, not illustrative.
      </p>
    </div>
  );
}
