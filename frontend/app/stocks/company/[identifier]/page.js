import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "../../../components/Nav";
import Footer from "../../../components/Footer";
import ProductBreadcrumbs from "../../../components/ProductBreadcrumbs";
import TradingViewAdvancedChart from "../../../components/stocks/TradingViewAdvancedChart";
import GlassPanel from "../../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../../components/ui/Badge";
import SectionHeader from "../../../components/ui/SectionHeader";
import { getArticlesForEntity, relativeTime } from "../../../lib/news";
import { getCompanyPeers, getCompanyResearch, getOfficialCompanyResearchLinks, getTradingViewSymbol, companyResearchHref } from "../../../lib/stocks/universe";
import { getStrategiesForIndustry, RESEARCH_LAYERS } from "../../../lib/stocks/strategyFramework";
import { getEvidenceDossier } from "../../../lib/stocks/evidenceFramework";
import { getIndustryResearchModel, getOpenCompanyProfile } from "../../../lib/stocks/researchProfiles";

export const dynamic = "force-dynamic";

const studyChecks = [
  ["Business", "Revenue drivers, unit economics, competitive position and concentration."],
  ["Financials", "Growth, margins, cash conversion, leverage and dilution across a cycle."],
  ["Governance", "Capital allocation, related parties, auditor notes and promoter pledging."],
  ["Valuation", "Sector-appropriate multiples, history, peers and scenario expectations."],
  ["Risk", "Disconfirming evidence, downside triggers and what would change the thesis."],
];

export async function generateMetadata({ params }) {
  const { identifier } = await params;
  const company = getCompanyResearch(identifier);
  if (!company) return { title: "Company not found — MF Pulse" };
  const profile = getOpenCompanyProfile(company);
  const title = `${company.name} Share Price & Research — MF Pulse`;
  const description = `${profile.description} Study its business model, industry KPIs, risks, filings, peers and price chart.`;
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function CompanyResearchPage({ params }) {
  const { identifier } = await params;
  const company = getCompanyResearch(identifier);
  if (!company) notFound();

  const officialLinks = getOfficialCompanyResearchLinks(company);
  const tradingViewSymbol = getTradingViewSymbol(company);
  const peers = getCompanyPeers(company);
  const strategySet = getStrategiesForIndustry(company.industry);
  const dossier = getEvidenceDossier(company.industry);
  const profile = getOpenCompanyProfile(company);
  const researchModel = getIndustryResearchModel(company.industry);
  const news = company.nseSymbol ? await getArticlesForEntity({ entityType: "company", entityName: company.nseSymbol, limit: 6 }) : [];

  return <>
    <Nav active="/stocks" />
    <main id="main-content" className="container-px py-8 sm:py-11">
      <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Company universe", "/stocks/universe"], [company.name, null]]} />

      <section className="relative overflow-hidden rounded-[1.8rem] border border-line bg-surface p-5 shadow-glass sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_15%,rgba(74,201,178,0.14),transparent_34%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div><div className="flex flex-wrap items-center gap-2"><Badge tone="accent">Company research terminal</Badge>{company.memberships.map((membership) => <Badge key={membership.key} tone="pos">{membership.name}</Badge>)}</div><h1 className="page-title mt-4 max-w-4xl">{company.name}</h1><p className="mt-3 text-sm leading-6 text-ink-muted">{company.industry} · {company.nseSymbol ? `NSE ${company.nseSymbol}` : `BSE ${company.bseCode}`}{company.isin ? ` · ${company.isin}` : ""}</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {[[tradingViewSymbol || "—", "Market symbol"], [company.memberships.length, "Index memberships"], [peers.length, "Visible peers"], [officialLinks.length, "Official routes"]].map(([value, label]) => <div key={label} className="rounded-2xl border border-line bg-surface-2/90 p-3"><div className="financial-number truncate text-sm font-semibold text-ink">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">{label}</div></div>)}
          </div>
        </div>
      </section>

      <nav className="sticky top-[76px] z-30 -mx-4 mt-4 flex gap-2 overflow-x-auto border-y border-line bg-bg/92 px-4 py-3 shadow-sm backdrop-blur-xl sm:mx-0 sm:rounded-full sm:border" aria-label="Company research sections">
        {[["Overview", "#overview"], ["Chart", "#chart"], ["Strategy", "#strategy"], ["Dossier", "#dossier"], ["Evidence", "#evidence"], ["Peers", "#peers"], ["Filings", "#filings"], ["News", "#news"]].map(([label, href]) => <a key={href} href={href} className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink">{label}</a>)}
      </nav>

      <section id="overview" className="scroll-mt-40 mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <GlassPanel className="p-5 sm:p-6">
          <SectionHeader eyebrow="Company profile" title="What this business is" action={profile.matchBasis === "verified_isin" ? "Identity verified by ISIN" : "Official index classification"} />
          <p className="text-base leading-7 text-ink">{profile.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {profile.founded && <Badge tone="neutral">Founded {profile.founded}</Badge>}
            <Badge tone="neutral">{company.industry}</Badge>
            {company.isin && <Badge tone="neutral">ISIN {company.isin}</Badge>}
          </div>
          <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
            {profile.officialWebsite && <a href={profile.officialWebsite} target="_blank" rel="noopener noreferrer" className="text-accent">Official website ↗</a>}
            {profile.sourceUrl && <a href={profile.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent">Profile source ↗</a>}
          </div>
          <p className="mt-4 text-[11px] leading-5 text-ink-faint">{profile.sourceName} · snapshot {new Date(profile.retrievedAt).toLocaleDateString("en-IN")} · descriptive identity only, not an investment conclusion.</p>
        </GlassPanel>
        <GlassPanel className="p-5 sm:p-6">
          <SectionHeader eyebrow="Business-model lens" title={`How to study ${company.industry.toLowerCase()}`} />
          <p className="text-sm leading-6 text-ink-muted">{researchModel.model}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {researchModel.drivers.map((driver) => <div key={driver} className="rounded-xl bg-surface-2 p-3 text-xs leading-5 text-ink">{driver}</div>)}
          </div>
        </GlassPanel>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[["Operating KPIs", researchModel.kpis], ["Risks to disprove", researchModel.risks], ["Valuation lenses", researchModel.valuation]].map(([title, items]) => <GlassPanel key={title} className="p-5"><h2 className="text-sm font-semibold text-ink">{title}</h2><div className="mt-3 space-y-2">{items.map((item) => <div key={item} className="flex gap-2 text-xs leading-5 text-ink-muted"><span className="text-accent">○</span><span>{item}</span></div>)}</div></GlassPanel>)}
      </section>

      <section id="chart" className="scroll-mt-40 mt-6 overflow-hidden rounded-[1.5rem] border border-[#284049] bg-[#081116] shadow-float">
        <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#70d6bd]">Market chart</div><h2 className="mt-1 text-base font-semibold text-white">{company.name} price action</h2></div><div className="rounded-full border border-[#d6a542]/30 bg-[#d6a542]/10 px-3 py-1.5 text-[10px] font-semibold text-[#e1b75d]">Live or delayed by exchange entitlement</div></div>
        <TradingViewAdvancedChart symbol={tradingViewSymbol} companyName={company.name} />
      </section>
      <p className="mt-3 text-[11px] leading-5 text-ink-faint">The embedded chart is displayed by TradingView. MF Pulse does not ingest, store or certify its quote as a licensed one-second feed. Market status and delay depend on TradingView and exchange entitlements.</p>

      <section id="strategy" className="scroll-mt-40 mt-8">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="eyebrow text-accent">Industry-aware strategy desk</div><h2 className="section-title mt-2">Three lenses that fit {company.industry.toLowerCase()}</h2></div><Link href="/stocks/strategies" className="text-sm font-semibold text-accent">View all strategies →</Link></div>
        <div className="grid gap-4 lg:grid-cols-3">{strategySet.strategies.map((strategy) => <GlassPanel key={strategy.key} className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-base font-semibold text-ink">{strategy.name}</h3><Badge tone="neutral">{strategy.horizon}</Badge></div><p className="mt-3 text-sm font-medium leading-6 text-ink">{strategy.question}</p><div className="mt-4 space-y-2">{strategy.evidence.slice(0, 3).map((item) => <div key={item} className="flex gap-2 text-xs leading-5 text-ink-muted"><span className="text-accent">○</span><span>{item}</span></div>)}</div><div className="mt-4 rounded-xl bg-surface-2 p-3 text-[11px] leading-5 text-missing">Verdict withheld until the required evidence is available.</div></GlassPanel>)}</div>
        <p className="mt-3 text-xs leading-5 text-ink-muted">{strategySet.note}</p>
      </section>

      <section id="dossier" className="scroll-mt-40 mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="overflow-hidden"><div className="p-5"><SectionHeader eyebrow="Company evidence dossier" title="Documents required before a conviction" action={`${dossier.documents.length} evidence classes`} /></div><div className="divide-y divide-line border-t border-line">{dossier.documents.map((document) => { const route = officialLinks.find((link) => link.label === document.hrefKey); return <div key={document.key} className="grid gap-2 px-5 py-4 sm:grid-cols-[170px_105px_1fr_auto] sm:items-center"><div><div className="text-sm font-semibold text-ink">{document.label}</div><div className="mt-1 text-[10px] text-ink-faint">{document.source}</div></div><Badge tone="neutral">{document.cadence}</Badge><p className="text-xs leading-5 text-ink-muted">{document.why}</p>{route ? <a href={route.href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent">Verify ↗</a> : <span className="text-xs text-missing">Route pending</span>}</div>; })}</div></GlassPanel>
        <GlassPanel className="p-5"><SectionHeader eyebrow="Industry KPI checklist" title={dossier.operating.title} /><div className="space-y-2">{dossier.operating.metrics.map((metric) => <div key={metric} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5"><span className="text-xs font-medium text-ink">{metric}</span><span className="shrink-0 text-[10px] text-missing">Needs sourced history</span></div>)}</div><p className="mt-4 text-[11px] leading-5 text-ink-faint">These KPIs define what to collect; they are not inferred from the company&apos;s industry label.</p></GlassPanel>
      </section>

      <section id="evidence" className="scroll-mt-40 mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="overflow-hidden"><div className="p-5"><SectionHeader eyebrow="Research coverage" title="What can be judged today" action="Evidence before scores" /></div><div className="divide-y divide-line border-t border-line">{RESEARCH_LAYERS.map(([layer, source, status], index) => <div key={layer} className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_150px_1fr] sm:items-center"><div className="text-sm font-semibold text-ink">{layer}</div><div className="text-xs text-accent">{source}</div><div className="text-xs leading-5 text-ink-muted">{status}</div></div>)}</div></GlassPanel>
        <GlassPanel className="p-5"><SectionHeader eyebrow="Analyst checklist" title="Five checks before a view" /><div className="space-y-3">{studyChecks.map(([title, detail], index) => <div key={title} className="flex gap-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">0{index + 1}</div><div><div className="text-sm font-semibold text-ink">{title}</div><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></div></div>)}</div></GlassPanel>
      </section>

      <section id="peers" className="scroll-mt-40 mt-8"><GlassPanel className="p-5"><SectionHeader eyebrow="Peer map" title={`${company.industry} research set`} action="Industry label match—not an investment rank" />{peers.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{peers.map((peer) => <Link key={peer.isin || peer.nseSymbol || peer.bseCode} href={companyResearchHref(peer)} className="rounded-2xl border border-line bg-surface-2 p-4 hover:border-accent/40"><div className="truncate text-sm font-semibold text-ink">{peer.name}</div><div className="mt-2 font-mono text-[11px] text-accent">{peer.nseSymbol || `BSE ${peer.bseCode}`}</div><div className="mt-3 text-xs text-ink-faint">Open research terminal →</div></Link>)}</div> : <EmptyState icon="◫" title="No same-label peer in this snapshot" hint="Peer groups remain conservative rather than mixing different business models." />}</GlassPanel></section>

      <section id="filings" className="scroll-mt-40 mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="p-5"><SectionHeader eyebrow="Primary evidence" title="Exchange filings and ownership" action={`${officialLinks.length} official routes`} /><div className="grid gap-3 md:grid-cols-2">{officialLinks.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-line bg-surface-2 p-4 hover:border-accent/40"><div className="font-semibold text-ink">{link.label} ↗</div><p className="mt-2 text-xs leading-5 text-ink-muted">{link.detail}</p></a>)}</div></GlassPanel>
        <GlassPanel className="p-5"><SectionHeader eyebrow="Index provenance" title="Why this company is covered" /><div className="grid gap-3">{company.memberships.map((membership) => <a key={membership.key} href={membership.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-surface-2 p-4"><div className="text-sm font-semibold text-ink">{membership.name} ↗</div><p className="mt-1 text-xs leading-5 text-ink-muted">{membership.provider} snapshot · {membership.industry}</p></a>)}</div></GlassPanel>
      </section>

      <section id="news" className="scroll-mt-40 mt-8"><GlassPanel className="p-5"><SectionHeader eyebrow="Traceable coverage" title="Recent linked company news" action="Exact-name rules only" />{news.length ? <div className="divide-y divide-line">{news.map((article) => <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="block py-4"><div className="flex items-start justify-between gap-4"><h3 className="text-sm font-semibold text-ink hover:text-accent">{article.title}</h3><span className="shrink-0 text-xs text-ink-faint">{relativeTime(article.publishedAt)}</span></div><p className="mt-2 text-xs text-ink-muted">{article.source?.name || "Source unavailable"} · linked by {article.ruleId || "company mention rule"}</p></a>)}</div> : <EmptyState icon="◌" title="No deterministically linked articles yet" hint={company.nseSymbol ? "A missing result is not treated as no news. Coverage appears after a vetted company alias matches an ingested article." : "This BSE-only record has no verified NSE symbol for entity linking yet."} />}</GlassPanel></section>

      <div className="mt-6 flex flex-wrap gap-3"><Link href="/stocks/universe" className="btn-premium-secondary">Back to universe</Link><Link href="/stocks/sources" className="btn-premium-primary">View source policy</Link></div>
    </main>
    <Footer note={<span>Evidence workspace only—not investment advice, a target price or a buy/sell recommendation. Verify current filings and personal suitability independently.</span>} />
  </>;
}
