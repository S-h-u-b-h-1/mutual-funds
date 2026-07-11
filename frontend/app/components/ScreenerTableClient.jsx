"use client";

import { useState } from "react";
import HealthCell from "./ui/HealthCell";
import { gradeTone } from "../lib/fundHealth";
import { short } from "../lib/format";
import { track } from "../lib/track";

function Percent({ value }) {
  if (value == null) return <span className="text-missing">Not available</span>;
  return <span className={value >= 0 ? "text-pos" : "text-neg"}><span className="sr-only">{value >= 0 ? "Positive" : "Negative"} </span>{value >= 0 ? "+" : ""}{value.toFixed(1)}%</span>;
}

export default function ScreenerTableClient({ rows, asOf, confLabel }) {
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [view, setView] = useState("table");

  function toggleSelect(code) {
    setSelectedCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : current.length >= 4 ? current : [...current, code]);
  }

  function compare() {
    if (!selectedCodes.length) return;
    track("screener_compare_triggered", { count: selectedCodes.length });
    window.location.href = `/compare?funds=${selectedCodes.join(",")}`;
  }

  return (
    <div>
      <div className="mb-3 hidden items-center justify-end gap-1 sm:flex" aria-label="Result view">
        <button type="button" onClick={() => setView("table")} aria-pressed={view === "table"} className={`min-h-9 rounded-lg px-3 text-xs font-medium ${view === "table" ? "bg-accent/10 text-accent" : "text-ink-muted"}`}>Research table</button>
        <button type="button" onClick={() => setView("cards")} aria-pressed={view === "cards"} className={`min-h-9 rounded-lg px-3 text-xs font-medium ${view === "cards" ? "bg-accent/10 text-accent" : "text-ink-muted"}`}>Comfortable cards</button>
      </div>

      <div className={`${view === "cards" ? "sm:grid" : "sm:hidden"} grid gap-3 sm:grid-cols-2 xl:grid-cols-3`}>
        {rows.map((fund) => {
          const checked = selectedCodes.includes(fund.code);
          return <article key={fund.code} className={`rounded-2xl border p-4 ${checked ? "border-accent bg-accent/5" : "border-line bg-surface"}`}><div className="flex items-start gap-3"><input aria-label={`Select ${short(fund.name)} for comparison`} type="checkbox" checked={checked} disabled={!checked && selectedCodes.length >= 4} onChange={() => toggleSelect(fund.code)} className="mt-1 h-5 w-5 rounded border-line text-accent" /><div className="min-w-0"><a href={`/fund/${fund.code}`} className="text-sm font-semibold leading-snug text-ink hover:text-accent">{short(fund.name)}</a><p className="mt-1 text-xs leading-5 text-ink-faint">{fund.amc} · {fund.category}<br />{fund.isDirect ? "Direct" : "Regular"} · {fund.isIdcw ? "IDCW" : "Growth"}</p></div></div><dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs"><div><dt className="text-ink-faint">Health</dt><dd className="mt-1"><HealthCell score={fund._h} grade={fund._g} tone={fund._h != null ? gradeTone(fund._g) : null} /></dd></div><div><dt className="text-ink-faint">1 month</dt><dd className="financial-number mt-1"><Percent value={fund.r1m} /></dd></div><div><dt className="text-ink-faint">1 year</dt><dd className="financial-number mt-1"><Percent value={fund.r1y} /></dd></div></dl><div className="mt-3 flex justify-between text-[11px] text-ink-faint"><span>NAV {fund.navDate || "unknown"}</span><span>{fund.r1y == null ? "1Y data missing" : "1Y available"}</span></div></article>;
        })}
      </div>

      <div className={`${view === "table" ? "sm:block" : "sm:hidden"} hidden overflow-x-auto rounded-2xl border border-line bg-surface`}>
        <table className="w-full min-w-[880px] border-collapse text-left text-[12.5px]">
          <caption className="sr-only">Fund research results sorted by {confLabel}</caption>
          <thead className="sticky top-0 z-10 bg-surface-2"><tr className="border-b border-line text-[10px] font-medium uppercase tracking-[0.1em] text-ink-faint"><th className="sticky left-0 w-14 bg-surface-2 px-4 py-3 text-center">Select</th><th className="sticky left-14 min-w-[320px] bg-surface-2 px-4 py-3">Fund</th><th className="px-4 py-3 text-right">Health</th><th className="px-4 py-3 text-right">1 month</th><th className="px-4 py-3 text-right">1 year</th><th className="px-4 py-3 text-right">90d volatility</th><th className="px-4 py-3 text-right">90d drawdown</th><th className="px-4 py-3 text-right">NAV date</th></tr></thead>
          <tbody>{rows.map((fund) => { const checked = selectedCodes.includes(fund.code); return <tr key={fund.code} className={`border-b border-line last:border-0 hover:bg-surface-2 ${checked ? "bg-accent/5" : ""}`}><td className="sticky left-0 bg-surface px-4 py-3 text-center"><input aria-label={`Select ${short(fund.name)} for comparison`} type="checkbox" checked={checked} disabled={!checked && selectedCodes.length >= 4} onChange={() => toggleSelect(fund.code)} className="h-5 w-5 rounded border-line text-accent" /></td><td className="sticky left-14 bg-surface px-4 py-3"><a href={`/fund/${fund.code}`} className="block text-[13px] font-semibold text-ink hover:text-accent">{short(fund.name)}</a><span className="mt-1 block text-[11px] text-ink-faint">{fund.amc} · {fund.category} · {fund.isDirect ? "Direct" : "Regular"} · {fund.isIdcw ? "IDCW" : "Growth"}</span></td><td className="px-4 py-3 text-right"><HealthCell score={fund._h} grade={fund._g} tone={fund._h != null ? gradeTone(fund._g) : null} /></td><td className="financial-number px-4 py-3 text-right"><Percent value={fund.r1m} /></td><td className="financial-number px-4 py-3 text-right"><Percent value={fund.r1y} /></td><td className="financial-number px-4 py-3 text-right text-ink-muted">{fund.vol90 ?? "Missing"}</td><td className="financial-number px-4 py-3 text-right text-ink-muted">{fund.maxdd90 ?? "Missing"}</td><td className="financial-number px-4 py-3 text-right text-ink-faint">{fund.navDate || "Unknown"}</td></tr>; })}</tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-ink-faint">Sorted by {confLabel}. Health is the MF Pulse deterministic Fund Health Score. Source: AMFI. As of {asOf}. Select up to four funds.</p>

      {selectedCodes.length > 0 && <aside className="fixed inset-x-3 bottom-[76px] z-[65] mx-auto max-w-2xl rounded-2xl border border-line-strong bg-surface p-3 shadow-float sm:bottom-5 sm:flex sm:items-center sm:justify-between" aria-label="Comparison selection"><div><div className="text-sm font-semibold text-ink">{selectedCodes.length} of 4 funds selected</div><p className="mt-1 text-xs text-ink-faint">Compare evidence or model the same funds as a strategy.</p></div><div className="mt-3 flex flex-wrap gap-2 sm:mt-0"><a href={`/research?import_funds=${selectedCodes.join(",")}`} className="inline-flex min-h-10 items-center rounded-xl border border-line px-3 text-xs font-semibold text-ink">Model strategy</a><button type="button" onClick={compare} className="min-h-10 rounded-xl bg-accent px-4 text-xs font-semibold text-white">Compare</button><button type="button" onClick={() => setSelectedCodes([])} className="min-h-10 rounded-xl px-3 text-xs font-medium text-ink-muted">Clear</button></div></aside>}
    </div>
  );
}
