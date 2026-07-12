"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const emptyEntry = () => ({ schemeName: "", isin: "", units: "", avgCost: "", purchaseValue: "", folioNumber: "" });
const money = (value) => value == null ? "Not available" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

function AllocationList({ title, items = [], note }) {
  return <section className="research-surface p-5"><div className="eyebrow">{title}</div>{items.length ? <div className="mt-4 space-y-3">{items.slice(0, 8).map((item) => <div key={item.name}><div className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-ink-muted">{item.name}</span><span className="financial-number text-ink">{item.weight.toFixed(1)}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-strong"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, item.weight)}%` }} /></div></div>)}</div> : <p className="mt-3 text-sm text-missing">Allocation data unavailable.</p>}{note && <p className="mt-3 text-[11px] text-ink-faint">{note}</p>}</section>;
}

// Theme exposure — reuses the news engine's own rule_ids (exposureEngine.js), so "why does my
// portfolio care about RBI policy" traces to the exact same causal chain the fund/news pages show.
function ExposureGrid({ themes = {} }) {
  const entries = Object.entries(themes);
  const available = entries.filter(([, t]) => t.available && t.exposurePct > 0).sort((a, b) => b[1].exposurePct - a[1].exposurePct);
  const zero = entries.filter(([, t]) => t.available && t.exposurePct === 0).length;
  const unavailable = entries.filter(([, t]) => !t.available);
  return <section className="research-surface p-5"><div className="eyebrow">Theme exposure</div><p className="mt-1 text-xs text-ink-faint">How exposed your holdings are to real, rule-based market themes — the same rules the News engine uses.</p>
    {available.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{available.map(([theme, t]) => <div key={theme} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-ink">{theme}</span><span className="financial-number text-ink">{t.exposurePct.toFixed(1)}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-strong"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, t.exposurePct)}%` }} /></div><p className="mt-1.5 text-[11px] text-ink-faint">via {t.contributions.slice(0, 2).map((c) => c.schemeName).join(", ")}{t.contributions.length > 2 ? ` +${t.contributions.length - 2} more` : ""}</p></div>)}</div> : <p className="mt-3 text-sm text-ink-muted">No measurable exposure to any tracked theme.</p>}
    <p className="mt-3 text-[11px] text-ink-faint">{zero > 0 && `${zero} theme(s) measured at 0% exposure. `}{unavailable.length > 0 && `${unavailable.map(([t]) => t).join(", ")} — no rule exists yet to measure these, reported honestly rather than estimated.`}</p>
  </section>;
}

export default function PortfolioWorkspace() {
  const { data: session, status: authStatus } = useSession();
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState("manual");
  const [entries, setEntries] = useState([emptyEntry()]);
  const [source, setSource] = useState("groww");
  const [file, setFile] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [unresolved, setUnresolved] = useState([]);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadHoldings() {
    const response = await fetch("/api/v1/portfolio/holdings");
    if (response.status === 401) return;
    const data = await response.json();
    if (response.ok) { setHoldings(data.items || []); setUnresolved(data.unresolved || []); }
  }

  useEffect(() => { if (session) loadHoldings().catch(() => setMessage("Holdings could not be loaded.")); }, [session]);

  function updateEntry(index, key, value) {
    setEntries((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, [key]: value } : entry));
  }

  async function importPortfolio(event) {
    event.preventDefault();
    if (!consent) { setMessage("Confirm consent before importing portfolio data."); return; }
    setBusy(true); setMessage(""); setReport(null);
    try {
      let response;
      if (mode === "manual") {
        response = await fetch("/api/v1/portfolio/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "manual", entries }) });
      } else {
        if (!file) { setMessage("Choose a CSV file first."); setBusy(false); return; }
        const form = new FormData(); form.append("source", source); form.append("file", file);
        response = await fetch("/api/v1/portfolio/upload", { method: "POST", body: form });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed.");
      setMessage(`${data.imported} holding${data.imported === 1 ? "" : "s"} imported. ${data.errors?.length || 0} row${data.errors?.length === 1 ? "" : "s"} need attention.`);
      if (mode === "manual") setEntries([emptyEntry()]);
      await loadHoldings();
    } catch (error) { setMessage(error.message || "Portfolio import failed."); }
    finally { setBusy(false); }
  }

  async function computeReport() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/portfolio/intelligence");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Portfolio intelligence could not be computed.");
      setReport(data.report); setUnresolved(data.unresolvedHoldings || []); setMessage(`Report computed from current holdings at ${new Date(data.computedAt).toLocaleString("en-IN")}.`);
    } catch (error) { setMessage(error.message || "Portfolio intelligence could not be computed."); }
    finally { setBusy(false); }
  }

  if (authStatus === "loading") return <div className="skeleton h-48" aria-label="Loading portfolio workspace" />;
  if (!session) return <section className="rounded-2xl border border-line bg-surface p-6 sm:p-8"><div className="eyebrow">Private workspace</div><h2 className="section-title mt-3">Sign in to import and analyze holdings.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">Portfolio records are user-scoped. MF Pulse does not accept holdings into an anonymous session.</p><a href="/login?callbackUrl=/portfolio" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white">Sign in securely</a></section>;

  return <div className="space-y-8">
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="flex items-start gap-3"><input id="portfolio-consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5 rounded border-line text-accent" /><label htmlFor="portfolio-consent" className="text-sm leading-6 text-ink-muted"><b className="text-ink">I consent to processing these holdings for portfolio research.</b><br />Imported values are used to calculate portfolio evidence. This is not a suitability assessment or guaranteed recommendation.</label></div></section>

    <section className="research-surface p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">Import holdings</div><h2 className="section-title mt-2">Add a statement or enter holdings manually.</h2></div><div className="flex rounded-xl border border-line p-1"><button type="button" onClick={() => setMode("manual")} aria-pressed={mode === "manual"} className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${mode === "manual" ? "bg-accent/10 text-accent" : "text-ink-muted"}`}>Manual</button><button type="button" onClick={() => setMode("csv")} aria-pressed={mode === "csv"} className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${mode === "csv" ? "bg-accent/10 text-accent" : "text-ink-muted"}`}>CSV statement</button></div></div>
      <form onSubmit={importPortfolio} className="mt-6">
        {mode === "manual" ? <div className="space-y-3">{entries.map((entry, index) => <div key={index} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-6"><label className="lg:col-span-2"><span className="eyebrow">Scheme name or code</span><input required value={entry.schemeName} onChange={(event) => updateEntry(index, "schemeName", event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink" /></label><label><span className="eyebrow">ISIN</span><input value={entry.isin} onChange={(event) => updateEntry(index, "isin", event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink" /></label><label><span className="eyebrow">Units</span><input required type="number" min="0" step="any" value={entry.units} onChange={(event) => updateEntry(index, "units", event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink" /></label><label><span className="eyebrow">Average cost</span><input type="number" min="0" step="any" value={entry.avgCost} onChange={(event) => updateEntry(index, "avgCost", event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink" /></label><div className="flex items-end"><button type="button" disabled={entries.length === 1} onClick={() => setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="min-h-10 text-xs font-medium text-neg disabled:text-ink-faint">Remove row</button></div></div>)}<button type="button" onClick={() => setEntries((current) => [...current, emptyEntry()])} className="min-h-10 rounded-xl border border-line px-3 text-xs font-semibold text-ink">Add holding</button></div> : <div className="grid gap-3 sm:grid-cols-[180px_1fr]"><label><span className="eyebrow">Statement source</span><select value={source} onChange={(event) => setSource(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink"><option value="groww">Groww</option><option value="coin">Coin</option><option value="kuvera">Kuvera</option><option value="etmoney">ET Money</option></select></label><label><span className="eyebrow">CSV file</span><input required type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg p-2 text-sm text-ink" /></label></div>}
        <button disabled={busy || !consent} className="mt-5 min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Processing…" : "Import portfolio"}</button>
      </form>
      {message && <p className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-muted" role="status">{message}</p>}
    </section>

    <section><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">Matched holdings</div><h2 className="section-title mt-2">{holdings.length} resolved holding{holdings.length === 1 ? "" : "s"}</h2></div>{holdings.length > 0 && <button type="button" onClick={computeReport} disabled={busy} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Computing…" : "Run portfolio review"}</button>}</div>{holdings.length ? <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[700px] text-sm"><thead className="bg-surface-2 text-left"><tr><th className="px-4 py-3">Fund</th><th className="px-4 py-3 text-right">Units</th><th className="px-4 py-3 text-right">Current value</th><th className="px-4 py-3 text-right">Weight</th><th className="px-4 py-3">Source</th></tr></thead><tbody>{holdings.map((holding) => <tr key={`${holding.schemeCode}-${holding.source}-${holding.folioNumber || ""}`} className="border-t border-line"><td className="px-4 py-3"><a href={`/fund/${holding.schemeCode}`} className="font-medium text-ink hover:text-accent">{holding.name}</a><div className="text-xs text-ink-faint">{holding.category} · {holding.amc}</div></td><td className="financial-number px-4 py-3 text-right">{holding.units}</td><td className="financial-number px-4 py-3 text-right">{money(holding.currentValue)}</td><td className="financial-number px-4 py-3 text-right">{holding.weight?.toFixed(1)}%</td><td className="px-4 py-3 text-ink-muted">{holding.source}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-ink-muted">No holdings imported yet.</p>}{unresolved.length > 0 && <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-4"><div className="text-sm font-semibold text-warn">{unresolved.length} unresolved holding{unresolved.length === 1 ? "" : "s"}</div><ul className="mt-2 space-y-1 text-xs text-ink-muted">{unresolved.map((item, index) => <li key={`${item.schemeCode}-${index}`}>{item.schemeCode}: {item.reason}</li>)}</ul></div>}</section>

    {report && <section className="space-y-6" aria-label="Portfolio report">

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Portfolio value",money(report.portfolioSummary.totalValue)],["Health score",report.portfolioSummary.healthScore == null ? "Incomplete" : `${report.portfolioSummary.healthScore}/100`],["Diversification",`${report.diversification.score}/100`],["Concentration",`${report.concentration.score}/100`]].map(([label,value]) => <div key={label} className="research-surface p-4"><div className="eyebrow">{label}</div><div className="financial-number mt-2 text-xl font-semibold text-ink">{value}</div></div>)}</div>
      <p className="text-xs text-ink-faint">{report.diversification.effectiveHoldings} effective holdings across {report.diversification.effectiveAmcs} effective AMCs and {report.diversification.effectiveCategories} effective categories · top holding {report.diversification.topHolding?.toFixed(1)}% · top 3 holdings {report.diversification.top3Holdings?.toFixed(1)}% of portfolio.</p>

      {/* Risk — expected volatility + drawdown, the two figures Phase 4 explicitly asks for and
          the API already computes but nothing previously rendered. */}
      <section className="research-surface p-5"><div className="eyebrow">Risk summary</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><div className="text-xs text-ink-faint">Expected volatility</div><div className="financial-number mt-1 text-lg font-semibold text-ink">{report.risk.volatility == null ? "Not available" : `${report.risk.volatility.toFixed(1)}%`}</div></div><div><div className="text-xs text-ink-faint">Expected drawdown</div><div className="financial-number mt-1 text-lg font-semibold text-ink">{report.risk.expectedDrawdown == null ? "Not available" : `${report.risk.expectedDrawdown.toFixed(1)}%`}</div></div></div><p className="mt-3 text-[11px] text-ink-faint">{report.risk.methodology}</p></section>

      <div className="grid gap-4 lg:grid-cols-2"><AllocationList title="AMC allocation" items={report.allocations.amc} /><AllocationList title="Category allocation" items={report.allocations.category} /></div>
      <div className="grid gap-4 lg:grid-cols-2"><AllocationList title="Sector allocation" items={report.allocations.sector?.breakdown} note={report.allocations.sector?.coveragePct != null ? `Based on factsheet sector data covering ${report.allocations.sector.coveragePct}% of portfolio value — the rest is from funds without disclosed sector allocation.` : undefined} /><AllocationList title="Benchmark allocation" items={report.allocations.benchmark} /></div>

      <ExposureGrid themes={report.exposure} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="research-surface p-5"><div className="eyebrow">Strengths</div>{(report.strengths || []).length ? <ul className="mt-4 space-y-2 text-sm text-ink-muted">{report.strengths.map((item) => <li key={item}>— {item}</li>)}</ul> : <p className="mt-3 text-sm text-ink-muted">No strengths cleared the evidence threshold yet.</p>}</section>
        <section className="research-surface p-5"><div className="eyebrow">Known limitations</div><ul className="mt-4 space-y-2 text-sm text-ink-muted">{(report.weaknesses || []).map((item) => <li key={item}>— {item}</li>)}{unresolved.length > 0 && <li>— {unresolved.length} holding records could not be resolved.</li>}</ul></section>
      </div>

      <section className="research-surface p-5"><div className="eyebrow">Overlap evidence</div><div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm text-ink-muted">
        <div><div className="text-xs font-semibold text-ink">AMC concentration</div>{report.overlap.duplicateAmcs.length ? report.overlap.duplicateAmcs.map((item) => <p key={item.amc} className="mt-1"><b className="text-ink">{item.amc}</b> across {item.funds.length} funds · {item.totalWeightPct?.toFixed(1)}%</p>) : <p className="mt-1">No duplicate AMC concentration detected.</p>}</div>
        <div><div className="text-xs font-semibold text-ink">Duplicate funds</div>{report.overlap.duplicateFunds?.length ? report.overlap.duplicateFunds.map((item) => <p key={item.schemeCode} className="mt-1"><b className="text-ink">{item.schemeName}</b> held via {item.occurrences.length} sources · {item.totalWeightPct?.toFixed(1)}%</p>) : <p className="mt-1">No fund held via more than one source.</p>}</div>
        <div><div className="text-xs font-semibold text-ink">Sector overlap</div>{report.overlap.duplicateSectors?.length ? report.overlap.duplicateSectors.slice(0,5).map((item) => <p key={item.sector} className="mt-1"><b className="text-ink">{item.sector}</b> · {item.totalExposurePct?.toFixed(1)}% across {item.fundsInvolved} funds</p>) : <p className="mt-1">No notable sector overlap detected.</p>}</div>
        <div><div className="text-xs font-semibold text-ink">Benchmark overlap</div>{report.overlap.duplicateBenchmarks?.length ? report.overlap.duplicateBenchmarks.slice(0,5).map((item) => <p key={item.benchmark} className="mt-1"><b className="text-ink">{item.benchmark}</b> tracked by {item.funds.length} funds · {item.totalWeightPct?.toFixed(1)}%</p>) : <p className="mt-1">No funds share the same benchmark.</p>}</div>
        {report.overlap.duplicateStocks.length > 0 && <div className="sm:col-span-2"><div className="text-xs font-semibold text-ink">Stock overlap</div>{report.overlap.duplicateStocks.slice(0,5).map((item) => <p key={item.name} className="mt-1"><b className="text-ink">{item.name}</b> · {item.totalExposurePct?.toFixed(1)}% estimated disclosed exposure across {item.fundCount} funds</p>)}</div>}
      </div></section>

      {report.missingCategories?.length > 0 && <section className="research-surface p-5"><div className="eyebrow">Missing allocations</div><p className="mt-1 text-xs text-ink-faint">Category buckets with zero detected exposure in this portfolio.</p><div className="mt-3 flex flex-wrap gap-2">{report.missingCategories.map((c) => <span key={c} className="rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-xs font-medium text-warn">{c}</span>)}</div></section>}

      <section className="research-surface p-5"><div className="eyebrow">Research opportunities</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{(report.researchOpportunities || []).map((item, index) => <article key={index} className="rounded-xl border border-line bg-surface-2 p-4 text-sm leading-6 text-ink-muted">{typeof item === "string" ? item : item.note || item.reason || item.question || JSON.stringify(item)}</article>)}</div><a href="/advisor" className="mt-5 inline-flex min-h-10 items-center rounded-xl border border-line px-4 text-xs font-semibold text-ink">Review with an advisor</a></section>
    </section>}
  </div>;
}
