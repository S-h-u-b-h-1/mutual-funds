"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "../lib/track";
import { saveWatchlist } from "../lib/cloudSync";
import { buildComparisonReport } from "../lib/reports/comparisonReport";
import { classifyFundTaxTreatment } from "../lib/portfolioIntelligence/taxEngine";
import { investorFit } from "../lib/investorAnalyst";

const metricRows = [
  ["Health score", "_h", (value, fund) => value == null ? "Missing" : `${value}/100 · ${fund._g}`],
  ["1-month return", "r1m", (value) => value == null ? "Missing" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`],
  ["3-month return", "r3m", (value) => value == null ? "Missing" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`],
  ["1-year return", "r1y", (value) => value == null ? "Missing" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`],
  ["90-day volatility", "vol90", (value) => value == null ? "Missing" : value],
  ["90-day max drawdown", "maxdd90", (value) => value == null ? "Missing" : value],
  ["Consistency", "consistency", (value) => value == null ? "Missing" : `${value}%`],
  ["SEBI category", "category", (value) => value || "Missing"],
  ["Fund house", "amc", (value) => value || "Missing"],
  ["Plan", "plan", (value, fund) => `${value || "Unknown"} · ${fund.isDirect ? "Direct" : "Regular"}`],
];

const cleanName = (name = "") => name.replace(/ - (Direct|Regular).*/i, "").trim();

function observedBest(funds, key, direction = "max") {
  const available = funds.filter((fund) => fund[key] != null);
  if (!available.length) return null;
  return [...available].sort((a, b) => direction === "min" ? a[key] - b[key] : b[key] - a[key])[0];
}

export default function CompareFundsClient({ initialFunds, allFundsList }) {
  const [selectedCodes, setSelectedCodes] = useState(initialFunds.map((fund) => fund.code));
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  const activeFunds = useMemo(() => selectedCodes.map((code) => allFundsList.find((fund) => fund.code === code)).filter(Boolean), [selectedCodes, allFundsList]);
  const searchResults = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (clean.length < 2) return [];
    return allFundsList.filter((fund) => fund.name.toLowerCase().includes(clean) || fund.amc.toLowerCase().includes(clean) || fund.code.includes(clean)).slice(0, 6);
  }, [query, allFundsList]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedCodes.length) params.set("funds", selectedCodes.join(",")); else params.delete("funds");
    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  }, [selectedCodes]);

  function addFund(code) {
    if (selectedCodes.includes(code)) return;
    if (selectedCodes.length >= 4) { setNotice("Remove a fund before adding another. Comparisons support up to four funds."); return; }
    setSelectedCodes((codes) => [...codes, code]);
    setQuery("");
    setNotice("");
    track("fund_comparison_added", { code });
  }

  function removeFund(code) {
    setSelectedCodes((codes) => codes.filter((item) => item !== code));
    track("fund_comparison_removed", { code });
  }

  async function addAllToWatchlist() {
    await Promise.all(activeFunds.map((fund) => saveWatchlist({ code: fund.code, name: fund.name, amc: fund.amc })));
    setNotice(`${activeFunds.length} fund${activeFunds.length === 1 ? "" : "s"} added to your watchlist.`);
    track("comparison_batch_watchlisted", { count: activeFunds.length });
  }

  function exportCsv() {
    const header = ["Metric", ...activeFunds.map((fund) => cleanName(fund.name))];
    const lines = [header, ...metricRows.map(([label, key, format]) => [label, ...activeFunds.map((fund) => format(fund[key], fund))])];
    const csv = lines.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "mf-pulse-fund-comparison.csv"; link.click(); URL.revokeObjectURL(url);
    track("comparison_exported", { count: activeFunds.length });
  }

  const strongestReturn = observedBest(activeFunds, "r1y") || observedBest(activeFunds, "r3m") || observedBest(activeFunds, "r1m");
  const lowestRisk = observedBest(activeFunds, "vol90", "min");
  const downside = observedBest(activeFunds, "maxdd90");
  const readiness = observedBest(activeFunds, "_h");
  const incomplete = activeFunds.map((fund) => ({ fund, count: ["r1m", "r3m", "r1y", "vol90", "maxdd90", "consistency", "_h"].filter((key) => fund[key] == null).length })).sort((a, b) => b.count - a.count)[0];
  const conclusions = [
    ["Stronger observed return", strongestReturn, strongestReturn?.r1y != null ? `${strongestReturn.r1y.toFixed(2)}% over 1 year` : "Longest available return period"],
    ["Lower observed volatility", lowestRisk, lowestRisk?.vol90 != null ? `${lowestRisk.vol90} over 90 days` : "Not enough risk data"],
    ["Shallower observed drawdown", downside, downside?.maxdd90 != null ? `${downside.maxdd90} over 90 days` : "Not enough drawdown data"],
    ["Stronger research readiness", readiness, readiness?._h != null ? `${readiness._h}/100 health score` : "Health score unavailable"],
  ];

  // Winner-by-dimension: reuses buildComparisonReport() (Investment Operating System mission,
  // Phase 10) instead of re-deriving a second leader-picking implementation — includes its
  // already-verified maxdd90 sign handling (a negative number, so "shallower" is the higher value).
  const comparisonReport = useMemo(() => (activeFunds.length >= 2 ? buildComparisonReport(activeFunds) : null), [activeFunds]);

  // Tax efficiency — category-level classification only, reusing the exact same map Tax
  // Intelligence uses on the portfolio page, never a second classification list.
  const taxComparisons = useMemo(() => activeFunds.map((fund) => ({ fund, tax: classifyFundTaxTreatment(fund.category) })), [activeFunds]);

  // Suitability — reuses investorFit() (11 structural profiles, never a recommendation).
  // Only surfaces profiles where the compared funds actually disagree: restating all 11 profiles
  // for every fund when they all agree is noise, not signal, on a page already dense with tables.
  const suitabilityRows = useMemo(() => activeFunds.map((fund) => ({ fund, fit: investorFit(fund) })), [activeFunds]);
  const suitabilityDiffs = useMemo(() => {
    if (suitabilityRows.length < 2) return [];
    const profiles = suitabilityRows[0]?.fit?.map((entry) => entry.profile) || [];
    return profiles
      .map((profile) => {
        const perFund = suitabilityRows.map(({ fund, fit }) => ({ fund, entry: fit.find((item) => item.profile === profile) }));
        const allSame = perFund.every((row) => row.entry?.suitable === perFund[0].entry?.suitable);
        return allSame ? null : { profile, perFund };
      })
      .filter(Boolean);
  }, [suitabilityRows]);

  // Overall recommendation — a win-count synthesis across every dimension above, never a blind
  // pick: ties are named as ties, confidence reflects how concentrated the wins actually are, and
  // every dimension the "lead" fund does NOT win is listed as an explicit trade-off.
  const overallRecommendation = useMemo(() => {
    if (!comparisonReport || comparisonReport.metricLeaders.length < 2) return null;
    const wins = {};
    for (const m of comparisonReport.metricLeaders) wins[m.leader.schemeCode] = (wins[m.leader.schemeCode] || 0) + 1;
    const totalDims = comparisonReport.metricLeaders.length;
    const maxWins = Math.max(...Object.values(wins));
    const topCodes = Object.keys(wins).filter((code) => wins[code] === maxWins);
    const tied = topCodes.length > 1;
    const shareOfWins = maxWins / totalDims;
    // "high"/"medium"/"limited" — the same 3-tier vocabulary already established by
    // decisionEngine.js's CONFIDENCE_LABEL and recommendationEngine.js's confidence field, not a
    // fourth ad-hoc scale. Found and fixed during a terminology-consistency audit: this section
    // originally used "moderate"/"low", a different vocabulary for the same concept.
    const confidence = tied ? "limited" : shareOfWins >= 0.75 ? "high" : shareOfWins >= 0.5 ? "medium" : "limited";
    const leadFunds = topCodes.map((code) => activeFunds.find((fund) => fund.code === code)).filter(Boolean);
    const tradeoffs = comparisonReport.metricLeaders
      .filter((m) => !topCodes.includes(m.leader.schemeCode))
      .map((m) => `${m.metric}: ${cleanName(m.leader.schemeName)} leads instead (${typeof m.leader.value === "number" ? m.leader.value.toFixed(2) : m.leader.value}${m.unit}).`);
    return { leadFunds, tied, winsCount: maxWins, totalDims, confidence, tradeoffs };
  }, [comparisonReport, activeFunds]);

  return (
    <div className="space-y-9">
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-label="Fund selection">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow">Selection</div><h2 className="mt-2 text-base font-semibold text-ink">Add up to four funds</h2></div><span className="financial-number text-xs text-ink-faint">{activeFunds.length}/4 selected</span></div>
        <div className="relative mt-4 max-w-xl"><label className="sr-only" htmlFor="compare-fund-search">Search funds to compare</label><input id="compare-fund-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by fund, AMC, or scheme code" className="min-h-11 w-full rounded-xl border border-line bg-bg px-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent" />{searchResults.length > 0 && <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-float">{searchResults.map((fund) => <button type="button" key={fund.code} onClick={() => addFund(fund.code)} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm text-ink-muted hover:bg-surface-strong hover:text-ink"><span className="font-medium">{cleanName(fund.name)}</span><span className="ml-2 text-xs text-ink-faint">{fund.plan}</span></button>)}</div>}</div>
        {notice && <p className="mt-3 text-xs text-ink-muted" role="status">{notice}</p>}
        {activeFunds.length > 0 && <div className="mt-5 flex flex-wrap gap-2"><a href={`/research?import_funds=${selectedCodes.join(",")}`} className="inline-flex min-h-10 items-center rounded-xl bg-accent px-4 text-xs font-semibold text-white">Model as strategy</a><button type="button" onClick={addAllToWatchlist} className="min-h-10 rounded-xl border border-line px-4 text-xs font-semibold text-ink">Add all to watchlist</button><button type="button" onClick={exportCsv} className="min-h-10 rounded-xl border border-line px-4 text-xs font-semibold text-ink">Export CSV</button><button type="button" onClick={() => setSelectedCodes([])} className="min-h-10 rounded-xl px-3 text-xs font-medium text-ink-muted">Clear</button></div>}
      </section>

      {!activeFunds.length ? <div className="rounded-2xl border border-dashed border-line p-10 text-center"><h2 className="text-base font-semibold text-ink">No funds selected</h2><p className="mt-2 text-sm text-ink-muted">Search above or select funds from the screener to begin an evidence-led comparison.</p></div> : <>
        <section aria-labelledby="comparison-conclusions"><div className="eyebrow">At a glance</div><h2 id="comparison-conclusions" className="section-title mt-2">Observed differences—not a universal winner.</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{conclusions.map(([label, fund, detail]) => <article key={label} className="research-surface p-4"><div className="eyebrow">{label}</div><div className="mt-3 text-sm font-semibold leading-snug text-ink">{fund ? cleanName(fund.name) : "Data unavailable"}</div><div className="financial-number mt-2 text-xs text-ink-muted">{detail}</div></article>)}</div>{incomplete?.count > 0 && <p className="mt-3 rounded-xl border border-missing/30 bg-missing/10 p-3 text-xs text-ink-muted"><b className="text-ink">Most incomplete:</b> {cleanName(incomplete.fund.name)} is missing {incomplete.count} comparison measure{incomplete.count === 1 ? "" : "s"}.</p>}</section>

        {overallRecommendation && <section aria-labelledby="overall-recommendation" className="rounded-2xl border border-accent/30 bg-accent/5 p-5 sm:p-6">
          <div className="eyebrow text-accent">Overall recommendation</div>
          <h2 id="overall-recommendation" className="section-title mt-2">
            {overallRecommendation.tied
              ? `${overallRecommendation.leadFunds.map((fund) => cleanName(fund.name)).join(" and ")} are evenly matched.`
              : `${cleanName(overallRecommendation.leadFunds[0]?.name)} leads on ${overallRecommendation.winsCount} of ${overallRecommendation.totalDims} measured dimensions.`}
          </h2>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-ink-faint">Confidence:</span>
            <span className={`rounded-full px-2.5 py-1 font-semibold ${overallRecommendation.confidence === "high" ? "bg-pos/10 text-pos" : overallRecommendation.confidence === "medium" ? "bg-warn/10 text-warn" : "bg-ink-faint/10 text-ink-faint"}`}>{overallRecommendation.confidence}</span>
            <span className="text-ink-faint">— {overallRecommendation.tied ? "no fund leads on a majority of dimensions; the right pick depends on which measure matters most to you." : overallRecommendation.confidence === "high" ? "wins are concentrated in one fund across most dimensions." : "wins are split — this is a genuine trade-off, not a clear-cut pick."}</span>
          </div>
          {overallRecommendation.tradeoffs.length > 0 && <div className="mt-4"><div className="text-xs font-semibold text-ink">Trade-offs to weigh</div><ul className="mt-2 space-y-1.5 text-xs text-ink-muted">{overallRecommendation.tradeoffs.map((line) => <li key={line}>— {line}</li>)}</ul></div>}
          <p className="mt-4 text-[11px] text-ink-faint">Based only on observed historical measures above — never a guarantee of future performance, and never a substitute for checking suitability against your own risk tolerance and horizon.</p>
        </section>}

        {comparisonReport && <section aria-labelledby="winner-by-dimension"><div className="eyebrow">Winner by dimension</div><h2 id="winner-by-dimension" className="section-title mt-2">Every measure, one leader each</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{comparisonReport.metricLeaders.map((m) => <div key={m.metric} className="research-surface p-4"><div className="eyebrow">{m.metric}</div><div className="mt-2 text-sm font-semibold text-ink">{cleanName(m.leader.schemeName)}</div><div className="financial-number mt-1 text-xs text-ink-muted">{typeof m.leader.value === "number" ? m.leader.value.toFixed(2) : m.leader.value}{m.unit}</div></div>)}</div>{comparisonReport.overlap.note && <p className="mt-4 text-xs text-ink-faint">{comparisonReport.overlap.note}</p>}</section>}

        <section aria-labelledby="metric-comparison"><div className="eyebrow">Metric comparison</div><h2 id="metric-comparison" className="section-title mt-2">Evidence by fund</h2><div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[720px] border-collapse text-[13px]"><thead className="bg-surface-2"><tr className="border-b border-line"><th className="sticky left-0 bg-surface-2 px-4 py-4 text-left text-[10px] font-medium uppercase tracking-wider text-ink-faint">Metric</th>{activeFunds.map((fund) => <th key={fund.code} className="min-w-[170px] border-l border-line px-4 py-4 text-left align-top"><a href={`/fund/${fund.code}`} className="block font-semibold leading-snug text-ink hover:text-accent">{cleanName(fund.name)}</a><button type="button" onClick={() => removeFund(fund.code)} className="mt-2 text-[11px] font-medium text-ink-faint hover:text-neg">Remove</button></th>)}</tr></thead><tbody>{metricRows.map(([label, key, format]) => <tr key={label} className="border-b border-line last:border-0"><th className="sticky left-0 bg-surface px-4 py-3 text-left font-medium text-ink-muted">{label}</th>{activeFunds.map((fund) => <td key={fund.code} className={`border-l border-line px-4 py-3 ${fund[key] == null ? "text-missing" : "text-ink"}`}>{format(fund[key], fund)}</td>)}</tr>)}</tbody></table></div></section>

        <section aria-labelledby="tax-efficiency"><div className="eyebrow">Tax efficiency</div><h2 id="tax-efficiency" className="section-title mt-2">How each fund's category is actually taxed</h2><p className="mt-1 text-xs text-ink-faint">Category-level classification, not fund-specific — reuses the same rules as Tax Intelligence on the portfolio page.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{taxComparisons.map(({ fund, tax }) => <div key={fund.code} className="research-surface p-4"><div className="text-sm font-semibold text-ink">{cleanName(fund.name)}</div>{tax.treatment ? <><div className="mt-2 text-xs font-medium text-accent">{tax.label}</div><div className="mt-2 text-xs text-ink-muted"><b className="text-ink">LT:</b> {tax.ltcgHoldingPeriod} — {tax.ltcgRate}</div><div className="mt-1 text-xs text-ink-muted"><b className="text-ink">ST:</b> {tax.stcgHoldingPeriod} — {tax.stcgRate}</div></> : <p className="mt-2 text-xs text-missing">Category not yet classified for tax purposes.</p>}</div>)}</div></section>

        {suitabilityDiffs.length > 0 && <section aria-labelledby="suitability-differences"><div className="eyebrow">Suitability</div><h2 id="suitability-differences" className="section-title mt-2">Where these funds structurally suit different investors</h2><p className="mt-1 text-xs text-ink-faint">Structural classification, never a recommendation to buy — profiles where the compared funds agree are omitted.</p><div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[560px] border-collapse text-[13px]"><thead className="bg-surface-2"><tr className="border-b border-line"><th className="sticky left-0 bg-surface-2 px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink-faint">Profile</th>{activeFunds.map((fund) => <th key={fund.code} className="min-w-[150px] border-l border-line px-4 py-3 text-left text-xs font-semibold text-ink">{cleanName(fund.name)}</th>)}</tr></thead><tbody>{suitabilityDiffs.map(({ profile, perFund }) => <tr key={profile} className="border-b border-line last:border-0"><th className="sticky left-0 bg-surface px-4 py-3 text-left font-medium text-ink-muted">{profile}</th>{perFund.map(({ fund, entry }) => <td key={fund.code} className={`border-l border-line px-4 py-3 text-xs ${entry?.suitable ? "text-pos" : "text-ink-faint"}`}>{entry?.suitable ? "Suitable" : "Not typical"}</td>)}</tr>)}</tbody></table></div></section>}

        <section className="grid gap-4 lg:grid-cols-3" aria-label="Research differences"><div className="research-surface p-5"><div className="eyebrow">Where they differ</div><p className="mt-3 text-sm leading-6 text-ink-muted">Compare return periods alongside volatility and drawdown. A stronger recent return may coexist with greater downside variation.</p></div><div className="research-surface p-5"><div className="eyebrow">What is similar</div><p className="mt-3 text-sm leading-6 text-ink-muted">{new Set(activeFunds.map((fund) => fund.category)).size === 1 ? `All selected records share the ${activeFunds[0].category} category.` : "The selected records span different categories; category-relative comparisons matter."}</p></div><div className="research-surface p-5"><div className="eyebrow">What remains unknown</div><p className="mt-3 text-sm leading-6 text-ink-muted">Missing measures remain labelled. Review holdings, manager history, benchmark fit, and factsheet completeness on each fund page before drawing a conclusion.</p></div></section>
      </>}
    </div>
  );
}
