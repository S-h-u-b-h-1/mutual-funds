"use client";

import { useEffect, useState } from "react";
import { fundsApi } from "../../lib/invest/api";

export default function SchemePicker({ value, onChange, label = "Choose a scheme", required = true, id = "scheme-picker", allowedCodes = null, planFilter = null, disabled = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const allowedCodesKey = allowedCodes?.join(",") || "";
  useEffect(() => { if (value?.name && !query) setQuery(value.name); }, [value, query]);
  useEffect(() => {
    const text = query.trim();
    if (value?.name === text || text.length < 2) { setResults([]); return undefined; }
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fundsApi.search(text, { plan: planFilter });
        setResults((response.results || []).filter((fund) => {
          if (fund.kind && fund.kind !== "fund") return false;
          if (allowedCodes && !allowedCodes.includes(fund.code)) return false;
          return planFilter !== "regular" || (!fund.isDirect && /\bregular\b/i.test(String(fund.plan || fund.name || "")));
        }));
      }
      catch (err) { setResults([]); setError(err.message || "Scheme search is unavailable."); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, value, allowedCodes, allowedCodesKey, planFilter]);
  function choose(fund) {
    setQuery(fund.name || ""); setResults([]);
    onChange({ code: fund.code, name: fund.name, amc: fund.amc, category: fund.category, plan: fund.plan, option: fund.isIdcw ? "IDCW" : "Growth", nav: fund.nav, navDate: fund.navDate });
  }
  return <div className="relative">
    <label htmlFor={id} className="text-xs font-semibold text-ink-muted">{label}</label>
    <input id={id} className="mt-2 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50" value={query} onChange={(event) => { setQuery(event.target.value); if (value) onChange(null); }} placeholder={planFilter === "regular" ? "Search Regular-plan funds" : "Search by fund name, AMC or category"} required={required} autoComplete="off" disabled={disabled} />
    {loading && <p className="mt-2 text-xs text-ink-faint" role="status">Searching schemes…</p>}
    {error && <p className="mt-2 text-xs text-neg" role="alert">{error}</p>}
    {results.length > 0 && <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-float">{results.map((fund) => <button type="button" key={fund.code} onClick={() => choose(fund)} className="block min-h-14 w-full rounded-xl px-3 py-2 text-left hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"><span className="block break-words text-sm font-semibold text-ink">{fund.name}</span><span className="mt-1 block text-[11px] text-ink-faint">{fund.amc || "AMC unavailable"} · {fund.plan || "Plan unavailable"} · {fund.isIdcw ? "IDCW" : "Growth"}</span></button>)}</div>}
    {value && <p className="mt-2 text-xs leading-5 text-ink-muted">Selected: <strong className="text-ink">{value.name}</strong>{value.plan ? ` · ${value.plan}` : ""}{value.option ? ` · ${value.option}` : ""}</p>}
    {!value && query.length >= 2 && !loading && !results.length && !error && <p className="mt-2 text-xs text-ink-faint">No matching schemes found. Try the fund name or AMC.</p>}
  </div>;
}
