"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Sparkline from "./Sparkline";
import { track } from "../lib/track";
import { getComparisons, saveComparison, deleteComparison, saveWatchlist } from "../lib/cloudSync";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n || 0);
const pct = (n) => n == null || Number.isNaN(Number(n)) ? "Unavailable" : `${Number(n).toFixed(1)}%`;
const shortAmc = (name = "") => name.replace(/\s+Mutual Fund$/i, "");
const cleanFund = (name = "") => name.replace(/ - (Direct|Regular).*/i, "").replace(/\s+/g, " ").trim();

function canonicalFamily(name = "") {
  return name
    .replace(/ - (Direct|Regular).*/i, "")
    .replace(/\s+(Growth|IDCW|Dividend|Payout|Reinvestment).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function change(points = []) {
  if (points.length < 2) return null;
  return points[points.length - 1][1] - points[0][1];
}

function avg(values) {
  const clean = values.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
  return clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : null;
}

function bestFund(funds) {
  const ranked = funds
    .filter((f) => f.r1y != null || f.r1m != null || f._h != null)
    .sort((a, b) => (b._h ?? b.r1y ?? b.r1m ?? -Infinity) - (a._h ?? a.r1y ?? a.r1m ?? -Infinity));
  return ranked[0] || funds[0] || null;
}

function summarizeAmc(name, funds, trendPoints) {
  const total = funds.length;
  const categories = new Set(funds.map((f) => f.category).filter(Boolean));
  const topQuartile = funds.filter((f) => f.catPct != null && f.catPct <= 25).length;
  const aboveMedian = funds.filter((f) => f.catPct != null && f.catPct <= 50).length;
  const complete = funds.filter((f) => f.r1y != null && f.vol90 != null && f.maxdd90 != null && f._h != null).length;
  const direct = funds.filter((f) => f.isDirect).length;
  const active = funds.filter((f) => f.active !== false).length;
  return {
    name,
    funds,
    total,
    categories: categories.size,
    trend: change(trendPoints),
    avgHealth: avg(funds.map((f) => f._h)),
    avgConsistency: avg(funds.map((f) => f.consistency)),
    avgDrawdown: avg(funds.map((f) => f.maxdd90)),
    aboveMedianPct: total ? (aboveMedian / total) * 100 : null,
    topQuartilePct: total ? (topQuartile / total) * 100 : null,
    completePct: total ? (complete / total) * 100 : null,
    directPct: total ? (direct / total) * 100 : null,
    activePct: total ? (active / total) * 100 : null,
    best: bestFund(funds),
  };
}

function DimensionCard({ label, winner, detail, unavailable }) {
  return (
    <article className="rounded-[1.35rem] border border-line bg-surface p-4 shadow-sm">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 text-sm font-semibold text-ink">{unavailable ? "Unavailable" : winner || "Insufficient data"}</div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p>
    </article>
  );
}

function Bar({ value, tone = "bg-accent" }) {
  return <div className="mt-1.5 h-1.5 rounded-full bg-surface-strong"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>;
}

export default function CompareClient({ amcs, meta = {} }) {
  const names = Object.keys(amcs);
  const sorted = [...names].sort((a, b) => (change(amcs[b]) ?? -Infinity) - (change(amcs[a]) ?? -Infinity));
  const searchParams = useSearchParams();
  const fromQuery = (searchParams.get("amcs") || "").split(",").map((s) => s.trim()).filter((n) => amcs[n]);
  const [sel, setSel] = useState(fromQuery.length ? fromQuery.slice(0, 4) : sorted.slice(0, 3));
  const [workspaces, setWorkspaces] = useState([]);
  const [wsName, setWsName] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [assetClass, setAssetClass] = useState("All");
  const [plan, setPlan] = useState("All");
  const [option, setOption] = useState("Growth");
  const [activeOnly, setActiveOnly] = useState(true);
  const [categoryMode, setCategoryMode] = useState("all");
  const [selectedFunds, setSelectedFunds] = useState([]);
  const [copied, setCopied] = useState(false);
  const [funds, setFunds] = useState([]);
  const [loadingAmcEvidence, setLoadingAmcEvidence] = useState(false);

  const selectionKey = sel.join("|");
  useEffect(() => {
    const selectedAmcs = selectionKey.split("|").filter(Boolean);
    if (!selectedAmcs.length) { setFunds([]); setLoadingAmcEvidence(false); return undefined; }
    const controller = new AbortController();
    setLoadingAmcEvidence(true);
    fetch(`/api/search?amcs=${encodeURIComponent(selectedAmcs.join(","))}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { results: [] })
      .then((data) => setFunds(data.results || []))
      .catch((error) => { if (error.name !== "AbortError") setFunds([]); })
      .finally(() => { if (!controller.signal.aborted) setLoadingAmcEvidence(false); });
    return () => controller.abort();
  }, [selectionKey]);

  function refreshWorkspaces() {
    getComparisons().then((list) => setWorkspaces(list.map((c) => ({ id: c.id, name: c.name, sel: c.amcs }))));
  }
  useEffect(() => {
    refreshWorkspaces();
    window.addEventListener("mfp-sync", refreshWorkspaces);
    return () => window.removeEventListener("mfp-sync", refreshWorkspaces);
  }, []);

  const fundMap = useMemo(() => {
    const map = {};
    for (const f of funds) (map[f.amcName] ||= []).push(f);
    return map;
  }, [funds]);

  const selectedSummaries = useMemo(() => sel.map((name) => summarizeAmc(name, fundMap[name] || [], amcs[name] || [])), [amcs, fundMap, sel]);
  const categories = useMemo(() => [...new Set(sel.flatMap((name) => (fundMap[name] || []).map((f) => f.category).filter(Boolean)))].sort(), [fundMap, sel]);
  const assetClasses = useMemo(() => [...new Set(sel.flatMap((name) => (fundMap[name] || []).map((f) => f.assetClass).filter(Boolean)))].sort(), [fundMap, sel]);

  async function saveWs() {
    if (!sel.length) return;
    const name = wsName.trim() || `AMC research ${workspaces.length + 1}`;
    await saveComparison(name, sel);
    refreshWorkspaces();
    setWsName("");
  }
  function loadWs(w) { setSel(w.sel.filter((n) => amcs[n]).slice(0, 4)); }
  async function delWs(w) {
    await deleteComparison(w.id, w.name);
    refreshWorkspaces();
  }

  function toggleAmc(name) {
    setSel((current) => {
      const next = current.includes(name) ? current.filter((item) => item !== name) : current.length >= 4 ? current : [...current, name];
      if (next.length >= 2 && next.length !== current.length) track("comparison_start", { amcs: next.length });
      return next;
    });
  }

  function copyLink() {
    const url = `${window.location.origin}/compare?amcs=${sel.map(encodeURIComponent).join(",")}`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function toggleFund(code) {
    setSelectedFunds((current) => current.includes(code) ? current.filter((c) => c !== code) : current.length >= 4 ? current : [...current, code]);
  }

  async function addToWatchlist(code) {
    const fund = funds.find((item) => item.code === code);
    if (!fund) return;
    await saveWatchlist({ code: fund.code, name: fund.name, amc: fund.amcName });
  }

  const amcResults = sorted.filter((name) => shortAmc(name).toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  const leader = (key, higher = true) => {
    const ranked = selectedSummaries.filter((s) => s[key] != null).sort((a, b) => higher ? b[key] - a[key] : a[key] - b[key]);
    return ranked[0] || null;
  };

  const matrix = useMemo(() => {
    const byCategory = {};
    for (const amcName of sel) {
      let rows = fundMap[amcName] || [];
      rows = rows.filter((f) => (!activeOnly || f.active !== false) && (category === "All" || f.category === category) && (assetClass === "All" || f.assetClass === assetClass) && (plan === "All" || f.plan === plan) && (option === "All" || (option === "Growth" ? f.isGrowth : f.isIdcw)));
      for (const f of rows) {
        const cat = f.category || "Unknown";
        const family = canonicalFamily(f.name);
        const entry = (byCategory[cat] ||= {});
        const group = (entry[amcName] ||= {});
        const current = group[family];
        const preference = (f.isDirect ? 3 : 0) + (f.isGrowth ? 2 : 0) + (f.active !== false ? 1 : 0) + ((f._h || 0) / 100);
        const currentPreference = current ? (current.isDirect ? 3 : 0) + (current.isGrowth ? 2 : 0) + (current.active !== false ? 1 : 0) + ((current._h || 0) / 100) : -1;
        if (!current || preference > currentPreference) group[family] = { ...f, family };
      }
    }
    return Object.entries(byCategory)
      .filter(([, perAmc]) => {
        const count = sel.filter((name) => perAmc[name] && Object.keys(perAmc[name]).length).length;
        if (categoryMode === "common") return count === sel.length;
        if (categoryMode === "unique") return count > 0 && count < sel.length;
        return count > 0;
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [activeOnly, assetClass, category, categoryMode, fundMap, option, plan, sel]);

  return (
    <div className="min-w-0 space-y-8">
      <section className="rounded-[2rem] border border-line bg-surface p-5 shadow-float">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="eyebrow text-accent">AMC comparison workspace</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-ink">Compare 2–4 AMCs by breadth, fund quality, categories, risk and data completeness.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">No frontend AMC score is calculated. Where verified ratings, flows or official update contracts are missing, the page states that explicitly.</p>
          </div>
          <div className="rounded-2xl border border-warn/25 bg-warn/10 p-4 text-xs leading-5 text-ink-muted">
            <b className="text-warn">MF Pulse AMC Research Rating unavailable.</b><br />Requires Claude’s verified methodology contract: dimensions, weights, coverage, confidence, source dates and change rationale.
          </div>
        </div>

        <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block">
            <span className="eyebrow">Search and add AMC</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search SBI, HDFC, ICICI…" className="mt-2 min-h-11 w-full rounded-2xl border border-line bg-bg px-4 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSel([])} className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink">Clear</button>
            <button type="button" onClick={copyLink} disabled={sel.length < 1} className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink disabled:opacity-45">{copied ? "Copied" : "Copy link"}</button>
            {selectedFunds.length >= 2 && <a href={`/compare?funds=${selectedFunds.join(",")}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white">Compare selected funds</a>}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {amcResults.map((name) => {
            const active = sel.includes(name);
            return <button key={name} type="button" onClick={() => toggleAmc(name)} disabled={!active && sel.length >= 4} aria-pressed={active} className={`rounded-2xl border p-3 text-left text-sm font-semibold transition ${active ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-45"}`}>{shortAmc(name)}<span className="mt-1 block text-xs font-normal text-ink-faint">{fmt(meta[name]?.total || fundMap[name]?.length || 0)} schemes</span></button>;
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {sel.map((name) => <span key={name} className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5 text-xs font-semibold text-ink"><span>{shortAmc(name)}</span><button type="button" onClick={() => toggleAmc(name)} aria-label={`Remove ${name}`} className="text-ink-faint hover:text-neg">×</button></span>)}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <input value={wsName} onChange={(e) => setWsName(e.target.value)} aria-label="Comparison workspace name" placeholder="Name this comparison…" className="min-h-10 min-w-0 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent sm:w-auto" />
          <button type="button" onClick={saveWs} disabled={sel.length < 2} className="min-h-10 rounded-xl bg-ink px-4 text-xs font-semibold text-bg disabled:opacity-45">Save workspace</button>
          {workspaces.slice(0, 4).map((w) => <span key={w.id || w.name} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted"><button type="button" onClick={() => loadWs(w)} className="hover:text-ink">{w.name}</button><button type="button" onClick={() => delWs(w)} aria-label={`Delete ${w.name}`} className="hover:text-neg">×</button></span>)}
        </div>
      </section>

      {sel.length < 2 ? (
        <section className="rounded-[2rem] border border-dashed border-line bg-surface p-8 text-center">
          <h2 className="text-xl font-semibold text-ink">Select at least two AMCs.</h2>
          <p className="mt-2 text-sm text-ink-muted">The comparison matrix, fund-level rows and category leadership sections appear once 2–4 AMCs are selected.</p>
        </section>
      ) : loadingAmcEvidence ? (
        <section className="rounded-[2rem] border border-line bg-surface p-10 text-center" role="status" aria-live="polite">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-ink">Loading selected AMC evidence…</h2>
          <p className="mt-2 text-sm text-ink-muted">Fetching only the fund records needed for this comparison.</p>
        </section>
      ) : (
        <>
          <nav className="sticky top-24 z-30 flex gap-2 overflow-x-auto rounded-full border border-line bg-surface/92 p-1 shadow-sm backdrop-blur-xl" aria-label="Comparison sections">
            {["Overview", "Fund-by-fund", "Category leadership", "Risk", "Data quality", "Flows", "Updates", "Methodology"].map((label) => <a key={label} href={`#${label.toLowerCase().replaceAll(" ", "-")}`} className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink">{label}</a>)}
          </nav>

          <section id="overview" className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {selectedSummaries.map((s) => (
                <article key={s.name} className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><a href={`/amc/${encodeURIComponent(s.name)}`} className="text-sm font-semibold text-ink hover:text-accent">{shortAmc(s.name)}</a><span className={`financial-number text-sm ${s.trend == null ? "text-ink-faint" : s.trend >= 0 ? "text-pos" : "text-neg"}`}>{s.trend == null ? "—" : `${s.trend >= 0 ? "+" : ""}${s.trend.toFixed(2)}`}</span></div>
                  <div className="mt-3"><Sparkline points={amcs[s.name] || []} height={42} /></div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-ink-faint">Funds</dt><dd className="financial-number text-ink">{fmt(s.total)}</dd></div>
                    <div><dt className="text-ink-faint">Categories</dt><dd className="financial-number text-ink">{fmt(s.categories)}</dd></div>
                    <div><dt className="text-ink-faint">Top quartile</dt><dd className="financial-number text-ink">{pct(s.topQuartilePct)}</dd></div>
                    <div><dt className="text-ink-faint">Complete data</dt><dd className="financial-number text-ink">{pct(s.completePct)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DimensionCard label="Fund breadth" winner={shortAmc(leader("total")?.name)} detail="Most registered scheme-code options in the selected set." />
              <DimensionCard label="Above category median" winner={shortAmc(leader("aboveMedianPct")?.name)} detail="Share of funds with available category percentile at or above median." />
              <DimensionCard label="Risk-adjusted consistency" winner={shortAmc(leader("avgConsistency")?.name)} detail="Average consistency field from existing verified fund records." />
              <DimensionCard label="Verified AMC flows" unavailable detail="Verified AMC flow data is not available for this period." />
            </div>
          </section>

          <section id="fund-by-fund" className="rounded-[2rem] border border-line bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><div className="eyebrow text-accent">Fund-wise AMC comparison</div><h2 className="section-title mt-2">Category matrix with canonical fund-family rows</h2></div>
              <div className="text-xs text-ink-faint">Rows represent preferred visible plan option per approximated fund family.</div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="min-h-10 min-w-0 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option>All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
              <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)} aria-label="Asset class" className="min-h-10 min-w-0 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option>All</option>{assetClasses.map((c) => <option key={c}>{c}</option>)}</select>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan" className="min-h-10 min-w-0 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option>All</option><option>Direct</option><option>Regular</option></select>
              <select value={option} onChange={(e) => setOption(e.target.value)} aria-label="Option" className="min-h-10 min-w-0 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option>Growth</option><option>IDCW</option><option>All</option></select>
              <select value={categoryMode} onChange={(e) => setCategoryMode(e.target.value)} aria-label="Category coverage" className="min-h-10 min-w-0 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="all">All categories</option><option value="common">Common only</option><option value="unique">Unique only</option></select>
              <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm text-ink-muted"><input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active only</label>
            </div>

            <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-line lg:block">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-surface-2 text-left text-xs text-ink-faint"><tr><th className="px-4 py-3">Category</th>{sel.map((name) => <th key={name} className="px-4 py-3">{shortAmc(name)}</th>)}</tr></thead>
                <tbody>
                  {matrix.map(([cat, perAmc]) => (
                    <tr key={cat} className="border-t border-line align-top">
                      <th className="px-4 py-4 text-left font-semibold text-ink">{cat}</th>
                      {sel.map((name) => {
                        const rows = Object.values(perAmc[name] || {}).sort((a, b) => (b._h ?? b.r1y ?? 0) - (a._h ?? a.r1y ?? 0)).slice(0, 3);
                        return <td key={name} className="px-4 py-4">{rows.length ? rows.map((f) => <div key={f.code} className="mb-3 last:mb-0"><a href={`/fund/${f.code}`} className="font-semibold text-ink hover:text-accent">{cleanFund(f.name)}</a><div className="mt-1 text-xs text-ink-faint">{f.plan} {f.isIdcw ? "IDCW" : "Growth"} · Health {f._h ?? "NA"} · 1Y {pct(f.r1y)}</div><div className="mt-2 flex gap-2"><button type="button" onClick={() => toggleFund(f.code)} className={`rounded-full px-2 py-1 text-[10px] font-semibold ${selectedFunds.includes(f.code) ? "bg-accent text-white" : "border border-line text-ink-muted"}`}>Select</button><button type="button" onClick={() => addToWatchlist(f.code)} className="rounded-full border border-line px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-ink">Watchlist</button></div></div>) : <span className="text-xs text-ink-faint">No matching family</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid gap-3 lg:hidden">
              {matrix.map(([cat, perAmc]) => <article key={cat} className="rounded-2xl border border-line bg-surface-2 p-4"><h3 className="font-semibold text-ink">{cat}</h3><div className="mt-3 grid gap-3">{sel.map((name) => { const rows = Object.values(perAmc[name] || {}).slice(0, 2); return <div key={name} className="rounded-xl bg-surface p-3"><div className="text-xs font-semibold text-ink-faint">{shortAmc(name)}</div>{rows.length ? rows.map((f) => <a key={f.code} href={`/fund/${f.code}`} className="mt-2 block text-sm font-semibold text-ink">{cleanFund(f.name)}<span className="block text-xs font-normal text-ink-faint">{f.plan} · {pct(f.r1y)} 1Y</span></a>) : <p className="mt-2 text-xs text-ink-faint">No matching family</p>}</div>; })}</div></article>)}
            </div>
          </section>

          <section id="category-leadership" className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-line bg-surface p-5"><div className="eyebrow">Category leadership</div><div className="mt-4 space-y-3">{selectedSummaries.map((s) => <div key={s.name}><div className="flex justify-between text-xs"><span className="text-ink-muted">{shortAmc(s.name)}</span><span className="financial-number text-ink">{pct(s.topQuartilePct)} top quartile</span></div><Bar value={s.topQuartilePct} tone="bg-pos" /></div>)}</div></div>
            <div id="risk" className="rounded-[1.5rem] border border-line bg-surface p-5"><div className="eyebrow">Risk and consistency</div><div className="mt-4 space-y-3">{selectedSummaries.map((s) => <div key={s.name}><div className="flex justify-between text-xs"><span className="text-ink-muted">{shortAmc(s.name)}</span><span className="financial-number text-ink">Consistency {pct(s.avgConsistency)} · Drawdown {pct(s.avgDrawdown)}</span></div><Bar value={s.avgConsistency} tone="bg-accent" /></div>)}</div></div>
          </section>

          <section id="data-quality" className="grid gap-4 lg:grid-cols-3">
            {selectedSummaries.map((s) => <article key={s.name} className="rounded-[1.5rem] border border-line bg-surface p-5"><div className="eyebrow">{shortAmc(s.name)}</div><h3 className="mt-2 text-base font-semibold text-ink">Research-data quality</h3><p className="mt-2 text-sm text-ink-muted">{pct(s.completePct)} of funds have the full comparison set used here: 1Y return, 90D volatility, max drawdown and health score.</p><Bar value={s.completePct} /></article>)}
          </section>

          <section id="flows" className="rounded-[1.5rem] border border-warn/25 bg-warn/10 p-5">
            <div className="eyebrow text-warn">Flows and AUM</div>
            <h2 className="mt-2 text-base font-semibold text-ink">Verified AMC flow data is not available for this period.</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">The frontend does not infer AMC-level inflows/outflows from NAV movement. Monthly net flow, AUM trend and market-share trend require a verified backend contract and source date.</p>
          </section>

          <section id="updates" className="rounded-[1.5rem] border border-line bg-surface p-5">
            <div className="eyebrow">Recent AMC updates</div>
            <h2 className="mt-2 text-base font-semibold text-ink">Verified update timeline unavailable.</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Required contract: date, event type, source, affected funds, before/after, confidence, official/editorial classification and why it matters.</p>
          </section>

          <section id="methodology" className="rounded-[1.5rem] border border-line bg-surface p-5">
            <div className="eyebrow">Methodology</div>
            <p className="mt-2 text-sm leading-6 text-ink-muted">This comparison uses existing verified frontend-accessible fund fields: AMFI-derived scheme universe, returns, category percentile, volatility, drawdown, consistency and health score. It does not calculate or display a single AMC rating. Canonical fund families are approximated from scheme names until Claude provides a canonical family identifier.</p>
          </section>
        </>
      )}
    </div>
  );
}
