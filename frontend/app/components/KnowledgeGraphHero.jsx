"use client";

import { useMemo, useState } from "react";

const PALETTE = {
  Equity: "bg-pos",
  Debt: "bg-[rgb(var(--color-information))]",
  Hybrid: "bg-warn",
  Other: "bg-ink-faint",
};

function slug(value) {
  return encodeURIComponent(value || "");
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className="financial-number mt-1 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

export default function KnowledgeGraphHero({ classes, amcs, fundCount, amcCount, categoryCount, benchmarkCount, categories = [], totals = {} }) {
  const [assetClass, setAssetClass] = useState("All");
  const [selectedAmc, setSelectedAmc] = useState(amcs[0]?.amc || "");

  const filteredAmcs = useMemo(() => {
    if (assetClass === "All") return amcs;
    return amcs.filter((amc) => (amc.classBreakdown?.[assetClass] || 0) > 0);
  }, [amcs, assetClass]);

  const selected = filteredAmcs.find((amc) => amc.amc === selectedAmc) || filteredAmcs[0] || amcs[0];
  const maxAmc = Math.max(...amcs.map((a) => a.total), 1);

  return (
    <section aria-labelledby="universe-explorer-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">Verified scheme metadata</div>
          <h3 id="universe-explorer-title" className="mt-2 text-xl font-semibold tracking-[-0.04em] text-ink">Explore the Indian mutual-fund universe</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Navigate AMCs, asset classes, categories and investable plan variants using current AMFI scheme metadata. This is not a fund-flow chart.</p>
        </div>
        <button type="button" onClick={() => { setAssetClass("All"); setSelectedAmc(amcs[0]?.amc || ""); }} className="rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:text-ink">Reset graph</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Schemes" value={fundCount.toLocaleString("en-IN")} />
        <Stat label="AMCs" value={amcCount} />
        <Stat label="Categories" value={categoryCount} />
        <Stat label="Benchmarks" value={benchmarkCount} />
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Asset class filter">
        {["All", ...classes.map((c) => c.name)].map((name) => (
          <button key={name} type="button" onClick={() => setAssetClass(name)} aria-pressed={assetClass === name} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${assetClass === name ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-ink-muted hover:text-ink"}`}>{name}</button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-[1.5rem] border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between text-xs text-ink-faint">
            <span>Top AMCs by registered scheme-code options</span>
            <span>node size = fund count</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" role="list" aria-label="AMC universe nodes">
            {filteredAmcs.map((amc) => {
              const active = selected?.amc === amc.amc;
              const scale = 0.74 + (amc.total / maxAmc) * 0.52;
              return (
                <button key={amc.amc} type="button" role="listitem" onClick={() => setSelectedAmc(amc.amc)} className={`min-h-24 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-accent/40 ${active ? "border-accent bg-accent/10 shadow-glow" : "border-line bg-surface-2"}`} aria-pressed={active}>
                  <span className={`block h-2.5 w-2.5 rounded-full ${PALETTE[amc.dominantClass] || PALETTE.Other}`} style={{ transform: `scale(${scale})` }} aria-hidden="true" />
                  <span className="mt-3 block text-[12px] font-semibold leading-snug text-ink">{amc.amc.replace(" Mutual Fund", "")}</span>
                  <span className="financial-number mt-1 block text-[11px] text-ink-faint">{amc.total} schemes · {amc.dominantClass}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[1.5rem] border border-line bg-surface p-5">
          {selected ? (
            <>
              <div className="eyebrow">Selected AMC</div>
              <h4 className="mt-2 text-lg font-semibold text-ink">{selected.amc}</h4>
              <p className="mt-2 text-xs leading-5 text-ink-muted">{selected.total} scheme-code options · dominant asset class {selected.dominantClass}{selected.benchmark ? ` · common benchmark ${selected.benchmark}` : ""}</p>
              <div className="mt-5 space-y-3">
                {Object.entries(selected.classBreakdown || {}).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between text-xs"><span className="text-ink-muted">{name}</span><span className="financial-number text-ink">{count}</span></div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-strong"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (count / selected.total) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Top categories</div>
                <div className="mt-2 flex flex-wrap gap-2">{(selected.categories || []).map((cat) => <a key={cat.name} href={`/categories/${slug(cat.name)}`} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted hover:text-ink">{cat.name} · {cat.count}</a>)}</div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={`/amc/${slug(`${selected.amc} Mutual Fund`)}`} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bg">Open AMC</a>
                <a href={`/compare?amcs=${slug(`${selected.amc} Mutual Fund`)}`} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink">Compare AMC</a>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Select an AMC to inspect coverage.</p>
          )}
        </aside>
      </div>

      <div className="grid gap-2 text-xs text-ink-muted sm:grid-cols-4">
        <div>Direct: <b className="financial-number text-ink">{totals.direct ?? "—"}</b></div>
        <div>Regular: <b className="financial-number text-ink">{totals.regular ?? "—"}</b></div>
        <div>Growth: <b className="financial-number text-ink">{totals.growth ?? "—"}</b></div>
        <div>IDCW: <b className="financial-number text-ink">{totals.idcw ?? "—"}</b></div>
      </div>

      <div className="rounded-2xl border border-line bg-surface-2 p-4 md:hidden">
        <div className="eyebrow">Mobile category fallback</div>
        <div className="mt-3 space-y-2">
          {categories.slice(0, 8).map((category) => (
            <a key={category.name} href={`/categories/${slug(category.name)}`} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm"><span className="font-medium text-ink">{category.name}</span><span className="financial-number text-ink-faint">{category.count}</span></a>
          ))}
        </div>
      </div>
    </section>
  );
}
