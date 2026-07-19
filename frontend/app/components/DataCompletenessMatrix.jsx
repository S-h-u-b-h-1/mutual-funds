"use client";

import { useMemo, useState } from "react";

const FILTERS = ["All", "NAV", "Metadata", "Portfolio", "Holdings", "Risk", "Manager", "AMC", "Performance"];

const confidenceTone = {
  High: "border-pos/30 bg-pos/10 text-pos",
  Medium: "border-warn/30 bg-warn/10 text-warn",
  Low: "border-neg/30 bg-neg/10 text-neg",
  "N/A": "border-line bg-surface-2 text-ink-faint",
};

const validationTone = {
  Validated: "text-pos",
  "Known limitation": "text-warn",
  "Not measurable": "text-ink-faint",
  Blocked: "text-neg",
  "Not applicable": "text-ink-faint",
  "Not assessed": "text-warn",
};

function PercentBar({ value }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden="true">
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${width}%` }} />
    </div>
  );
}

function ConfidenceBadge({ value }) {
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${confidenceTone[value] || confidenceTone["N/A"]}`}>{value}</span>;
}

function FieldDetails({ row }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-full border border-line px-3 text-xs font-semibold text-ink-muted outline-none hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
        Evidence <span aria-hidden="true" className="ml-1 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 grid gap-3 rounded-xl bg-surface-2 p-4 text-xs leading-5 text-ink-muted sm:grid-cols-2">
        <div><span className="block text-ink-faint">Secondary source</span>{row.secondarySource || "No secondary source registered"}</div>
        <div><span className="block text-ink-faint">Backup source</span>{row.backupSource || "No backup source registered"}</div>
        <div><span className="block text-ink-faint">Expected refresh</span>{row.refreshFrequency}</div>
        <div><span className="block text-ink-faint">Measured records</span>{row.measuredCount == null ? "Not measurable" : `${row.measuredCount.toLocaleString("en-IN")} of ${row.denominator.toLocaleString("en-IN")}`}</div>
        {row.notes && <p className="sm:col-span-2"><span className="block text-ink-faint">Known limitations</span>{row.notes}</p>}
      </div>
    </details>
  );
}

function MobileFieldCard({ row }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{row.domain}</div>
          <h3 className="mt-1 break-words text-sm font-semibold text-ink">{row.field}</h3>
        </div>
        <ConfidenceBadge value={row.confidence} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><div className="text-[11px] text-ink-faint">Coverage</div><div className="financial-number mt-1 text-lg font-semibold text-ink">{row.coveragePct == null ? "Not measured" : `${row.coveragePct.toFixed(2)}%`}</div></div>
        <div><div className="text-[11px] text-ink-faint">Missing</div><div className="financial-number mt-1 text-lg font-semibold text-ink">{row.missingPct == null ? "—" : `${row.missingPct.toFixed(2)}%`}</div></div>
      </div>
      <PercentBar value={row.coveragePct} />
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div><dt className="text-ink-faint">Official source</dt><dd className="mt-1 break-words text-ink-muted">{row.officialSource}</dd></div>
        <div><dt className="text-ink-faint">Freshness</dt><dd className="mt-1 text-ink-muted">{row.freshness} · {row.lastUpdated}</dd></div>
        <div className="sm:col-span-2"><dt className="text-ink-faint">Validation</dt><dd className={`mt-1 font-medium ${validationTone[row.validationStatus] || "text-ink-muted"}`}>{row.validationStatus}</dd></div>
      </dl>
      <div className="mt-4"><FieldDetails row={row} /></div>
    </article>
  );
}

export default function DataCompletenessMatrix({ rows, asOf, denominator }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("coverage_desc");

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = rows.filter((row) => {
      const matchesFilter = filter === "All" || row.domain === filter;
      const matchesQuery = !needle || [row.field, row.officialSource, row.domain, row.validationStatus].some((value) => String(value || "").toLowerCase().includes(needle));
      return matchesFilter && matchesQuery;
    });
    return next.sort((a, b) => {
      if (sort === "field_asc") return a.field.localeCompare(b.field);
      if (sort === "missing_desc") return (b.missingPct ?? -1) - (a.missingPct ?? -1);
      if (sort === "coverage_asc") return (a.coveragePct ?? 101) - (b.coveragePct ?? 101);
      if (sort === "confidence_desc") return ({ High: 3, Medium: 2, Low: 1, "N/A": 0 }[b.confidence] || 0) - ({ High: 3, Medium: 2, Low: 1, "N/A": 0 }[a.confidence] || 0);
      return (b.coveragePct ?? -1) - (a.coveragePct ?? -1);
    });
  }, [filter, query, rows, sort]);

  return (
    <section aria-labelledby="coverage-matrix-title">
      <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="eyebrow text-accent">Live completeness matrix</div>
          <h2 id="coverage-matrix-title" className="section-title mt-2">See what MF Pulse knows—and what it does not.</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Coverage is measured over {denominator.toLocaleString("en-IN")} AMFI scheme records by the warehouse audit dated {asOf}. A missing value remains missing; it is never replaced with an estimate.</p>
        </div>
        <div className="text-xs text-ink-faint" aria-live="polite">Showing {visibleRows.length} of {rows.length} fields</div>
      </div>

      <div className="sticky top-0 z-10 -mx-4 mt-5 border-y border-line bg-bg/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface/95">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="text-xs font-medium text-ink-muted">
            Search fields and sources
            <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search NAV, holdings, AMFI…" className="portfolio-control mt-1.5 w-full" />
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="portfolio-control mt-1.5 w-full">
              <option value="coverage_desc">Coverage: high to low</option>
              <option value="coverage_asc">Coverage: low to high</option>
              <option value="missing_desc">Missing: high to low</option>
              <option value="confidence_desc">Confidence</option>
              <option value="field_asc">Field name</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter completeness fields">
          {FILTERS.map((name) => <button key={name} type="button" onClick={() => setFilter(name)} aria-pressed={filter === name} className="min-h-10 shrink-0 rounded-full border border-line px-3 text-xs font-semibold text-ink-muted aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent hover:text-ink">{name}</button>)}
        </div>
      </div>

      {visibleRows.length ? (
        <>
          <div className="mt-5 grid gap-3 lg:hidden">{visibleRows.map((row) => <MobileFieldCard key={row.id} row={row} />)}</div>
          <div className="mt-5 hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Field-level completeness, official source, confidence, freshness and validation status.</caption>
              <thead className="border-b border-line bg-surface-2 text-left text-[10px] uppercase tracking-[0.1em] text-ink-faint"><tr><th className="w-[21%] px-4 py-3">Field</th><th className="w-[12%] px-3 py-3">Coverage</th><th className="w-[10%] px-3 py-3">Missing</th><th className="w-[21%] px-3 py-3">Official source</th><th className="w-[11%] px-3 py-3">Confidence</th><th className="w-[13%] px-3 py-3">Freshness</th><th className="w-[12%] px-3 py-3">Validation</th></tr></thead>
              <tbody>{visibleRows.map((row) => (
                <tr key={row.id} className="border-b border-line/70 align-top last:border-0">
                  <td className="px-4 py-4"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{row.domain}</div><div className="mt-1 break-words font-semibold text-ink">{row.field}</div><div className="mt-3"><FieldDetails row={row} /></div></td>
                  <td className="px-3 py-4"><span className="financial-number font-semibold text-ink">{row.coveragePct == null ? "Not measured" : `${row.coveragePct.toFixed(2)}%`}</span><PercentBar value={row.coveragePct} /></td>
                  <td className="financial-number px-3 py-4 text-ink-muted">{row.missingPct == null ? "—" : `${row.missingPct.toFixed(2)}%`}</td>
                  <td className="break-words px-3 py-4 text-xs leading-5 text-ink-muted">{row.officialSource}</td>
                  <td className="px-3 py-4"><ConfidenceBadge value={row.confidence} /></td>
                  <td className="px-3 py-4 text-xs leading-5 text-ink-muted">{row.freshness}<span className="block text-ink-faint">{row.lastUpdated}</span></td>
                  <td className={`px-3 py-4 text-xs font-medium leading-5 ${validationTone[row.validationStatus] || "text-ink-muted"}`}>{row.validationStatus}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : <div className="mt-5 rounded-2xl border border-line bg-surface p-8 text-center"><h3 className="font-semibold text-ink">No fields match these filters.</h3><button type="button" onClick={() => { setQuery(""); setFilter("All"); }} className="mt-4 min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink">Clear filters</button></div>}
    </section>
  );
}
