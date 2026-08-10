"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { saveWatchlist } from "../lib/cloudSync";
import { portfolioApi } from "../lib/invest/api";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PAGE_SIZE = 12;
const STATEMENT_TYPES = [
  { key: "cams_cas_pdf", label: "CAMS CAS PDF", detail: "Consolidated Account Statement issued by CAMS" },
  { key: "kfin_cas_pdf", label: "KFIN CAS PDF", detail: "Consolidated Account Statement issued by KFintech" },
  { key: "mfcentral_summary", label: "MF Central Summary", detail: "MF Central consolidated portfolio statement" },
];

const money = (value) => value == null || Number.isNaN(Number(value))
  ? "Not available"
  : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));

const decimal = (value, suffix = "") => value == null || Number.isNaN(Number(value))
  ? "Not available"
  : `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`;

const shortDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const dateTime = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function uploadErrorMessage(data, status) {
  if (status === 401) return "Your session expired. Sign in again, then retry this upload.";
  if (data?.code === "encrypted_pdf" || /password|encrypted/i.test(data?.error || "")) {
    return "This PDF is password-protected. Export an unlocked copy from the statement provider, then retry.";
  }
  if (data?.code === "duplicate_upload") return data.error || "This exact statement has already been imported. Choose a newer statement.";
  if (data?.code === "file_too_large" || status === 413) return data.error || "This PDF is larger than the 15 MB limit.";
  if (data?.code === "unsupported_provider") return "This statement provider is not supported. Use a CAMS, KFintech, or verified MF Central statement.";
  if (data?.code || /could not be read|xref|invalid pdf/i.test(data?.error || "")) {
    return "This PDF could not be read as a supported statement. Check that it opens normally, is unlocked, and came from CAMS, KFintech, or MF Central.";
  }
  return data?.error || "Statement processing failed. Check the file and try again.";
}

function scoreTone(value) {
  if (value == null) return "text-ink-faint";
  if (Number(value) >= 70) return "text-pos";
  if (Number(value) >= 45) return "text-warn";
  return "text-neg";
}

function valueTone(value) {
  if (value == null) return "text-ink";
  if (Number(value) > 0) return "text-pos";
  if (Number(value) < 0) return "text-neg";
  return "text-ink";
}

function gainPctFrom(gain, invested) {
  const cost = Number(invested);
  if (gain == null || !Number.isFinite(cost) || cost <= 0) return null;
  return +((Number(gain) / cost) * 100).toFixed(2);
}

function planOptionLabel(holding) {
  const plan = holding?.planType || holding?.plan || (holding?.isDirect === true ? "Direct" : holding?.isDirect === false ? "Regular" : null);
  const option = holding?.optionType || holding?.option || (holding?.isGrowth === true ? "Growth" : holding?.isIdcw === true ? "IDCW" : null);
  if (plan && option) return `${plan} · ${option}`;
  return plan || option || "Plan/option unavailable";
}

function dataStatus(holding) {
  if (holding?.dataStatus) return holding.dataStatus;
  if (!holding?.schemeCode) return "Unresolved";
  if (holding.nav == null) return "Missing NAV";
  if (holding.purchaseValue == null) return "Missing cost";
  return "Mapped and valued";
}

function FileIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.75h6.4L18 8.35v11.9H7z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13 4v5h5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 13h5M9.5 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StatusPill({ tone = "neutral", children }) {
  const classes = tone === "positive"
    ? "border-pos/25 bg-pos/10 text-pos"
    : tone === "warning"
      ? "border-warn/25 bg-warn/10 text-warn"
      : tone === "negative"
        ? "border-neg/25 bg-neg/10 text-neg"
        : "border-line bg-surface-2 text-ink-muted";
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold ${classes}`}>{children}</span>;
}

function SectionHeader({ eyebrow, title, detail, action }) {
  return (
    <div className="portfolio-section-header">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow text-accent">{eyebrow}</div>}
        <h2 className="section-title mt-1.5">{title}</h2>
        {detail && <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function MetricTile({ label, value, detail, source, tone = "text-ink", unavailable = false, help }) {
  return (
    <article className="min-w-0 rounded-[1.15rem] bg-surface-2 p-4" aria-label={`${label}: ${value}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="eyebrow">{label}</div>
        {help && <span title={help} aria-label={help} className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-[11px] text-ink-faint">?</span>}
      </div>
      <div className={`financial-number mt-3 break-words text-xl font-semibold tracking-[-0.04em] sm:text-2xl ${unavailable ? "text-ink-faint" : tone}`}>{value}</div>
      <p className="mt-2 min-h-8 text-[11px] leading-4 text-ink-faint">{detail}</p>
      <div className="mt-3 border-t border-line/70 pt-2 text-[10px] leading-4 text-ink-faint">{source}</div>
    </article>
  );
}

function LeaderCard({ label, leader, metricKey, metricFormat = money, tone = "text-ink" }) {
  const name = leader?.schemeName || leader?.fundName || leader?.name;
  const metric = leader?.[metricKey];
  return (
    <article className="portfolio-card-outlined">
      <div className="flex items-start justify-between gap-3">
        <div className="eyebrow">{label}</div>
        <StatusPill tone={leader ? "positive" : "neutral"}>{leader ? (leader.confidence || "API ranked") : "Unavailable"}</StatusPill>
      </div>
      {leader ? (
        <>
          <div className={`financial-number mt-4 text-2xl font-semibold ${tone}`}>{metricFormat(metric)}</div>
          <h3 className="mt-2 break-words text-sm font-semibold leading-5 text-ink">{name || "Unnamed holding"}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-ink-faint">Current value</dt><dd className="financial-number mt-1 text-ink">{money(leader.currentValue ?? leader.marketValue)}</dd></div>
            <div><dt className="text-ink-faint">Allocation</dt><dd className="financial-number mt-1 text-ink">{decimal(leader.allocation ?? leader.weight, "%")}</dd></div>
            <div><dt className="text-ink-faint">Absolute gain</dt><dd className={`financial-number mt-1 ${valueTone(leader.absoluteGain ?? leader.gain)}`}>{money(leader.absoluteGain ?? leader.gain)}</dd></div>
            <div><dt className="text-ink-faint">Data date</dt><dd className="mt-1 text-ink">{shortDate(leader.asOfDate ?? leader.navDate)}</dd></div>
          </dl>
          {leader.schemeCode && <a href={`/fund/${leader.schemeCode}`} className="mt-5 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-accent/40 hover:text-accent">Open fund research</a>}
        </>
      ) : (
        <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm leading-6 text-ink-muted">The portfolio API has not supplied this ranking, its exclusions, confidence, and valuation date. MF Pulse will not rank it in the browser.</div>
      )}
    </article>
  );
}

function UploadStatus({ phase, error, onCancel }) {
  const active = phase === "uploading" || phase === "processing";
  const status = error
    ? { tone: "negative", label: "Failed", title: "Portfolio was not saved" }
    : phase === "complete"
      ? { tone: "positive", label: "Saved and synced", title: "Server persistence confirmed" }
      : phase === "processing"
        ? { tone: "warning", label: "Processing", title: "The server is parsing and saving the statement" }
        : phase === "uploading"
          ? { tone: "warning", label: "Uploading", title: "The statement is being uploaded securely" }
          : { tone: "neutral", label: "Ready", title: "Choose a supported statement" };
  return (
    <section className="portfolio-card-outlined" aria-live="polite" aria-atomic="true">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Persistence state</div>
          <div className="mt-2 text-sm font-semibold text-ink">{status.title}</div>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs leading-5 text-ink-muted">
        {active ? "The current API confirms only the request state and final database response; timed or invented parser stages are not shown." : "A completed dashboard appears only after the server response succeeds and saved holdings reload."}
      </p>
      {active && <button type="button" onClick={onCancel} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted hover:text-ink">Cancel request</button>}
    </section>
  );
}

function ImportResultReview({ result, onViewPortfolio, onUploadAnother }) {
  if (!result) return null;
  const importedHoldings = Array.isArray(result.holdings) ? result.holdings : [];
  const issues = Array.isArray(result.errors) ? result.errors : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const totalInvested = importedHoldings.reduce((sum, holding) => sum + (Number.isFinite(Number(holding.purchaseValue)) ? Number(holding.purchaseValue) : 0), 0);
  const totalCurrent = importedHoldings.reduce((sum, holding) => sum + (Number.isFinite(Number(holding.currentValue)) ? Number(holding.currentValue) : 0), 0);
  const gain = importedHoldings.length ? +(totalCurrent - totalInvested).toFixed(2) : null;
  const gainPct = gainPctFrom(gain, totalInvested);

  return (
    <section className="portfolio-card-outlined border-accent/25 bg-accent/5" aria-labelledby="portfolio-import-result-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-accent">Import result</div>
          <h2 id="portfolio-import-result-title" className="section-title mt-2">Server-confirmed portfolio review</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">The current endpoint saves immediately after parsing. This review shows what the server accepted, what it could not map, and the values now available to the portfolio.</p>
        </div>
        <StatusPill tone={issues.length ? "warning" : "positive"}>{importedHoldings.length} mapped · {issues.length} unresolved</StatusPill>
      </div>

      <div className="mt-5 grid portfolio-grid-gap sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Holdings found" value={decimal(importedHoldings.length)} detail={`${result.imported ?? importedHoldings.length} persisted by the server`} source={result.upload?.id ? `Upload ${result.upload.id}` : "Upload response"} />
        <MetricTile label="Total invested" value={money(totalInvested)} unavailable={!importedHoldings.length} detail="Cost value from accepted rows" source="Statement-derived cost evidence" />
        <MetricTile label="Latest MF Pulse value" value={money(totalCurrent)} unavailable={!importedHoldings.length} detail="Accepted rows revalued with latest NAV" source="AMFI NAV universe" />
        <MetricTile label="Gain / loss" value={`${money(gain)} · ${decimal(gainPct, "%")}`} unavailable={gain == null} tone={valueTone(gain)} detail="Current value minus invested value" source="Display derivation from accepted rows" />
      </div>

      <div className="mt-5 rounded-xl border border-warn/25 bg-warn/10 p-4">
        <div className="eyebrow text-warn">Statement reconciliation</div>
        <p className="mt-2 text-sm leading-6 text-ink-muted">The upload response does not yet expose the statement-declared grand totals, so the frontend cannot compare source-document total versus MF Pulse total on this screen. That remains a backend contract dependency, not a hidden calculation.</p>
      </div>

      {!!warnings.length && <div className="mt-5 rounded-xl bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Warnings</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-muted">{warnings.slice(0, 5).map((warning, index) => <li key={`warning-${index}`}>• {warning}</li>)}</ul>
      </div>}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <caption className="sr-only">Imported holdings review with mapping state, values, NAV evidence and gain or loss.</caption>
          <thead className="border-y border-line bg-surface text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint"><tr><th scope="col" className="portfolio-table-cell w-[300px]">Fund</th><th scope="col" className="portfolio-table-cell">Folio</th><th scope="col" className="portfolio-table-cell text-right">Units</th><th scope="col" className="portfolio-table-cell text-right">Invested</th><th scope="col" className="portfolio-table-cell text-right">Latest NAV</th><th scope="col" className="portfolio-table-cell text-right">Current value</th><th scope="col" className="portfolio-table-cell text-right">Gain / loss</th><th scope="col" className="portfolio-table-cell text-right">Return</th><th scope="col" className="portfolio-table-cell">Mapping</th></tr></thead>
          <tbody>
            {importedHoldings.map((holding, index) => {
              const rowGain = holding.absoluteGain ?? holding.gainLoss ?? (holding.currentValue != null && holding.purchaseValue != null ? +(Number(holding.currentValue) - Number(holding.purchaseValue)).toFixed(2) : null);
              const rowGainPct = holding.returnPct ?? holding.gainLossPct ?? gainPctFrom(rowGain, holding.purchaseValue);
              return (
                <tr key={`${holding.schemeCode || "mapped"}-${holding.folioNumber || "folio"}-${index}`} className="border-b border-line/70">
                  <th scope="row" className="portfolio-table-cell text-left"><span className="block break-words font-semibold leading-5 text-ink">{holding.schemeName || holding.name || holding.schemeCode || "Mapped holding"}</span><span className="mt-1 block break-words text-xs font-normal text-ink-faint">{holding.amc || "AMC unavailable"} · {planOptionLabel(holding)}</span></th>
                  <td className="portfolio-table-cell break-all">{holding.folioNumber || "Not supplied"}</td>
                  <td className="portfolio-table-cell financial-number text-right">{decimal(holding.units)}</td>
                  <td className="portfolio-table-cell financial-number text-right">{money(holding.purchaseValue)}</td>
                  <td className="portfolio-table-cell text-right"><span className="financial-number">{money(holding.nav)}</span><span className="mt-1 block text-[10px] text-ink-faint">{shortDate(holding.navDate)}</span></td>
                  <td className="portfolio-table-cell financial-number text-right font-semibold">{money(holding.currentValue)}</td>
                  <td className={`portfolio-table-cell financial-number text-right ${valueTone(rowGain)}`}>{money(rowGain)}</td>
                  <td className={`portfolio-table-cell financial-number text-right ${valueTone(rowGainPct)}`}>{decimal(rowGainPct, "%")}</td>
                  <td className="portfolio-table-cell"><StatusPill tone={holding.resolutionWarning ? "warning" : "positive"}>{holding.resolutionWarning ? "Mapped with note" : "Mapped"}</StatusPill></td>
                </tr>
              );
            })}
            {issues.map((issue, index) => (
              <tr key={`issue-${issue.schemeName || index}`} className="border-b border-line/70 bg-warn/5">
                <th scope="row" className="portfolio-table-cell text-left"><span className="block break-words font-semibold leading-5 text-ink">{issue.schemeName || "Unresolved source row"}</span><span className="mt-1 block text-xs font-normal text-ink-faint">{issue.reason || "Mapping failed"}</span></th>
                <td className="portfolio-table-cell break-all">{issue.folioNumber || "Not supplied"}</td>
                <td className="portfolio-table-cell text-right" colSpan="6">{issue.ambiguityCandidates?.length ? `${issue.ambiguityCandidates.length} possible matches require confirmation` : "No safe unique mapping was available"}</td>
                <td className="portfolio-table-cell"><StatusPill tone="warning">{issue.status === "needs_review" ? "Ambiguous" : "Unresolved"}</StatusPill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={onViewPortfolio} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white">View portfolio</button>
        <a href="/invest" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink">Go to dashboard</a>
        <button type="button" onClick={onUploadAnother} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink-muted">Upload another statement</button>
      </div>
    </section>
  );
}

function PortfolioHeader({ holdings, summary, computedAt, latestImportedAt, onUpload }) {
  const saved = holdings.length > 0;
  const portfolioName = summary?.portfolioName || summary?.name || "My mutual fund portfolio";
  const statementDate = summary?.latestStatementDate || summary?.statementDate;
  const navDate = summary?.latestOfficialNavDate || summary?.valuationDate;
  return (
    <header className="overflow-hidden rounded-[1.75rem] bg-ink text-bg shadow-float">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="eyebrow text-accent-soft">Portfolio intelligence</div>
            <StatusPill tone={saved ? "positive" : "neutral"}>{saved ? "Saved and synced" : "No saved portfolio"}</StatusPill>
          </div>
          <h1 className="mt-3 break-words text-3xl font-semibold leading-tight tracking-[-0.055em] sm:text-4xl">{portfolioName}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-bg/70">Persistent holdings, official-NAV valuation evidence, allocation and deterministic research context—without browser-invented financial values.</p>
          <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
            <div><dt className="text-bg/45">Latest statement</dt><dd className="mt-1 font-semibold text-bg">{shortDate(statementDate)}</dd></div>
            <div><dt className="text-bg/45">Official NAV date</dt><dd className="mt-1 font-semibold text-bg">{shortDate(navDate)}</dd></div>
            <div><dt className="text-bg/45">Last valuation</dt><dd className="mt-1 font-semibold text-bg">{dateTime(computedAt)}</dd></div>
          </dl>
        </div>
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row lg:flex-col">
          <button type="button" onClick={onUpload} className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-glow">{saved ? "Upload updated statement" : "Upload statement"}</button>
          {saved && <a href="#portfolio-provenance" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-semibold text-bg/80 hover:bg-white/[0.06] hover:text-bg">Sources and provenance</a>}
          <span className="text-center text-[10px] text-bg/45 lg:text-right">Last import: {dateTime(latestImportedAt)}</span>
        </div>
      </div>
    </header>
  );
}

function ExecutiveSummary({ summary, computedAt }) {
  const currentValue = summary?.totalValue ?? summary?.currentValue;
  const invested = summary?.investedValue ?? summary?.purchaseValue;
  const gain = summary?.gainLoss ?? summary?.absoluteGain;
  const gainPct = summary?.gainLossPct ?? summary?.absoluteReturnPct;
  const dailyValue = summary?.latestNavDayChange?.value ?? summary?.dailyChangeValue;
  const dailyPct = summary?.latestNavDayChange?.percentage ?? summary?.dailyChangePct;
  const xirr = summary?.xirr;
  const navDate = summary?.latestOfficialNavDate ?? summary?.valuationDate;
  const confidence = summary?.valuationConfidence ?? summary?.confidence;
  return (
    <section id="portfolio-summary" className="portfolio-section" aria-labelledby="portfolio-summary-title">
      <SectionHeader eyebrow="Executive metrics" title="What the portfolio is worth—and what the API can prove" detail="Every value below is rendered from the portfolio response. Missing server fields remain unavailable rather than being recomputed in the browser." />
      <div className="portfolio-card">
        <h2 id="portfolio-summary-title" className="sr-only">Executive portfolio metrics</h2>
        <div className="grid portfolio-grid-gap sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MetricTile label="Current value" value={money(currentValue)} unavailable={currentValue == null} detail="Latest official NAV valuation" source={`NAV date: ${shortDate(navDate)}`} help="Sum of server-valued holdings at the latest official NAV available to the portfolio service." />
          <MetricTile label="Invested value" value={money(invested)} unavailable={invested == null} detail="Purchase or cost value supplied by the API" source={invested == null ? "Cost basis not supplied" : `Calculated by portfolio API · ${shortDate(navDate)}`} help="Cost basis must come from the stored statement or transaction ledger." />
          <MetricTile label="Absolute gain / loss" value={money(gain)} unavailable={gain == null} tone={valueTone(gain)} detail={gain == null ? "Requires API cost basis" : Number(gain) >= 0 ? "Gain versus invested value" : "Loss versus invested value"} source={`Valuation: ${dateTime(computedAt)}`} help="Current value minus invested value, computed by the portfolio service." />
          <MetricTile label="Percentage gain / loss" value={decimal(gainPct, "%")} unavailable={gainPct == null} tone={valueTone(gainPct)} detail={gainPct == null ? "Requires API cost basis" : "Absolute return percentage"} source={`Valuation: ${dateTime(computedAt)}`} help="Absolute gain or loss divided by invested value, computed by the portfolio service." />
          <MetricTile
            label="Latest NAV-day change"
            value={dailyValue == null ? "Not available" : `${money(dailyValue)} · ${decimal(dailyPct, "%")}`}
            unavailable={dailyValue == null}
            tone={valueTone(dailyValue)}
            detail={dailyValue == null ? "Requires fund-level NAV-day movement" : "Derived from latest fund NAV-day movement"}
            source={dailyValue == null ? "Daily NAV movement unavailable" : `Official NAV: ${shortDate(navDate)}`}
            help="Uses each holding's latest one-day NAV movement where the fund dataset supplies it. This is not stored portfolio value history."
          />
          <MetricTile label="XIRR" value={decimal(xirr, "%")} unavailable={xirr == null} tone={valueTone(xirr)} detail="Shown only with a sufficient transaction ledger" source={xirr == null ? "Transaction evidence unavailable" : "Portfolio API transaction cash flows"} help="Extended internal rate of return computed from dated cash flows by the portfolio service." />
          <MetricTile label="Research score" value={summary?.healthScore == null ? "Not available" : `${decimal(summary.healthScore)}/100`} unavailable={summary?.healthScore == null} tone={scoreTone(summary?.healthScore)} detail="Deterministic portfolio research score" source={`Report: ${dateTime(computedAt)}`} help="A research-priority indicator, not a suitability or recommendation score." />
          <MetricTile label="Valuation confidence" value={confidence || "Not available"} unavailable={!confidence} detail="Coverage, reconciliation and NAV freshness" source={confidence ? `API status · ${shortDate(navDate)}` : "Confidence contract not supplied"} help="Must be supplied with coverage and reconciliation evidence by the portfolio service." />
        </div>
      </div>
    </section>
  );
}

function PerformanceLeaders({ leaders }) {
  return (
    <section id="performance-leaders" className="portfolio-section" aria-labelledby="performance-leaders-title">
      <SectionHeader eyebrow="Performance leaders" title="Return and rupee contribution are separate rankings" detail="Rankings exclude holdings the server marks unresolved, unreconciled, missing-cost or stale. MF Pulse does not infer a winner from the browser payload." />
      <h2 id="performance-leaders-title" className="sr-only">Portfolio performance leaders</h2>
      <div className="grid portfolio-grid-gap md:grid-cols-2 xl:grid-cols-4">
        <LeaderCard label="Best return %" leader={leaders?.bestByReturnPct} metricKey="returnPct" metricFormat={(v) => decimal(v, "%")} tone="text-pos" />
        <LeaderCard label="Poorest return %" leader={leaders?.poorestByReturnPct} metricKey="returnPct" metricFormat={(v) => decimal(v, "%")} tone="text-neg" />
        <LeaderCard label="Largest rupee contributor" leader={leaders?.largestContributor} metricKey="gain" tone="text-pos" />
        <LeaderCard label="Largest rupee detractor" leader={leaders?.largestDetractor} metricKey="gain" tone="text-neg" />
      </div>
      {leaders?.excludedCount > 0 && <p className="text-xs leading-5 text-ink-faint">{leaders.excludedCount} holding{leaders.excludedCount === 1 ? " was" : "s were"} excluded from ranking under the server policy.</p>}
    </section>
  );
}

function ValueHistory({ history = [], ranges = [] }) {
  const enabled = new Set(ranges);
  const defaultRange = ranges.includes("since_import") ? "since_import" : ranges[0] || "since_import";
  const [activeRange, setActiveRange] = useState(defaultRange);
  const hasActualHistory = history.length > 1;
  const visibleHistory = useMemo(() => {
    if (!history.length || activeRange === "all" || activeRange === "since_import") return history;
    const monthCount = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 }[activeRange];
    if (!monthCount) return history;
    const datedPoints = history.filter((point) => !Number.isNaN(new Date(point.date).getTime()));
    if (!datedPoints.length) return history;
    const latest = new Date(Math.max(...datedPoints.map((point) => new Date(point.date).getTime())));
    const cutoff = new Date(latest);
    cutoff.setMonth(cutoff.getMonth() - monthCount);
    return datedPoints.filter((point) => new Date(point.date) >= cutoff);
  }, [activeRange, history]);
  return (
    <section id="value-history" className="portfolio-section" aria-labelledby="value-history-title">
      <SectionHeader
        eyebrow={hasActualHistory ? "Value history" : "Current valuation"}
        title={hasActualHistory ? "Portfolio value, invested value and gain over time" : "Current portfolio value from latest available NAV"}
        detail={hasActualHistory ? "Only stored valuation points are eligible. Date ranges stay disabled until the API confirms real coverage." : "MF Pulse is showing the current valuation only. This is not presented as historical performance until real valuation history exists."}
      />
      <div className="portfolio-card-outlined">
        <h2 id="value-history-title" className="sr-only">Portfolio value history</h2>
        {hasActualHistory && <div className="flex flex-wrap gap-2" aria-label="Value history range">
          {[["since_import", "Since import"], ["1m", "1M"], ["3m", "3M"], ["6m", "6M"], ["1y", "1Y"], ["all", "All"]].map(([key, label]) => (
            <button key={key} type="button" disabled={!enabled.has(key)} aria-pressed={activeRange === key} onClick={() => setActiveRange(key)} className="min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-ink-muted aria-pressed:border-accent aria-pressed:text-accent disabled:cursor-not-allowed disabled:opacity-40">{label}</button>
          ))}
        </div>}
        {hasActualHistory ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <caption className="sr-only">Stored portfolio valuation history with market value, invested value, gain and NAV coverage.</caption>
              <thead className="text-left text-xs text-ink-faint"><tr><th className="portfolio-table-cell">Date</th><th className="portfolio-table-cell text-right">Market value</th><th className="portfolio-table-cell text-right">Invested</th><th className="portfolio-table-cell text-right">Gain / loss</th><th className="portfolio-table-cell text-right">NAV coverage</th></tr></thead>
              <tbody>{visibleHistory.map((point) => <tr key={point.id || point.date} className="border-t border-line"><td className="portfolio-table-cell">{shortDate(point.date)}</td><td className="portfolio-table-cell financial-number text-right">{money(point.marketValue)}</td><td className="portfolio-table-cell financial-number text-right">{money(point.investedValue)}</td><td className={`portfolio-table-cell financial-number text-right ${valueTone(point.gainLoss)}`}>{money(point.gainLoss)}</td><td className="portfolio-table-cell financial-number text-right">{decimal(point.navCoveragePct, "%")}</td></tr>)}</tbody>
            </table>
          </div>
        ) : history.length === 1 ? (
          <div className="mt-5 grid portfolio-grid-gap sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label="Latest MF Pulse value" value={money(history[0].marketValue)} detail={`NAV as of ${shortDate(history[0].date)}`} source="Current valuation point" />
            <MetricTile label="Invested value" value={money(history[0].investedValue)} unavailable={history[0].investedValue == null} detail="Cost basis from stored holdings" source="Statement/API evidence" />
            <MetricTile label="Gain / loss" value={money(history[0].gainLoss)} unavailable={history[0].gainLoss == null} tone={valueTone(history[0].gainLoss)} detail="Current value minus invested value" source="Display derivation from current valuation" />
            <MetricTile label="NAV coverage" value={decimal(history[0].navCoveragePct, "%")} unavailable={history[0].navCoveragePct == null} detail="Holdings with latest NAV evidence" source="Portfolio metadata" />
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-surface-2 p-5">
            <h3 className="text-sm font-semibold text-ink">No stored valuation history is available.</h3>
            <p className="mt-2 text-sm leading-6 text-ink-muted">The current API does not expose historical valuation points. After that contract exists, real ranges and an accessible interactive chart can appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function HoldingActions({ holding, watched, onWatch }) {
  const code = holding.schemeCode;
  return (
    <div className="flex flex-wrap gap-2">
      {code && <a href={`/fund/${code}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink hover:text-accent">Open fund</a>}
      {code && <a href={`/compare?mode=funds&funds=${encodeURIComponent(code)}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink-muted hover:text-ink">Compare</a>}
      {code && <button type="button" onClick={() => onWatch(holding)} disabled={watched} className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink-muted hover:text-ink disabled:opacity-55">{watched ? "On watchlist" : "Watchlist"}</button>}
    </div>
  );
}

function HoldingEvidence({ holding }) {
  return (
    <dl className="grid gap-3 rounded-xl bg-surface-2 p-4 text-xs sm:grid-cols-3">
      <div><dt className="text-ink-faint">Source</dt><dd className="mt-1 break-words text-ink">{holding.source || "Not available"}</dd></div>
      <div><dt className="text-ink-faint">Folio</dt><dd className="mt-1 break-all text-ink">{holding.folioNumber || "Not supplied"}</dd></div>
      <div><dt className="text-ink-faint">Imported</dt><dd className="mt-1 text-ink">{dateTime(holding.importedAt)}</dd></div>
      <div><dt className="text-ink-faint">Benchmark</dt><dd className="mt-1 break-words text-ink">{holding.benchmark || "Not available"}</dd></div>
      <div><dt className="text-ink-faint">Expense ratio</dt><dd className="financial-number mt-1 text-ink">{decimal(holding.expenseRatio, "%")}</dd></div>
      <div><dt className="text-ink-faint">Data status</dt><dd className="mt-1 text-ink">{dataStatus(holding)}</dd></div>
      <div><dt className="text-ink-faint">Plan / option</dt><dd className="mt-1 text-ink">{planOptionLabel(holding)}</dd></div>
      <div><dt className="text-ink-faint">NAV date</dt><dd className="mt-1 text-ink">{shortDate(holding.navDate)}</dd></div>
    </dl>
  );
}

function HoldingsSection({ holdings }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("weight_desc");
  const [group, setGroup] = useState("none");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());
  const [watched, setWatched] = useState(() => new Set());

  const categories = useMemo(() => Array.from(new Set(holdings.map((h) => h.category).filter(Boolean))).sort(), [holdings]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = holdings.filter((holding) => {
      const matchesQuery = !term || [holding.schemeName, holding.name, holding.amc, holding.category, holding.folioNumber, holding.schemeCode].some((value) => String(value || "").toLowerCase().includes(term));
      return matchesQuery && (category === "all" || holding.category === category);
    });
    return rows.sort((a, b) => {
      if (group !== "none") {
        const groupCompare = String(a[group] || "Unknown").localeCompare(String(b[group] || "Unknown"));
        if (groupCompare) return groupCompare;
      }
      if (sort === "name_asc") return String(a.schemeName || a.name || "").localeCompare(String(b.schemeName || b.name || ""));
      if (sort === "value_desc") return Number(b.currentValue || 0) - Number(a.currentValue || 0);
      return Number(b.weight || 0) - Number(a.weight || 0);
    });
  }, [category, group, holdings, query, sort]);

  useEffect(() => setPage(1), [query, sort, group, category]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function rowKey(holding, index) {
    return `${holding.schemeCode || "unknown"}-${holding.folioNumber || "no-folio"}-${index}`;
  }

  function toggleExpanded(key) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function addWatch(holding) {
    if (!holding.schemeCode) return;
    await saveWatchlist({ code: holding.schemeCode, name: holding.schemeName || holding.name, amc: holding.amc });
    setWatched((current) => new Set(current).add(holding.schemeCode));
  }

  return (
    <section id="portfolio-holdings" className="portfolio-section" aria-labelledby="portfolio-holdings-title">
      <SectionHeader eyebrow="Holdings" title="Every stored position with its source evidence" detail="Search, sort and grouping only change the display. Values remain the fields supplied by the portfolio service." />
      <div className="portfolio-card-outlined">
        <h2 id="portfolio-holdings-title" className="sr-only">Portfolio holdings</h2>
        <div className="grid portfolio-grid-gap sm:grid-cols-2 xl:grid-cols-4">
          <label className="block xl:col-span-1"><span className="eyebrow">Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Fund, AMC, folio…" className="portfolio-control mt-2 w-full min-w-0" /></label>
          <label className="block"><span className="eyebrow">Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)} className="portfolio-control mt-2 w-full min-w-0"><option value="weight_desc">Allocation: high to low</option><option value="value_desc">Current value: high to low</option><option value="name_asc">Fund name: A–Z</option></select></label>
          <label className="block"><span className="eyebrow">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="portfolio-control mt-2 w-full min-w-0"><option value="all">All categories</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="block"><span className="eyebrow">Group</span><select value={group} onChange={(event) => setGroup(event.target.value)} className="portfolio-control mt-2 w-full min-w-0"><option value="none">No grouping</option><option value="amc">Group by AMC</option><option value="category">Group by category</option></select></label>
        </div>

        <div className="mt-5 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1180px] text-sm">
            <caption className="sr-only">Portfolio holdings. Use each row’s evidence button for source, folio and data status.</caption>
            <thead className="border-y border-line bg-surface-2 text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint"><tr><th scope="col" className="portfolio-table-cell w-[300px]">Fund</th><th scope="col" className="portfolio-table-cell">Units</th><th scope="col" className="portfolio-table-cell text-right">Invested</th><th scope="col" className="portfolio-table-cell text-right">Latest NAV</th><th scope="col" className="portfolio-table-cell text-right">Current value</th><th scope="col" className="portfolio-table-cell text-right">Gain / loss</th><th scope="col" className="portfolio-table-cell text-right">Return</th><th scope="col" className="portfolio-table-cell">Data status</th><th scope="col" className="portfolio-table-cell">Actions</th></tr></thead>
            <tbody>
              {rows.map((holding, index) => {
                const key = rowKey(holding, index);
                const gain = holding.absoluteGain ?? holding.gainLoss;
                const gainPct = holding.returnPct ?? holding.gainLossPct ?? gainPctFrom(gain, holding.purchaseValue);
                return (
                  <FragmentRow key={key} groupLabel={group !== "none" && (index === 0 || rows[index - 1]?.[group] !== holding[group]) ? (holding[group] || "Unknown") : null}>
                    <tr className="border-b border-line/80">
                      <th scope="row" className="portfolio-table-cell text-left"><a href={`/fund/${holding.schemeCode}`} className="block break-words font-semibold leading-5 text-ink hover:text-accent">{holding.schemeName || holding.name || holding.schemeCode}</a><span className="mt-1 block break-words text-xs font-normal text-ink-faint">{holding.amc || "AMC unavailable"} · {planOptionLabel(holding)}</span><span className="mt-1 block break-all text-[11px] font-normal text-ink-faint">Folio {holding.folioNumber || "not supplied"}</span></th>
                      <td className="portfolio-table-cell financial-number">{decimal(holding.units)}</td>
                      <td className="portfolio-table-cell financial-number text-right">{money(holding.purchaseValue)}</td>
                      <td className="portfolio-table-cell text-right"><span className="financial-number">{money(holding.nav)}</span><span className="mt-1 block text-[10px] text-ink-faint">{shortDate(holding.navDate)}</span></td>
                      <td className="portfolio-table-cell financial-number text-right font-semibold">{money(holding.currentValue)}</td>
                      <td className={`portfolio-table-cell financial-number text-right ${valueTone(gain)}`}>{money(gain)}</td>
                      <td className={`portfolio-table-cell financial-number text-right ${valueTone(gainPct)}`}>{decimal(gainPct, "%")}</td>
                      <td className="portfolio-table-cell"><StatusPill tone={holding.nav == null || holding.purchaseValue == null ? "warning" : "positive"}>{dataStatus(holding)}</StatusPill></td>
                      <td className="portfolio-table-cell"><button type="button" onClick={() => toggleExpanded(key)} aria-expanded={expanded.has(key)} className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink-muted hover:text-ink">{expanded.has(key) ? "Hide evidence" : "Evidence"}</button></td>
                    </tr>
                    {expanded.has(key) && <tr className="border-b border-line"><td colSpan="9" className="p-3"><HoldingEvidence holding={holding} /><div className="mt-3"><HoldingActions holding={holding} watched={watched.has(holding.schemeCode)} onWatch={addWatch} /></div></td></tr>}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-3 lg:hidden">
          {rows.map((holding, index) => {
            const key = rowKey(holding, index);
            const gain = holding.absoluteGain ?? holding.gainLoss;
            const gainPct = holding.returnPct ?? holding.gainLossPct ?? gainPctFrom(gain, holding.purchaseValue);
            const groupLabel = group !== "none" && (index === 0 || rows[index - 1]?.[group] !== holding[group]) ? (holding[group] || "Unknown") : null;
            return (
              <div key={key}>
                {groupLabel && <div className="mb-2 mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-accent">{groupLabel}</div>}
                <article className="rounded-[1.2rem] bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><a href={`/fund/${holding.schemeCode}`} className="break-words text-sm font-semibold leading-5 text-ink">{holding.schemeName || holding.name || holding.schemeCode}</a><p className="mt-1 break-words text-xs text-ink-faint">{holding.amc || "AMC unavailable"} · {planOptionLabel(holding)}</p><p className="mt-1 break-all text-[11px] text-ink-faint">Folio {holding.folioNumber || "not supplied"}</p></div><StatusPill tone={holding.nav == null || holding.purchaseValue == null ? "warning" : "positive"}>{dataStatus(holding)}</StatusPill></div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-ink-faint">Current value</dt><dd className="financial-number mt-1 font-semibold text-ink">{money(holding.currentValue)}</dd></div><div><dt className="text-ink-faint">Return</dt><dd className={`financial-number mt-1 ${valueTone(gainPct)}`}>{decimal(gainPct, "%")}</dd></div><div><dt className="text-ink-faint">Invested</dt><dd className="financial-number mt-1 text-ink">{money(holding.purchaseValue)}</dd></div><div><dt className="text-ink-faint">Gain / loss</dt><dd className={`financial-number mt-1 ${valueTone(gain)}`}>{money(gain)}</dd></div><div><dt className="text-ink-faint">Units</dt><dd className="financial-number mt-1 text-ink">{decimal(holding.units)}</dd></div><div><dt className="text-ink-faint">Latest NAV</dt><dd className="financial-number mt-1 text-ink">{money(holding.nav)}<span className="mt-1 block font-sans text-[10px] text-ink-faint">{shortDate(holding.navDate)}</span></dd></div></dl>
                  <div className="mt-4"><button type="button" onClick={() => toggleExpanded(key)} aria-expanded={expanded.has(key)} className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-xs font-semibold text-ink-muted">{expanded.has(key) ? "Hide folio evidence" : "Show folio evidence"}</button></div>
                  {expanded.has(key) && <div className="mt-3"><HoldingEvidence holding={holding} /><div className="mt-3"><HoldingActions holding={holding} watched={watched.has(holding.schemeCode)} onWatch={addWatch} /></div></div>}
                </article>
              </div>
            );
          })}
        </div>

        {!rows.length && <div className="mt-5 rounded-xl bg-surface-2 p-5 text-sm text-ink-muted">No holdings match these filters. Clear search or choose another category.</div>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-ink-faint">Showing {rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
          <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded-full border border-line px-4 text-xs font-semibold text-ink-muted disabled:opacity-40">Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded-full border border-line px-4 text-xs font-semibold text-ink-muted disabled:opacity-40">Next</button></div>
        </div>
      </div>
    </section>
  );
}

function FragmentRow({ groupLabel, children }) {
  return <>{groupLabel && <tr><th colSpan="9" scope="rowgroup" className="bg-accent/5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-accent">{groupLabel}</th></tr>}{children}</>;
}

function AllocationSection({ allocations }) {
  const [dimension, setDimension] = useState("fund");
  const dimensions = {
    fund: { label: "Fund", items: allocations?.fund || [] },
    amc: { label: "AMC", items: allocations?.amc || [] },
    category: { label: "Category", items: allocations?.category || [] },
    sector: { label: "Sector", items: allocations?.sector?.breakdown || [] },
    registrar: { label: "Registrar", items: allocations?.registrar || [] },
  };
  const selected = dimensions[dimension];
  return (
    <section id="portfolio-allocation" className="portfolio-section" aria-labelledby="portfolio-allocation-title">
      <SectionHeader eyebrow="Allocation" title="One concentration lens at a time" detail="The chart and table use the same server-supplied allocation rows. Sector coverage is disclosed rather than treated as complete." />
      <div className="portfolio-card-outlined">
        <h2 id="portfolio-allocation-title" className="sr-only">Portfolio allocation</h2>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Allocation dimension">
          {Object.entries(dimensions).map(([key, item]) => <button key={key} type="button" role="tab" aria-selected={dimension === key} onClick={() => setDimension(key)} className={`min-h-10 rounded-full px-3 text-xs font-semibold ${dimension === key ? "bg-ink text-bg" : "border border-line text-ink-muted"}`}>{item.label}</button>)}
        </div>
        {dimension === "sector" && <p className="mt-4 text-xs leading-5 text-ink-faint">Sector coverage: {decimal(allocations?.sector?.coveragePct, "%")} of portfolio value with factsheet-sourced sector data.</p>}
        {selected.items.length ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="space-y-3" role="img" aria-label={`${selected.label} allocation. ${selected.items.slice(0, 8).map((item) => `${item.name} ${decimal(item.weight, "%")}`).join(", ")}`}>
              {selected.items.slice(0, 8).map((item, index) => <div key={`${dimension}-${item.name}`}><div className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 break-words text-ink-muted">{item.name}</span><span className="financial-number shrink-0 text-ink">{decimal(item.weight, "%")}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-strong"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Number(item.weight) || 0)}%`, opacity: Math.max(0.45, 1 - index * 0.06) }} /></div></div>)}
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Accessible tabular fallback for {selected.label} allocation.</caption><thead className="text-left text-xs text-ink-faint"><tr><th className="pb-2">{selected.label}</th><th className="pb-2 text-right">Value</th><th className="pb-2 text-right">Weight</th></tr></thead><tbody>{selected.items.slice(0, 8).map((item) => <tr key={item.name} className="border-t border-line"><th scope="row" className="break-words py-3 pr-3 text-left font-medium text-ink">{item.name}</th><td className="financial-number py-3 text-right text-ink">{money(item.value)}</td><td className="financial-number py-3 text-right text-ink">{decimal(item.weight, "%")}</td></tr>)}</tbody></table></div>
          </div>
        ) : <div className="mt-5 rounded-xl bg-surface-2 p-5 text-sm leading-6 text-ink-muted">{selected.label} allocation is not available in the current portfolio response.</div>}
      </div>
    </section>
  );
}

function IntelligenceSection({ report }) {
  const strengths = report?.strengths || [];
  const weaknesses = report?.weaknesses || [];
  const research = report?.researchOpportunities || [];
  const projection = report?.projection;
  return (
    <section id="portfolio-intelligence" className="portfolio-section" aria-labelledby="portfolio-intelligence-title">
      <SectionHeader eyebrow="Risk and portfolio intelligence" title="Health, uncertainty and the range of possible outcomes" detail="A transparent planning model—not a promise. Portfolio quality, downside resilience and evidence confidence are measured separately." action={<a href="/methodology#portfolio-model" className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-xs font-semibold text-ink-muted hover:text-accent">How this works</a>} />
      <h2 id="portfolio-intelligence-title" className="sr-only">Risk and portfolio intelligence</h2>
      {report?.bottomLine && <div className="rounded-[1.35rem] bg-accent/10 p-5"><div className="eyebrow text-accent">Research conclusion</div><p className="mt-2 text-sm leading-6 text-ink">{report.bottomLine}</p></div>}

      {projection && <>
        <div className="grid portfolio-grid-gap sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Expected annual range centre" value={decimal(projection.expectedAnnualReturnPct, "%")} detail="Conservative annual planning estimate; not a guaranteed return." source={`Assumption set ${projection.assumptionVersion} · evidence-shrunk`} tone="text-accent" help="Long-run category assumptions are tilted only partially by observed fund returns." />
          <MetricTile label="Modelled volatility" value={decimal(projection.modelledAnnualVolatilityPct, "%")} detail="Annualised variability after category-correlation diversification." source={`${decimal(projection.confidence?.riskCoveragePct, "%")} observed risk coverage`} help="Uses holding volatility where available and category assumptions where it is missing." />
          <MetricTile label="Planning drawdown" value={decimal(projection.planningDrawdownPct, "%")} detail="A downside planning allowance, not a worst-case loss limit." source="1.55× modelled annual volatility · capped" tone="text-warn" />
          <MetricTile label="Evidence confidence" value={`${projection.confidence?.score ?? 0}/100`} detail={`${projection.confidence?.label || "Low"} confidence in the model inputs—not in future certainty.`} source={`${decimal(projection.confidence?.returnCoveragePct, "%")} return evidence coverage`} tone={scoreTone(projection.confidence?.score)} />
        </div>

        <div className="grid portfolio-grid-gap xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <article className="portfolio-card-outlined">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">Projected value ranges</div><h3 className="mt-2 text-lg font-semibold text-ink">Probability bands widen with time</h3></div><StatusPill tone="warning">10th–90th percentile</StatusPill></div>
            <p className="mt-3 text-xs leading-5 text-ink-faint">Values assume no future additions, withdrawals, tax or fees. The middle is a model median, not the most likely exact outcome.</p>
            <div className="mt-5 space-y-4">{projection.ranges.map((range) => <div key={range.years} className="rounded-xl bg-surface-2 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-semibold text-ink">{range.years} year{range.years === 1 ? "" : "s"}</div><div className="financial-number text-xs text-ink-faint">Loss probability: {decimal(range.probabilityOfLossPct, "%")}</div></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="eyebrow">Lower</div><div className="financial-number mt-1 text-sm font-semibold text-neg">{money(range.lowValue)}</div><div className="text-[10px] text-ink-faint">{decimal(range.lowReturnPct, "%")}</div></div><div className="border-x border-line"><div className="eyebrow">Middle</div><div className="financial-number mt-1 text-sm font-semibold text-ink">{money(range.centralValue)}</div><div className="text-[10px] text-ink-faint">{decimal(range.centralReturnPct, "%")}</div></div><div><div className="eyebrow">Upper</div><div className="financial-number mt-1 text-sm font-semibold text-pos">{money(range.highValue)}</div><div className="text-[10px] text-ink-faint">{decimal(range.highReturnPct, "%")}</div></div></div></div>)}</div>
          </article>

          <article className="portfolio-card-outlined">
            <div className="eyebrow">Stress laboratory</div><h3 className="mt-2 text-lg font-semibold text-ink">What could hurt this portfolio?</h3><p className="mt-3 text-xs leading-5 text-ink-faint">Deterministic shocks, not forecasts; no probability is assigned.</p>
            <div className="mt-5 space-y-3">{projection.stressTests.map((scenario) => <div key={scenario.name} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-ink">{scenario.name}</span><span className="financial-number text-sm font-semibold text-neg">{decimal(scenario.impactPct, "%")}</span></div><div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-ink-faint"><span>{money(scenario.valueImpact)} impact</span><span>{money(scenario.endValue)} remaining</span></div></div>)}</div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-surface-2 p-3"><div className="eyebrow">Downside resilience</div><div className={`financial-number mt-2 text-xl font-semibold ${scoreTone(projection.resilience?.downsideScore)}`}>{projection.resilience?.downsideScore}/100</div></div><div className="rounded-xl bg-surface-2 p-3"><div className="eyebrow">Asset balance</div><div className={`financial-number mt-2 text-xl font-semibold ${scoreTone(projection.resilience?.balanceScore)}`}>{projection.resilience?.balanceScore}/100</div></div></div>
          </article>
        </div>

        <details className="portfolio-card-outlined group"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink"><span>See the exact logic and fund-level assumptions</span><span className="text-accent group-open:rotate-45" aria-hidden="true">+</span></summary><div className="mt-4 border-t border-line pt-4"><p className="text-sm leading-6 text-ink-muted">{projection.methodology}</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-xs"><thead className="text-left text-ink-faint"><tr><th className="pb-2">Holding</th><th className="pb-2">Bucket</th><th className="pb-2 text-right">Weight</th><th className="pb-2 text-right">Prior</th><th className="pb-2 text-right">Observed</th><th className="pb-2 text-right">Model</th><th className="pb-2 text-right">Evidence weight</th></tr></thead><tbody>{projection.holdingAssumptions.map((item) => <tr key={item.schemeCode} className="border-t border-line"><th scope="row" className="max-w-[280px] py-3 pr-3 text-left font-medium text-ink">{item.schemeName || item.schemeCode}</th><td className="py-3 text-ink-muted">{item.bucket}</td><td className="financial-number py-3 text-right">{decimal(item.weight, "%")}</td><td className="financial-number py-3 text-right">{decimal(item.priorReturnPct, "%")}</td><td className="financial-number py-3 text-right">{decimal(item.observedReturnPct, "%")}</td><td className="financial-number py-3 text-right font-semibold text-accent">{decimal(item.expectedReturnPct, "%")}</td><td className="financial-number py-3 text-right">{decimal(item.credibilityPct, "%")}</td></tr>)}</tbody></table></div><ul className="mt-4 grid gap-2 text-xs leading-5 text-ink-faint md:grid-cols-2">{projection.limitations.map((item) => <li key={item} className="rounded-lg bg-surface-2 p-3">{item}</li>)}</ul></div></details>
      </>}

      <div className="grid portfolio-grid-gap lg:grid-cols-3">
        {[["Strengths", strengths, "positive"], ["Risks to review", weaknesses, "warning"], ["Research next", research.map((item) => item.note || item.category), "neutral"]].map(([title, items, tone]) => <article key={title} className="portfolio-card-outlined"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink">{title}</h3><StatusPill tone={tone}>{items.length}</StatusPill></div>{items.length ? <ul className="mt-4 space-y-3 text-sm leading-6 text-ink-muted">{items.slice(0, 6).map((item, index) => <li key={`${title}-${index}`} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul> : <p className="mt-4 text-sm leading-6 text-ink-muted">No items were supplied for this section.</p>}</article>)}
      </div>
    </section>
  );
}

function ChangesSection({ diff }) {
  return (
    <section id="portfolio-changes" className="portfolio-section" aria-labelledby="portfolio-changes-title">
      <SectionHeader eyebrow="Changes since previous statement" title="Approval requires an authoritative snapshot diff" detail="MF Pulse does not compare browser copies of holdings or infer statement changes locally." />
      <div className="portfolio-card-outlined">
        <h2 id="portfolio-changes-title" className="sr-only">Changes since previous statement</h2>
        {diff ? <pre className="overflow-x-auto text-xs text-ink-muted">{JSON.stringify(diff, null, 2)}</pre> : <div className="rounded-xl bg-surface-2 p-5"><h3 className="text-sm font-semibold text-ink">No server-backed statement diff is available.</h3><p className="mt-2 text-sm leading-6 text-ink-muted">Added and removed funds, unit changes, folio changes, value movement, allocation movement and risk movement will appear only after the import draft/diff API supplies both snapshot IDs and requires approval.</p></div>}
      </div>
    </section>
  );
}

function ProvenanceSection({ summary, computedAt, unresolved }) {
  return (
    <section id="portfolio-provenance" className="portfolio-section" aria-labelledby="portfolio-provenance-title">
      <SectionHeader eyebrow="Sources, methodology and limitations" title="Know what is stored, valued and still unavailable" />
      <div className="grid portfolio-grid-gap lg:grid-cols-3">
        <article className="portfolio-card-outlined"><h3 className="text-sm font-semibold text-ink">Sources</h3><ul className="mt-4 space-y-2 text-sm leading-6 text-ink-muted"><li>Statement-derived units and cost evidence.</li><li>AMFI-derived scheme and latest NAV universe.</li><li>Portfolio intelligence API response generated {dateTime(computedAt)}.</li></ul></article>
        <article className="portfolio-card-outlined"><h3 className="text-sm font-semibold text-ink">Valuation status</h3><ul className="mt-4 space-y-2 text-sm leading-6 text-ink-muted"><li>Official NAV date: {shortDate(summary?.latestOfficialNavDate ?? summary?.valuationDate)}.</li><li>Confidence: {summary?.valuationConfidence || "Not supplied"}.</li><li>Unresolved holdings: {unresolved.length}.</li></ul></article>
        <article className="portfolio-card-outlined"><h3 className="text-sm font-semibold text-ink">Backend-gated controls</h3><p className="mt-4 text-sm leading-6 text-ink-muted">Review/edit match/exclude/restore/approve, settings, reports, deletion, valuation ranges and authoritative statement diff remain hidden until their authenticated APIs exist.</p></article>
      </div>
      <p id="portfolio-provenance-title" className="text-xs leading-5 text-ink-faint">Portfolio research is informational and is not a suitability assessment or recommendation. Missing evidence is displayed as unavailable.</p>
    </section>
  );
}

function ImportWorkspace({ file, fileUrl, statementType, setStatementType, dragging, setDragging, selectFile, uploadInputRef, processStatement, busy, uploadPhase, error, message, importResult, noticeRef, onDrop, cancelUpload, onViewPortfolio, onUploadAnother }) {
  return (
    <section id="portfolio-import" className="portfolio-section" aria-labelledby="portfolio-import-title">
      <SectionHeader eyebrow="Import statement" title="Upload a supported PDF with truthful persistence state" detail="The current endpoint parses and saves in one transaction. Parsed-holding review and approval cannot be added safely until the server exposes an import draft." />
      {importResult && <ImportResultReview result={importResult} onViewPortfolio={onViewPortfolio} onUploadAnother={onUploadAnother} />}
      <div className="grid min-w-0 portfolio-grid-gap lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="portfolio-card-outlined">
          <h2 id="portfolio-import-title" className="sr-only">Portfolio statement import</h2>
          <div className="rounded-xl border border-warn/25 bg-warn/10 p-4"><div className="eyebrow text-warn">Current contract: immediate persistence</div><p className="mt-2 text-sm leading-6 text-ink-muted">Selecting a file does not save anything. Choosing “Upload and save” sends it to the existing endpoint, which parses and upserts holdings immediately. There is no review-before-save draft yet.</p></div>
          <div className="mt-5 grid portfolio-grid-gap sm:grid-cols-3">{STATEMENT_TYPES.map((type) => <button key={type.key} type="button" onClick={() => setStatementType(type.key)} aria-pressed={statementType === type.key} className={`min-w-0 rounded-xl border p-4 text-left ${statementType === type.key ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-ink-muted hover:text-ink"}`}><span className="block text-sm font-semibold">{type.label}</span><span className="mt-1 block text-xs leading-5 opacity-80">{type.detail}</span></button>)}</div>
          <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`mt-5 grid min-h-[220px] place-items-center rounded-[1.5rem] border-2 border-dashed p-5 text-center ${dragging ? "border-accent bg-accent/10" : "border-line bg-bg"}`}>
            <input ref={uploadInputRef} type="file" accept="application/pdf,.pdf" aria-label="Choose a CAMS, KFintech, or MF Central PDF statement" aria-describedby="portfolio-file-help" onChange={(event) => selectFile(event.target.files?.[0] || null)} className="sr-only" />
            <div className="mx-auto max-w-md"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent"><FileIcon /></div><h3 className="mt-4 text-lg font-semibold text-ink">Drop your statement PDF here</h3><p id="portfolio-file-help" className="mt-2 text-sm leading-6 text-ink-muted">Unlocked CAMS, KFintech or verified MF Central PDF, maximum 15 MB.</p><button type="button" onClick={() => uploadInputRef.current?.click()} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-bg">Choose PDF</button></div>
          </div>

          {file && <div className="mt-5 grid min-w-0 portfolio-grid-gap xl:grid-cols-[280px_minmax(0,1fr)]"><div className="min-w-0 overflow-hidden rounded-[1.25rem] bg-surface-2 p-4"><div className="eyebrow">Selected file</div><div className="mt-2 break-all text-sm font-semibold leading-5 text-ink" title={file.name}>{file.name}</div><div className="mt-1 text-xs text-ink-faint">{(file.size / 1024 / 1024).toFixed(2)} MB · ready for server processing</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={processStatement} disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Uploading and saving…" : uploadPhase === "error" ? "Retry upload" : "Upload and save"}</button><button type="button" onClick={() => selectFile(null)} disabled={busy} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted disabled:opacity-50">Remove</button></div></div><div className="min-h-[280px] overflow-hidden rounded-[1.25rem] bg-surface-2"><object data={fileUrl} type="application/pdf" className="h-[380px] w-full" aria-label={`Preview of ${file.name}`}><div className="p-5 text-sm text-ink-muted">PDF preview is unavailable in this browser. You can still upload the selected statement.</div></object></div></div>}
          {message && <p ref={noticeRef} tabIndex={-1} className="mt-4 rounded-xl border border-pos/25 bg-pos/10 p-3 text-sm text-pos outline-none" role="status">{message}</p>}
          {error && <p ref={noticeRef} tabIndex={-1} className="mt-4 rounded-xl border border-neg/25 bg-neg/10 p-3 text-sm text-neg outline-none" role="alert">{error}</p>}
        </div>
        <aside className="space-y-4"><UploadStatus phase={uploadPhase} error={error} onCancel={cancelUpload} /><section className="portfolio-card-outlined"><div className="eyebrow">Privacy and evidence</div><ul className="mt-4 space-y-3 text-sm leading-6 text-ink-muted"><li>• Original PDF is not retained by default.</li><li>• Holdings are user-scoped server records.</li><li>• Failed or cancelled requests never display as saved.</li><li>• Password-protected PDFs require an unlocked export.</li></ul></section></aside>
      </div>
    </section>
  );
}

export default function PortfolioWorkspace() {
  const { data: session, status: authStatus } = useSession();
  const sessionKey = session?.user?.id || session?.user?.email || null;
  const [statementType, setStatementType] = useState(STATEMENT_TYPES[0].key);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [holdings, setHoldings] = useState([]);
  const [unresolved, setUnresolved] = useState([]);
  const [report, setReport] = useState(null);
  const [computedAt, setComputedAt] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [uploadPhase, setUploadPhase] = useState("idle");
  const [view, setView] = useState("dashboard");
  const uploadInputRef = useRef(null);
  const requestRef = useRef(null);
  const noticeRef = useRef(null);

  useEffect(() => {
    if (!file) { setFileUrl(""); return undefined; }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function loadHoldings() {
    const data = await portfolioApi.getHoldings();
    setHoldings(data.holdings || []);
    setUnresolved(data.unresolved || []);
    return data.holdings || [];
  }

  async function computeReport() {
    const data = await portfolioApi.getPresentationData();
    setReport(data.report);
    setComputedAt(data.computedAt || null);
    setUnresolved(data.unresolved || []);
    return data.report;
  }

  async function connectDemoPortfolio() {
    setConnecting(true); setError(""); setMessage("");
    try {
      const data = await portfolioApi.connect();
      setHoldings(data.holdings || []);
      setUnresolved(data.unresolved || []);
      setReport({ portfolioSummary: data.summary || {}, allocations: data.allocation || {}, topHoldings: data.topHoldings || [], performanceLeaders: data.performanceLeaders || [], strengths: data.strengths || [], weaknesses: data.weaknesses || [], researchOpportunities: data.researchOpportunities || [], bottomLine: data.bottomLine || null, projection: data.projection || null, risk: data.risk || null, diversification: data.diversification || null, concentration: data.concentration || null });
      setComputedAt(data.summary?.computedAt || null);
      setView("dashboard");
      setMessage(data.alreadyConnected ? "Your connected portfolio is already up to date." : "Demo portfolio connected. Every synthetic position is labelled as mock-connected.");
    } catch (err) { setError(err.message || "Portfolio could not be connected."); }
    finally { setConnecting(false); }
  }

  useEffect(() => {
    if (!sessionKey) return;
    let active = true;
    setLoadingPortfolio(true);
    loadHoldings()
      .then((items) => {
        if (!active) return null;
        if (!items.length) { setView("import"); return null; }
        setView("dashboard");
        return computeReport();
      })
      .catch((err) => { if (active) setError(`${err.message || "Portfolio could not be loaded."} Retry after checking your connection or signing in again.`); })
      .finally(() => { if (active) setLoadingPortfolio(false); });
    return () => { active = false; };
  }, [sessionKey]);

  function selectFile(nextFile) {
    setError(""); setMessage(""); setImportResult(null); setUploadPhase("idle");
    if (!nextFile) { setFile(null); return; }
    if ((nextFile.type && nextFile.type !== "application/pdf") || !/\.pdf$/i.test(nextFile.name)) {
      setError("Upload a supported PDF statement only."); setFile(null); return;
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      setError(`This PDF is ${(nextFile.size / 1024 / 1024).toFixed(1)} MB. The maximum supported size is 15 MB.`); setFile(null); return;
    }
    setFile(nextFile);
  }

  function onDrop(event) {
    event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0] || null);
  }

  function cancelUpload() { requestRef.current?.abort(); }

  async function processStatement() {
    setError(""); setMessage(""); setUploadPhase("idle");
    if (!file) { setError("Upload a CAMS, KFintech, or MF Central PDF statement first."); return; }
    setBusy(true); setUploadPhase("uploading");
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const form = new FormData(); form.append("source", statementType); form.append("file", file);
      setUploadPhase("processing");
      const data = await portfolioApi.uploadStatement(form, controller.signal);
      await loadHoldings(); await computeReport();
      setImportResult(data);
      setUploadPhase("complete");
      setMessage(`Portfolio saved and synced. ${data.imported} holding${data.imported === 1 ? "" : "s"} imported by the server. Review the accepted rows below.`);
      setView("import"); setFile(null);
      window.requestAnimationFrame(() => noticeRef.current?.focus());
    } catch (err) {
      const text = err.name === "AbortError" ? "Upload cancelled. Portfolio was not saved by this request." : `${uploadErrorMessage(err.body, err.status) || err.message || "Statement processing failed."} Portfolio was not shown as saved.`;
      setUploadPhase("error"); setError(text); window.requestAnimationFrame(() => noticeRef.current?.focus());
    } finally { requestRef.current = null; setBusy(false); }
  }

  const latestImportedAt = holdings.map((holding) => holding.importedAt).filter(Boolean).sort().at(-1) || null;
  const summary = report?.portfolioSummary || {};
  const allocations = {
    fund: (report?.topHoldings || []).map((item) => ({ ...item, name: item.name || item.schemeName, value: item.value ?? item.currentValue })),
    amc: report?.allocations?.amc || [],
    category: report?.allocations?.category || [],
    sector: report?.allocations?.sector || {},
    registrar: report?.allocations?.registrar || [],
  };

  function openImport() {
    setView("import");
    window.requestAnimationFrame(() => document.getElementById("portfolio-import")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function uploadAnotherStatement() {
    setImportResult(null);
    setMessage("");
    setError("");
    setUploadPhase("idle");
    setFile(null);
    window.requestAnimationFrame(() => uploadInputRef.current?.focus());
  }

  if (authStatus === "loading") return <div className="portfolio-shell" aria-label="Loading portfolio workspace"><div className="skeleton h-64 rounded-[1.75rem]" /><div className="grid portfolio-grid-gap sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton h-36 rounded-[1.15rem]" />)}</div></div>;
  if (!session) return <section className="portfolio-card-outlined mx-auto max-w-3xl p-6 shadow-float sm:p-8"><div className="eyebrow">Private workspace</div><h1 className="page-title mt-3">Sign in to view a persistent portfolio.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-ink-muted">Portfolio records are user-scoped and are never accepted into an anonymous browser session.</p><a href="/login?callbackUrl=/portfolio" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white">Sign in securely</a></section>;

  return (
    <div className="portfolio-shell">
      <PortfolioHeader holdings={holdings} summary={summary} computedAt={computedAt} latestImportedAt={latestImportedAt} onUpload={openImport} />
      {loadingPortfolio ? <div className="portfolio-section"><div className="skeleton h-36 rounded-[1.35rem]" /><div className="grid portfolio-grid-gap sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton h-36 rounded-[1.15rem]" />)}</div></div> : (
        <>
          {holdings.length > 0 && <nav className="flex gap-2 overflow-x-auto rounded-full bg-surface p-1 shadow-sm" aria-label="Portfolio sections">
            {[["Summary", "#portfolio-summary"], ["Leaders", "#performance-leaders"], ["History", "#value-history"], ["Holdings", "#portfolio-holdings"], ["Allocation", "#portfolio-allocation"], ["Intelligence", "#portfolio-intelligence"], ["Changes", "#portfolio-changes"], ["Sources", "#portfolio-provenance"]].map(([label, href]) => <a key={href} href={href} className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink">{label}</a>)}
          </nav>}

          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-full border border-line bg-surface p-1"><button type="button" onClick={() => setView("dashboard")} aria-pressed={view === "dashboard"} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${view === "dashboard" ? "bg-ink text-bg" : "text-ink-muted"}`}>Dashboard</button><button type="button" onClick={openImport} aria-pressed={view === "import"} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${view === "import" ? "bg-ink text-bg" : "text-ink-muted"}`}>Statement import</button></div>{holdings.length > 0 && <StatusPill tone="positive">{holdings.length} saved holding{holdings.length === 1 ? "" : "s"}</StatusPill>}</div>

          {view === "import" && <ImportWorkspace file={file} fileUrl={fileUrl} statementType={statementType} setStatementType={setStatementType} dragging={dragging} setDragging={setDragging} selectFile={selectFile} uploadInputRef={uploadInputRef} processStatement={processStatement} busy={busy} uploadPhase={uploadPhase} error={error} message={message} importResult={importResult} noticeRef={noticeRef} onDrop={onDrop} cancelUpload={cancelUpload} onViewPortfolio={() => setView("dashboard")} onUploadAnother={uploadAnotherStatement} />}

          {view === "dashboard" && !holdings.length && <section className="portfolio-card-outlined p-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/12 text-accent"><FileIcon /></div><h2 className="section-title mt-5">No saved portfolio yet.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-muted">Upload a supported statement to create user-scoped server holdings, or connect the clearly labelled demo portfolio for an interactive preview. Nothing is connected automatically.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={openImport} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white">Upload statement</button><button type="button" onClick={connectDemoPortfolio} disabled={connecting} className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-ink disabled:opacity-50">{connecting ? "Connecting…" : "Connect demo portfolio"}</button></div></section>}

          {view === "dashboard" && holdings.length > 0 && <><ExecutiveSummary summary={summary} computedAt={computedAt} /><PerformanceLeaders leaders={report?.performanceLeaders} /><ValueHistory history={report?.valueHistory || []} ranges={report?.valueHistoryRanges || []} /><HoldingsSection holdings={holdings} /><AllocationSection allocations={allocations} /><IntelligenceSection report={report} /><ChangesSection diff={report?.statementDiff} /><ProvenanceSection summary={summary} computedAt={computedAt} unresolved={unresolved} /></>}
        </>
      )}
    </div>
  );
}
