"use client";
import { useState } from "react";
import HealthCell from "./ui/HealthCell";
import { gradeTone } from "../lib/fundHealth";
import { short } from "../lib/format";
import { track } from "../lib/track";

const pct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);

export default function ScreenerTableClient({ rows, total, asOf, confLabel }) {
  const [selectedCodes, setSelectedCodes] = useState([]);

  const toggleSelect = (code) => {
    setSelectedCodes((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : prev.length >= 4 ? prev : [...prev, code];
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedCodes([]);
  };

  const handleCompareClick = () => {
    if (!selectedCodes.length) return;
    track("screener_compare_triggered", { count: selectedCodes.length });
    window.location.href = `/compare?funds=${selectedCodes.join(",")}`;
  };

  return (
    <div className="relative">
      
      {/* Table container */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white/[0.01]">
        <table className="w-full border-collapse text-[12.5px] text-left">
          <thead>
            <tr className="border-b border-line bg-white/[0.01] text-[10px] uppercase font-bold tracking-wider text-ink-faint">
              <th className="px-4 py-3.5 w-[50px] text-center">Compare</th>
              <th className="px-4 py-3.5">Fund Details</th>
              <th className="px-4 py-3.5 text-right">Pulse Health</th>
              <th className="px-4 py-3.5 text-right">1-Month</th>
              <th className="px-4 py-3.5 text-right">1-Year</th>
              <th className="px-4 py-3.5 text-right">90d Vol</th>
              <th className="px-4 py-3.5 text-right">90d MaxDD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isChecked = selectedCodes.includes(r.code);
              return (
                <tr
                  key={r.code}
                  className={`border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors ${
                    isChecked ? "bg-accent/5 border-accent/20" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!isChecked && selectedCodes.length >= 4}
                      onChange={() => toggleSelect(r.code)}
                      className="h-4 w-4 rounded border-line bg-white/[0.03] text-accent focus:ring-accent/40"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <a className="font-bold text-white hover:text-accent-soft text-[13px] block leading-tight" href={`/fund/${r.code}`}>
                      {short(r.name)}
                    </a>
                    <span className="block text-[11px] text-ink-faint mt-1">
                      {r.amc} · {r.category} · {r.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <HealthCell score={r._h} grade={r._g} tone={r._h != null ? gradeTone(r._g) : null} />
                  </td>
                  <td className="px-4 py-3 text-right align-middle font-mono">{pct(r.r1m)}</td>
                  <td className="px-4 py-3 text-right align-middle font-mono">{pct(r.r1y)}</td>
                  <td className="px-4 py-3 text-right align-middle font-mono">
                    {r.vol90 == null ? <span className="text-ink-faint">—</span> : <span className="text-ink-muted">{r.vol90}</span>}
                  </td>
                  <td className="px-4 py-3 text-right align-middle font-mono">
                    {r.maxdd90 == null ? <span className="text-ink-faint">—</span> : <span className="text-neg">{r.maxdd90}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3.5 text-[11px] text-ink-faint leading-relaxed">
        Sorted by {confLabel}. Health = MF Pulse Fund Health Score. Direct & Regular ranked separately. Source: AMFI. As of {asOf}. Check checkboxes on the left to batch compare side-by-side.
      </p>

      {/* Floating Action Compare Panel */}
      {selectedCodes.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 animate-slide-up">
          <div className="rounded-2xl border border-white/[0.08] bg-[#090b11]/95 px-5 py-3.5 shadow-2xl backdrop-blur-md flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-[12.5px] font-bold text-white">Compare Workspace</div>
              <p className="text-[11px] text-ink-faint">
                {selectedCodes.length} of 4 funds selected.
              </p>
            </div>
            
            <div className="flex gap-2">
              <a
                href={`/research?import_funds=${selectedCodes.join(",")}`}
                className="rounded-xl border border-accent/40 bg-accent/15 px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-accent/25 transition-colors flex items-center"
              >
                Model Strategy
              </a>
              <button
                onClick={handleCompareClick}
                className="rounded-xl bg-accent px-4 py-2 text-[12.5px] font-bold text-white hover:bg-accent/80 transition-colors"
              >
                Compare
              </button>
              <button
                onClick={clearSelection}
                className="rounded-xl border border-line bg-white/[0.04] px-3.5 py-2 text-[12.5px] font-semibold text-ink-muted hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
