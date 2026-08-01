// Stock Intelligence — Company Intelligence page (Stock Master + Company Profile + Financials +
// Metrics + Valuation + Timeline + Peers, Section 13). First real frontend vertical slice of the
// Stock Intelligence domain — a deliberately separate product surface from /fund/[scheme_code],
// consuming the new /lib/stocks/* service layer directly (same "Server Component calls lib/
// functions" pattern the fund page already uses, not an internal fetch() round-trip). No section
// here fabricates a figure: every empty state below reflects a real absence of data, not a bug —
// see docs/STOCK_DATA_SOURCE_MATRIX.md for why (no live external data source is wired in yet).
import { notFound } from "next/navigation";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import GlassPanel from "../../components/ui/GlassPanel";
import SectionHeader from "../../components/ui/SectionHeader";
import Badge, { EmptyState } from "../../components/ui/Badge";
import { getCompanyPageContract } from "../../lib/stocks/companyProfile";
import { getStatementsForCompany } from "../../lib/stocks/financialStatements";
import { computeMetrics } from "../../lib/stocks/metrics";
import { getLatestValuation, getPeerCompanies } from "../../lib/stocks/valuation";
import { getCompanyTimeline, getResultsCalendar } from "../../lib/stocks/timeline";
import { getCompanyCommodityExposures } from "../../lib/stocks/commodityService";
import { getSector } from "../../lib/stocks/sectors";

export const revalidate = 0; // live DB-backed research data, not a static/prebuilt bundle like the MF fund page

export async function generateMetadata({ params }) {
  const { id } = await params;
  const contract = await getCompanyPageContract(id).catch(() => null);
  return { title: contract ? `${contract.company.displayName} — Stock Research` : "Company — MF Pulse Stocks" };
}

const num = (v) => (v == null ? null : Number(v));
const fmtPct = (v, dp = 1) => (v == null ? null : `${num(v) >= 0 ? "+" : ""}${num(v).toFixed(dp)}%`);
const fmtRatio = (v, dp = 2) => (v == null ? null : num(v).toFixed(dp));
const fmtDate = (d) => (d == null ? null : new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }));

function MetricTile({ label, value, unit }) {
  const display = value == null ? "—" : unit === "PERCENT" ? fmtPct(value) : unit === "RATIO" ? `${fmtRatio(value)}x` : fmtRatio(value, 2);
  return (
    <div className="rounded-lg border border-line bg-white/[0.015] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tnum ${value == null ? "text-ink-faint" : "text-ink"}`}>{display}</div>
    </div>
  );
}

const EVENT_TYPE_LABELS = {
  results: "Results", filing: "Filing", annual_report: "Annual Report", investor_presentation: "Investor Presentation",
  concall: "Concall", dividend: "Dividend", buyback: "Buyback", bonus: "Bonus", split: "Split", rights_issue: "Rights Issue",
  fundraising: "Fundraising", ma: "M&A", promoter_activity: "Promoter Activity", management_change: "Management Change",
  credit_rating: "Credit Rating", capacity_expansion: "Capacity Expansion", order: "Order", regulatory: "Regulatory",
};

const SECTION_LINKS = ["Overview", "Financials", "Valuation", "Peers", "Timeline", "Documents", "Sector", "Raw Materials", "Learn", "Notes"];

const METRIC_LESSONS = [
  ["ROCE", "Return on capital employed shows how efficiently capital is used. It is most useful when compared across time and against peers, not as a one-year shortcut."],
  ["Debt / Equity", "Debt can amplify returns and risk. Low debt is not automatically good; high debt is not automatically bad without cash-flow and sector context."],
  ["CFO / PAT", "Cash conversion checks whether accounting profit is turning into operating cash. One bad year may be working-capital timing; repeated weakness deserves investigation."],
];

function ResearchActions({ company }) {
  const searchLabel = encodeURIComponent(company.displayName || company.nseSymbol || company.id);
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <a href="#overview" className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-bg">Research</a>
      <a href={`/login?callbackUrl=/stocks/${company.id}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted">Watch</a>
      <a href={`/stocks?comparison=${searchLabel}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted">Compare</a>
      <a href={`/login?callbackUrl=/stocks/${company.id}#notes`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold text-ink-muted">Take note</a>
    </div>
  );
}

function SectionNav() {
  return (
    <nav className="sticky top-24 z-30 mb-6 flex gap-2 overflow-x-auto rounded-full border border-line bg-surface/92 p-1 shadow-sm backdrop-blur-xl" aria-label="Company research sections">
      {SECTION_LINKS.map((label) => <a key={label} href={`#${label.toLowerCase().replaceAll(" ", "-")}`} className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink">{label}</a>)}
    </nav>
  );
}

export default async function StockPage({ params }) {
  const { id } = await params;
  const contract = await getCompanyPageContract(id);
  if (!contract) notFound();
  const { company, exchangeListings, ownership, management, subsidiaries, businessSegments } = contract;

  const [pnlStatements, valuation, peers, timeline, resultsCalendar] = await Promise.all([
    getStatementsForCompany(id, { statementType: "pnl", periodType: "annual", limit: 3 }),
    getLatestValuation(id),
    getPeerCompanies(id),
    getCompanyTimeline(id, { limit: 8 }),
    getResultsCalendar(id, { limit: 1 }),
  ]);
  const [balanceSheetStatement, cashFlowStatement] = await Promise.all([
    getStatementsForCompany(id, { statementType: "balance_sheet", periodType: "annual", limit: 1 }).then((r) => r[0] ?? null),
    getStatementsForCompany(id, { statementType: "cash_flow", periodType: "annual", limit: 1 }).then((r) => r[0] ?? null),
  ]);
  const [commodityExposures, sector] = await Promise.all([
    getCompanyCommodityExposures(id).catch(() => []),
    company.sectorId ? getSector(company.sectorId).catch(() => null) : Promise.resolve(null),
  ]);
  const latestPnl = pnlStatements[0] ?? null;
  const hasAnyStatement = Boolean(latestPnl || balanceSheetStatement || cashFlowStatement);
  const metrics = hasAnyStatement
    ? computeMetrics({ pnl: latestPnl?.fields, balanceSheet: balanceSheetStatement?.fields, cashFlow: cashFlowStatement?.fields, sharesOutstanding: valuation?.sharesOutstanding })
    : null;

  const promoterHolding = ownership.find((o) => o.holderType === "promoter");

  return (
    <>
      <Nav active="/stocks" />
      <main className="container-px mx-auto max-w-5xl pb-16 pt-8">
        {/* Identity */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
            {company.nseSymbol && <span className="font-mono">{company.nseSymbol}</span>}
            {company.bseCode && <span className="font-mono">BSE {company.bseCode}</span>}
            <Badge tone={company.listingStatus === "listed" ? "pos" : "neutral"}>{company.listingStatus}</Badge>
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{company.displayName}</h1>
          <div className="mt-1 text-[13px] text-ink-muted">{company.legalName}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
            {valuation?.price != null ? (
              <span className="text-ink font-semibold tnum">₹{fmtRatio(valuation.price)}</span>
            ) : (
              <Badge tone="neutral" title="No licensed price feed is connected yet — see docs/STOCK_DATA_SOURCE_MATRIX.md">Price unavailable</Badge>
            )}
            {valuation?.marketCap != null && <span>Mkt Cap ₹{fmtRatio(valuation.marketCap, 0)} Cr</span>}
            {valuation?.asOfDate && <span>as of {fmtDate(valuation.asOfDate)}</span>}
            {sector?.name && <span>{sector.name}</span>}
          </div>
          <ResearchActions company={company} />
        </div>

        <SectionNav />

        {/* Business overview */}
        <GlassPanel id="overview" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Company" title="Business overview" />
          {company.description ? (
            <>
              <p className="text-[13px] leading-relaxed text-ink-muted">{company.description}</p>
              {company.descriptionSource && <div className="mt-2 text-[11px] text-ink-faint">Source: {company.descriptionSource}{company.descriptionAsOf ? ` · as of ${fmtDate(company.descriptionAsOf)}` : ""}</div>}
            </>
          ) : (
            <EmptyState icon="🏢" title="No business description on file yet" hint="Company profile data has not been ingested for this company." />
          )}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3">
            {company.website && <div><span className="text-ink-faint">Website </span><a href={company.website} className="text-accent-soft hover:underline" target="_blank" rel="noreferrer">{company.website}</a></div>}
            {company.registeredOffice && <div><span className="text-ink-faint">Registered office </span><span className="text-ink-muted">{company.registeredOffice}</span></div>}
            {promoterHolding?.holdingPercent != null && <div><span className="text-ink-faint">Promoter holding </span><span className="text-ink-muted tnum">{fmtRatio(promoterHolding.holdingPercent, 1)}%<span className="text-ink-faint"> (as of {fmtDate(promoterHolding.asOfDate)})</span></span></div>}
            {exchangeListings.filter((l) => l.isActive).map((l) => (
              <div key={l.exchange}><span className="text-ink-faint">{l.exchange} </span><span className="text-ink-muted font-mono">{l.symbolOrCode}</span></div>
            ))}
          </div>
        </GlassPanel>

        {/* Key metrics */}
        <GlassPanel id="financials" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Fundamentals" title="Key metrics" action={latestPnl ? `FY${latestPnl.fiscalYear}, annual` : null} />
          {metrics ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile label="Revenue Growth" value={metrics.revenueGrowth.value} unit={metrics.revenueGrowth.unit} />
              <MetricTile label="EBITDA Margin" value={metrics.ebitdaMargin.value} unit={metrics.ebitdaMargin.unit} />
              <MetricTile label="Net Profit Margin" value={metrics.netProfitMargin.value} unit={metrics.netProfitMargin.unit} />
              <MetricTile label="ROE" value={metrics.roe.value} unit={metrics.roe.unit} />
              <MetricTile label="ROCE" value={metrics.roce.value} unit={metrics.roce.unit} />
              <MetricTile label="Debt / Equity" value={metrics.debtToEquity.value} unit={metrics.debtToEquity.unit} />
              <MetricTile label="Interest Coverage" value={metrics.interestCoverage.value} unit={metrics.interestCoverage.unit} />
              <MetricTile label="CFO / PAT" value={metrics.cfoToPat.value} unit={metrics.cfoToPat.unit} />
            </div>
          ) : (
            <EmptyState icon="📊" title="No financial statements on file yet" hint="Metrics are computed only from real, ingested statements — never estimated. See docs/STOCK_DATA_SOURCE_MATRIX.md for sourcing status." />
          )}
        </GlassPanel>

        {/* Valuation */}
        <GlassPanel id="valuation" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Valuation" title="Current valuation" />
          {valuation ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile label="P/E" value={valuation.pe} unit="RATIO" />
              <MetricTile label="P/B" value={valuation.pb} unit="RATIO" />
              <MetricTile label="EV/EBITDA" value={valuation.evEbitda} unit="RATIO" />
              <MetricTile label="Dividend Yield" value={valuation.dividendYield} unit="PERCENT" />
            </div>
          ) : (
            <EmptyState icon="📈" title="No valuation snapshot on file yet" />
          )}
          <p className="mt-3 text-[11px] text-ink-faint">A single ratio alone never means &ldquo;cheap&rdquo; or &ldquo;expensive&rdquo; — compare against this company&apos;s own history, its sector, and its peers before drawing a conclusion.</p>
        </GlassPanel>

        {/* Peers */}
        <GlassPanel id="peers" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Comparison" title="Peers" action={peers.industryId ? "Same industry" : null} />
          {peers.peers.length > 0 ? (
            <div className="divide-y divide-line">
              {peers.peers.map((p) => (
                <a key={p.companyId} href={`/stocks/${p.companyId}`} className="flex items-center justify-between py-2 text-[13px] hover:text-accent-soft">
                  <span className="text-ink-muted">{p.displayName}</span>
                  <span className="tnum text-ink-faint">{p.valuation?.pe != null ? `P/E ${fmtRatio(p.valuation.pe)}` : "—"}</span>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState icon="⚖️" title="No peers on file yet" hint={peers.reason || "No other companies share this industry classification yet."} />
          )}
        </GlassPanel>

        {/* Timeline */}
        <GlassPanel id="timeline" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Research" title="Company timeline" />
          {resultsCalendar[0] && (
            <div className="mb-3 rounded-lg border border-line bg-white/[0.015] px-3 py-2 text-[12.5px]">
              <span className="text-ink-faint">Next results ({resultsCalendar[0].periodType}): </span>
              <span className="text-ink-muted">{resultsCalendar[0].expectedDate ? fmtDate(resultsCalendar[0].expectedDate) : "date not yet announced"}</span>
              <Badge tone={resultsCalendar[0].status === "published" ? "pos" : "neutral"} title="">{resultsCalendar[0].status}</Badge>
            </div>
          )}
          {timeline.length > 0 ? (
            <ul className="space-y-3">
              {timeline.map((event) => (
                <li key={event.id} className="text-[13px]">
                  <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                    <span>{fmtDate(event.eventDate)}</span>
                    <Badge tone="neutral">{EVENT_TYPE_LABELS[event.eventType] || event.eventType}</Badge>
                  </div>
                  <div className="mt-0.5 text-ink-muted">{event.headline}</div>
                  {event.summary && <div className="mt-0.5 text-[12px] text-ink-faint">{event.summary}</div>}
                  <div className="mt-0.5 text-[11px] text-ink-faint">Source: {event.source}{event.sourceUrl ? <> · <a href={event.sourceUrl} className="hover:underline" target="_blank" rel="noreferrer">link</a></> : null}</div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="🕘" title="No events recorded yet" hint="Results, filings, corporate actions, and other events will appear here as they're ingested from sourced, cited material." />
          )}
        </GlassPanel>

        <GlassPanel id="documents" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Documents" title="Annual reports, filings and concalls" />
          <EmptyState icon="📄" title="Document index is not populated for this company yet" hint="Annual reports, investor presentations, concalls and exchange filings will appear only after sourced document ingestion is connected." />
        </GlassPanel>

        <GlassPanel id="sector" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Sector" title="Operating context" action={sector?.name || "Awaiting sector mapping"} />
          {sector ? (
            <p className="text-sm leading-6 text-ink-muted">{sector.description || "Sector description has not been sourced yet."}</p>
          ) : (
            <EmptyState icon="🏭" title="Sector mapping unavailable" hint="Sector-specific operating metrics stay hidden until the backend maps this company to a sector." />
          )}
        </GlassPanel>

        <GlassPanel id="raw-materials" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Raw materials" title="Commodity exposure" action="Source gated" />
          {commodityExposures.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {commodityExposures.map((exposure) => (
                <div key={exposure.id} className="rounded-2xl bg-surface-2 p-4 text-sm">
                  <div className="font-semibold text-ink">{exposure.commodityName}</div>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{exposure.exposureType} · {exposure.significance || "significance not stated"}</p>
                  {exposure.description && <p className="mt-2 text-xs leading-5 text-ink-faint">{exposure.description}</p>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="⛓️" title="No sourced commodity exposure on file" hint="MF Pulse will not infer input costs from sector stereotypes. See Markets → Raw Materials for feed status." />
          )}
        </GlassPanel>

        <GlassPanel id="learn" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Learn in context" title="How to interpret key stock metrics" />
          <div className="grid gap-3 md:grid-cols-3">
            {METRIC_LESSONS.map(([label, detail]) => (
              <div key={label} className="rounded-2xl bg-surface-2 p-4">
                <div className="text-sm font-semibold text-ink">{label}</div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel id="notes" className="p-5 mb-6 scroll-mt-32">
          <SectionHeader eyebrow="Private research notes" title="Thesis, risks, catalysts and questions" action="Login required" />
          <div className="grid gap-3 md:grid-cols-3">
            {["Thesis", "Risks", "Catalysts", "Questions", "Valuation", "Management"].map((label) => (
              <div key={label} className="rounded-2xl border border-dashed border-line bg-surface-2 p-4">
                <div className="text-sm font-semibold text-ink">{label}</div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">Private note category ready for the research-notes API. No public community content is copied or embedded.</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Management */}
        {management.length > 0 && (
          <GlassPanel className="p-5 mb-6">
            <SectionHeader eyebrow="Company" title="Management" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {management.map((m, i) => (
                <div key={i} className="text-[13px]">
                  <span className="text-ink-muted">{m.personName}</span>
                  <span className="text-ink-faint"> — {m.role}</span>
                </div>
              ))}
            </div>
          </GlassPanel>
        )}

        {/* Business segments */}
        {businessSegments.length > 0 && (
          <GlassPanel className="p-5 mb-6">
            <SectionHeader eyebrow="Company" title="Business segments" />
            <div className="space-y-2">
              {businessSegments.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-muted">{s.segmentName}</span>
                  {s.revenueSharePercent != null && <span className="tnum text-ink-faint">{fmtRatio(s.revenueSharePercent, 1)}% of revenue</span>}
                </div>
              ))}
            </div>
          </GlassPanel>
        )}

        {/* Subsidiaries */}
        {subsidiaries.length > 0 && (
          <GlassPanel className="p-5 mb-6">
            <SectionHeader eyebrow="Company" title="Subsidiaries" />
            <div className="space-y-1.5">
              {subsidiaries.map((s, i) => (
                <div key={i} className="text-[13px] text-ink-muted">{s.subsidiaryName} <span className="text-ink-faint">({s.relationship}{s.ownershipPercent != null ? `, ${fmtRatio(s.ownershipPercent, 0)}%` : ""})</span></div>
              ))}
            </div>
          </GlassPanel>
        )}
      </main>
      <Footer note={<span>Research data · MF Pulse Stocks (beta) · not investment advice · a single ratio is never a recommendation.</span>} />
    </>
  );
}
