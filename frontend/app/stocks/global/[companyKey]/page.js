import { notFound } from "next/navigation";
import Link from "next/link";
import Nav from "../../../components/Nav";
import Footer from "../../../components/Footer";
import ProductBreadcrumbs from "../../../components/ProductBreadcrumbs";
import GlassPanel from "../../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../../components/ui/Badge";
import SectionHeader from "../../../components/ui/SectionHeader";
import GlobalEquityActions from "../../../components/stocks/GlobalEquityActions";
import { GlobalFinancialChart, GlobalPriceChart } from "../../../components/stocks/GlobalEquityCharts";
import { FiscalAiError } from "../../../lib/fiscalAi/client";
import { getGlobalEquityReport } from "../../../lib/fiscalAi/service";

export const dynamic = "force-dynamic";

const pct = (value) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const ratio = (value) => value == null ? "—" : `${Number(value).toFixed(2)}x`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const money = (value, currency = "USD", compact = false) => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 2 }).format(value);

export async function generateMetadata({ params }) {
  const { companyKey } = await params;
  return { title: `${decodeURIComponent(companyKey)} Global Equity Report — MF Pulse` };
}

export default async function GlobalEquityReportPage({ params }) {
  const { companyKey: encodedCompanyKey } = await params;
  const companyKey = decodeURIComponent(encodedCompanyKey);
  let report;
  try {
    report = await getGlobalEquityReport(companyKey);
  } catch (error) {
    if (error instanceof FiscalAiError && error.status === 404) notFound();
    throw error;
  }

  const { profile, priceSeries, financials, ratios, news, brief } = report;
  const latestPrice = priceSeries.prices.at(-1) || null;
  const latestRatios = ratios.at(-1) || null;
  const currency = priceSeries.listing.tradingCurrency || profile.listing.tradingCurrency || "USD";
  const reportingCurrency = financials.at(-1)?.currency || profile.reportingCurrency || currency;
  const newsBlocks = news.summary ? news.summary.split(/\n{2,}/).filter(Boolean) : [];
  const newsBullets = newsBlocks[0]?.startsWith("- ")
    ? newsBlocks[0].split("\n").map((item) => item.replace(/^-\s*/, "").trim()).filter(Boolean)
    : [];
  const newsNarrative = newsBullets.length ? newsBlocks.slice(1) : newsBlocks;

  return (
    <>
      <Nav active="/stocks" />
      <main id="main-content" className="container-px mx-auto max-w-6xl pb-16 pt-8">
        <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Global equities", "/stocks/global"], [profile.name, null]]} />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
              <span className="font-mono">{profile.listing.exchangeCode}:{profile.listing.ticker}</span>
              <Badge tone={profile.status === "active" ? "pos" : "neutral"}>{profile.status || "status unavailable"}</Badge>
              <Badge tone="accent">Fiscal.ai</Badge>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{profile.name}</h1>
            <p className="mt-2 text-sm text-ink-muted">{profile.sector || "Sector unavailable"}{profile.industry ? ` · ${profile.industry}` : ""} · {profile.country || "Country unavailable"}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
              <span><strong className="text-ink">{latestPrice ? money(latestPrice.close, currency) : "Price unavailable"}</strong>{latestPrice && ` · ${dateLabel(latestPrice.date)}`}</span>
              <span>Market cap <strong className="text-ink">{money(profile.marketCapUsd, "USD", true)}</strong></span>
              <span>Reporting currency <strong className="text-ink">{profile.reportingCurrency || "—"}</strong></span>
            </div>
            <div className="mt-5"><GlobalEquityActions /></div>
          </div>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Research brief" title="What the evidence says" />
            <p className="text-sm leading-6 text-ink-muted">{brief.headline}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-faint">
              <Badge tone="pos">{priceSeries.prices.length} price points</Badge>
              <Badge tone="accent">{financials.length} annual statements</Badge>
              <Badge tone="neutral">{report.source.fetchedDatasets.length} datasets</Badge>
            </div>
          </GlassPanel>
        </section>

        <GlassPanel className="mt-7 p-5">
          <SectionHeader eyebrow="Business" title="Company profile" action={profile.fscl} />
          {profile.description ? <p className="max-w-4xl text-sm leading-7 text-ink-muted">{profile.description}</p> : <EmptyState icon="🏢" title="No description available" />}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["CEO", profile.chiefExecutiveOfficer], ["Founded", profile.foundingYear], ["IPO year", profile.ipoYear], ["Legal domicile", profile.legalDomicile]].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-surface-2 p-3"><div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div><div className="mt-1 text-sm font-semibold text-ink">{value || "—"}</div></div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="mt-6 p-5">
          <SectionHeader eyebrow="Market history" title="Split-adjusted closing price" action={`${priceSeries.listing.exchangeCode || profile.listing.exchangeCode} · ${currency}`} />
          <GlobalPriceChart points={priceSeries.prices} currency={currency} />
          <p className="mt-3 text-[11px] leading-5 text-ink-faint">Fiscal.ai states that daily prices are split-adjusted. This chart shows price return only and does not add dividends.</p>
        </GlassPanel>

        <GlassPanel className="mt-6 p-5">
          <SectionHeader eyebrow="Fundamentals" title="Annual financial trend" action={reportingCurrency} />
          <GlobalFinancialChart rows={financials} currency={reportingCurrency} />
        </GlassPanel>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Revenue growth", pct(latestRatios?.revenueGrowth)],
            ["Net margin", pct(latestRatios?.netMargin)],
            ["Return on equity", pct(latestRatios?.roe)],
            ["Debt / equity", ratio(latestRatios?.debtToEquity)],
            ["P / E", ratio(latestRatios?.pe)],
            ["P / B", ratio(latestRatios?.pb)],
            ["EV / EBITDA", ratio(latestRatios?.evToEbitda)],
            ["Dividend yield", pct(latestRatios?.dividendYield)],
          ].map(([label, value]) => <GlassPanel key={label} className="p-4"><div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div><div className="mt-2 text-xl font-semibold text-ink tnum">{value}</div><div className="mt-1 text-[11px] text-ink-faint">FY{latestRatios?.fiscalYear || "—"}</div></GlassPanel>)}
        </section>

        <GlassPanel className="mt-6 p-5">
          <SectionHeader eyebrow="MFPulse interpretation" title="Strengths, risks, and questions" />
          <p className="mb-4 max-w-4xl text-xs leading-5 text-ink-faint">{brief.methodology}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {[["Strengths", brief.strengths, "text-accent"], ["Risks", brief.risks, "text-amber-400"], ["Questions", brief.questions, "text-sky-300"]].map(([title, items, tone]) => (
              <div key={title} className="rounded-2xl border border-line bg-surface-2 p-4">
                <h2 className={`text-sm font-semibold ${tone}`}>{title}</h2>
                <ul className="mt-3 space-y-3">{items.map((item) => <li key={item} className="text-xs leading-5 text-ink-muted">{item}</li>)}</ul>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="mt-6 p-5">
          <SectionHeader eyebrow="Fiscal.ai generated context" title="Recent news summary" action={news.generatedAt ? `Generated ${dateLabel(news.generatedAt)}` : null} />
          {newsBlocks.length ? <div className="space-y-4 text-sm leading-7 text-ink-muted">
            {newsBullets.length > 0 && <ul className="grid gap-2 rounded-2xl bg-surface-2 p-4 md:grid-cols-2">{newsBullets.map((item) => <li key={item} className="flex gap-2 text-xs leading-5"><span aria-hidden className="text-accent">•</span><span>{item}</span></li>)}</ul>}
            {newsNarrative.map((block, index) => <p key={`${index}-${block.slice(0, 20)}`}>{block}</p>)}
          </div> : <EmptyState icon="📰" title="No qualifying news summary available" hint="Fiscal.ai may return no summary when recent collected news does not qualify." />}
          {(news.from || news.to) && <p className="mt-4 text-[11px] text-ink-faint">News window: {dateLabel(news.from)} to {dateLabel(news.to)}. This is provider-generated context, not MFPulse analysis.</p>}
        </GlassPanel>

        {profile.peers.length > 0 && <GlassPanel className="mt-6 p-5">
          <SectionHeader eyebrow="Comparison" title="Fiscal.ai peers" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{profile.peers.slice(0, 9).map((peer) => <Link key={peer.companyKey} href={`/stocks/global/${encodeURIComponent(peer.companyKey)}`} className="rounded-2xl border border-line bg-surface-2 p-4 text-sm font-semibold text-ink transition hover:border-accent/35"><span>{peer.name}</span><span className="mt-1 block font-mono text-[11px] font-normal text-ink-faint">{peer.companyKey}</span></Link>)}</div>
        </GlassPanel>}

        <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-4 text-xs leading-5 text-ink-faint">
          Source: Fiscal.ai REST API. Dataset availability depends on the connected plan and the company&apos;s available datasets. MFPulse does not fill missing values, infer a recommendation, or expose the API credential to the browser.
        </div>
      </main>
      <Footer note={<span>This research report is informational and may contain provider or model-generated errors. Verify filings and seek regulated advice before investing.</span>} />
    </>
  );
}
