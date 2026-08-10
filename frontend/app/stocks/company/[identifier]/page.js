import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "../../../components/Nav";
import Footer from "../../../components/Footer";
import ProductBreadcrumbs from "../../../components/ProductBreadcrumbs";
import GlassPanel from "../../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../../components/ui/Badge";
import SectionHeader from "../../../components/ui/SectionHeader";
import { getArticlesForEntity, relativeTime } from "../../../lib/news";
import { getCompanyResearch, getOfficialCompanyResearchLinks } from "../../../lib/stocks/universe";

export const dynamic = "force-dynamic";

const checks = [
  ["Business quality", "Read revenue drivers, unit economics, competitive position and customer concentration."],
  ["Financial quality", "Compare revenue, margins, ROCE, cash conversion, leverage and dilution across a full cycle."],
  ["Management & governance", "Review related-party transactions, auditor notes, capital allocation and promoter pledging."],
  ["Valuation", "Use sector-appropriate multiples and scenarios; never treat a low multiple as proof of value."],
  ["Risks & catalysts", "Write disconfirming evidence, downside triggers and what would change the thesis before acting."],
];

export async function generateMetadata({ params }) {
  const { identifier } = await params;
  const company = getCompanyResearch(identifier);
  return company ? { title: `${company.name} Research — MF Pulse` } : { title: "Company not found — MF Pulse" };
}

export default async function CompanyResearchPage({ params }) {
  const { identifier } = await params;
  const company = getCompanyResearch(identifier);
  if (!company) notFound();

  const officialLinks = getOfficialCompanyResearchLinks(company);
  const news = company.nseSymbol
    ? await getArticlesForEntity({ entityType: "company", entityName: company.nseSymbol, limit: 6 })
    : [];

  return (
    <>
      <Nav active="/stocks" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Company universe", "/stocks/universe"], [company.name, null]]} />
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div>
            <div className="eyebrow text-accent">Company evidence brief</div>
            <h1 className="page-title mt-3 max-w-4xl">{company.name}</h1>
            <p className="mt-4 text-sm leading-6 text-ink-muted">{company.industry} · {company.nseSymbol ? `NSE ${company.nseSymbol}` : `BSE ${company.bseCode}`}{company.isin ? ` · ${company.isin}` : ""}</p>
            <div className="mt-5 flex flex-wrap gap-2">{company.memberships.map((membership) => <Badge key={membership.key} tone="pos">Current {membership.name} constituent</Badge>)}</div>
          </div>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Evidence status" title="Facts before conclusions" />
            <p className="text-sm leading-6 text-ink-muted">Membership and identifiers come from official index snapshots. Filing links open primary exchange records. A score or recommendation is deliberately withheld until financial, valuation and governance evidence is populated.</p>
          </GlassPanel>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Primary evidence" title="Official filings" action={`${officialLinks.length} routes`} />
            <div className="grid gap-3 md:grid-cols-2">
              {officialLinks.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-accent/35"><div className="font-semibold text-ink">{link.label} ↗</div><p className="mt-2 text-xs leading-5 text-ink-muted">{link.detail}</p></a>)}
            </div>
          </GlassPanel>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Index provenance" title="Why this company is here" />
            <div className="grid gap-3">{company.memberships.map((membership) => <a key={membership.key} href={membership.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-surface-2 p-4"><div className="text-sm font-semibold text-ink">{membership.name} ↗</div><p className="mt-1 text-xs leading-5 text-ink-muted">{membership.provider} snapshot · industry label: {membership.industry}</p></a>)}</div>
          </GlassPanel>
        </section>

        <GlassPanel className="mt-6 p-5">
          <SectionHeader eyebrow="Analysis method" title="Five checks before judging performance" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{checks.map(([title, detail], index) => <div key={title} className="rounded-2xl bg-surface-2 p-4"><div className="text-xs font-semibold text-accent">0{index + 1}</div><h2 className="mt-2 text-sm font-semibold text-ink">{title}</h2><p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p></div>)}</div>
        </GlassPanel>

        <GlassPanel className="mt-6 p-5">
          <SectionHeader eyebrow="Traceable coverage" title="Recent linked company news" action="Exact-name rules only" />
          {news.length ? <div className="divide-y divide-line">{news.map((article) => <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="block py-4"><div className="flex items-start justify-between gap-4"><h2 className="text-sm font-semibold text-ink hover:text-accent">{article.title}</h2><span className="shrink-0 text-xs text-ink-faint">{relativeTime(article.publishedAt)}</span></div><p className="mt-2 text-xs text-ink-muted">{article.source?.name || "Source unavailable"} · linked by {article.ruleId || "company mention rule"}</p></a>)}</div> : <EmptyState icon="◌" title="No deterministically linked articles yet" hint={company.nseSymbol ? "Coverage appears only after the company name or a vetted alias matches an ingested article. A missing result is not treated as no news." : "This BSE-only snapshot record has no verified NSE symbol for entity linking yet."} />}
        </GlassPanel>

        <div className="mt-6 flex flex-wrap gap-3"><Link href="/stocks/universe" className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink">Back to universe</Link><Link href="/stocks/sources" className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-bg">View source policy</Link></div>
      </main>
      <Footer note={<span>This is an evidence workspace, not investment advice or a buy/sell recommendation. Verify current filings and suitability independently.</span>} />
    </>
  );
}
