"use client";
import { useState } from "react";
import Sparkline from "./Sparkline";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);

export default function CompareClient({ amcs, meta = {} }) {
  const names = Object.keys(amcs);
  const change = (n) => {
    const p = amcs[n];
    return p[p.length - 1][1] - p[0][1];
  };
  const sorted = [...names].sort((a, b) => change(b) - change(a));
  const [sel, setSel] = useState(sorted.slice(0, 3));

  function toggle(n) {
    setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : s.length >= 4 ? s : [...s, n]));
  }

  const rows = [
    { label: "30-day equity index Δ", get: (n) => { const c = change(n); return <span className={c >= 0 ? "text-pos" : "text-neg"}>{c >= 0 ? "+" : ""}{c.toFixed(2)}</span>; } },
    { label: "Equity schemes", get: (n) => fmt(meta[n]?.equity || 0) },
    { label: "Total schemes", get: (n) => fmt(meta[n]?.total || 0) },
    { label: "Asset classes", get: (n) => meta[n]?.classes || "—" },
  ];

  return (
    <div>
      <div className="mb-2 text-[12px] text-ink-faint">Select up to 4 AMCs ({sel.length}/4)</div>
      <div className="mb-6 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
        {sorted.map((n) => {
          const active = sel.includes(n);
          return (
            <button
              key={n}
              onClick={() => toggle(n)}
              className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${active ? "border-accent/40 bg-accent/15 text-ink" : "border-line text-ink-muted hover:text-ink"}`}
            >
              {n.replace(" Mutual Fund", "")}
            </button>
          );
        })}
      </div>

      {sel.length === 0 ? (
        <div className="text-[13px] text-ink-muted">Select an AMC above to begin.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sel.map((n) => {
              const c = change(n);
              return (
                <div key={n} className="glass p-5">
                  <div className="truncate text-[13px] font-semibold text-ink">{n.replace(" Mutual Fund", "")}</div>
                  <div className={`mt-1 text-2xl font-bold tnum ${c >= 0 ? "text-pos" : "text-neg"}`}>{c >= 0 ? "+" : ""}{c.toFixed(2)}</div>
                  <div className="text-[11px] text-ink-faint">30-day equity index Δ</div>
                  <div className="mt-3"><Sparkline points={amcs[n]} height={44} /></div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-white/[0.015]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-3.5 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">Metric</th>
                  {sel.map((n) => (
                    <th key={n} className="px-3.5 py-2.5 text-right text-[12px] font-semibold text-ink">
                      <a className="hover:text-accent-soft" href={`/amc/${encodeURIComponent(n)}`}>{n.replace(" Mutual Fund", "")}</a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-line/60 last:border-0">
                    <td className="px-3.5 py-2.5 text-ink-muted">{row.label}</td>
                    {sel.map((n) => (
                      <td key={n} className="px-3.5 py-2.5 text-right tnum text-ink">{row.get(n)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
