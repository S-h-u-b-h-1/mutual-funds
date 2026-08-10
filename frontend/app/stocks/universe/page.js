import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { companyResearchHref, getIndexUniverse, getStockUniverseSummary, searchIndexUniverse, STOCK_INDEX_KEYS } from "../../lib/stocks/universe";

export const metadata = { title: "NIFTY 50 and BSE 100 Companies — MF Pulse" };

const dateLabel = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "Source date not supplied";

export default async function StockUniversePage({ searchParams }) {
  const params = await searchParams;
  const requestedIndex = String(params?.index || "NIFTY50").toUpperCase();
  const indexKey = STOCK_INDEX_KEYS.includes(requestedIndex) ? requestedIndex : "NIFTY50";
  const query = String(params?.q || "").trim();
  const index = getIndexUniverse(indexKey);
  const companies = searchIndexUniverse({ indexKey, query });
  const summary = getStockUniverseSummary();

  return (
    <>
      <Nav active="/stocks" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Company universe", null]]} />
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div>
            <div className="eyebrow text-accent">Official index universe</div>
            <h1 className="page-title mt-3 max-w-4xl">Start company research from a traceable membership list.</h1>
            <p className="measure mt-4 text-sm leading-6 text-ink-muted">
              This snapshot contains 50 NIFTY 50 and 100 BSE 100 membership records collected from their official index providers. It contains identifiers and industry labels—not prices, rankings or recommendations.
            </p>
          </div>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Snapshot contract" title={`${summary.records} index-membership records`} />
            <div className="grid grid-cols-3 gap-2 text-center">
              {[[summary.indices, "Indices"], [summary.identifiers, "Identifiers"], [dateLabel(summary.retrievedAt), "Retrieved"]].map(([value, label]) => (
                <div key={label} className="rounded-2xl bg-surface-2 p-3">
                  <div className={`${label === "Retrieved" ? "text-xs" : "text-xl"} font-semibold text-ink tnum`}>{value}</div>
                  <div className="mt-1 text-[10px] text-ink-faint">{label}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap gap-2" aria-label="Choose an index">
            {STOCK_INDEX_KEYS.map((key) => {
              const item = getIndexUniverse(key);
              return <Link key={key} href={`/stocks/universe?index=${key}`} aria-current={key === indexKey ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${key === indexKey ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-muted hover:border-accent/35 hover:text-ink"}`}>{item.name} · {item.constituentCount}</Link>;
            })}
          </div>

          <form action="/stocks/universe" className="mt-4 flex flex-col gap-2 rounded-[1.4rem] border border-line bg-surface p-2 shadow-sm sm:flex-row" role="search">
            <input type="hidden" name="index" value={indexKey} />
            <label className="sr-only" htmlFor="universe-search">Search this index</label>
            <input id="universe-search" name="q" defaultValue={query} className="min-h-12 flex-1 rounded-2xl bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-faint" placeholder="Search company, industry, symbol, code or ISIN…" />
            <button className="min-h-12 rounded-full bg-ink px-5 text-sm font-semibold text-bg" type="submit">Search {index.name}</button>
          </form>
        </section>

        <GlassPanel className="mt-6 overflow-hidden">
          <div className="p-5 pb-3">
            <SectionHeader eyebrow={index.provider} title={query ? `${companies.length} matches in ${index.name}` : `${index.name} constituents`} action={index.sourceEffectiveDate ? `Source date ${dateLabel(index.sourceEffectiveDate)}` : `Retrieved ${dateLabel(summary.retrievedAt)}`} />
            <div className="flex flex-wrap gap-2 text-xs text-ink-faint">
              <Badge tone="pos">Official snapshot</Badge>
              <span>{index.identifierCoverage.isin} ISIN · {index.identifierCoverage.nseSymbol} NSE symbols · {index.identifierCoverage.bseCode} BSE codes</span>
            </div>
          </div>
          {companies.length ? (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                  <tr><th className="px-5 py-3">Company</th><th className="px-4 py-3">Industry</th><th className="px-4 py-3">Exchange identifier</th><th className="px-5 py-3 text-right">Evidence</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {companies.map((company) => (
                    <tr key={company.isin || company.bseCode} className="hover:bg-surface-2/60">
                      <td className="px-5 py-3 font-semibold text-ink"><Link className="hover:text-accent" href={companyResearchHref(company)}>{company.name}<span className="ml-2 text-xs text-accent">Research →</span></Link></td>
                      <td className="px-4 py-3 text-ink-muted">{company.industry}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted">{company.nseSymbol || `BSE ${company.bseCode}`}{company.isin && <span className="mt-1 block text-[10px] text-ink-faint">{company.isin}</span>}</td>
                      <td className="px-5 py-3 text-right"><a href={index.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent">Official source ↗</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="border-t border-line p-5"><EmptyState icon="⌕" title="No matching company" hint="Try a company name, industry, exchange symbol, BSE code or ISIN." /></div>}
        </GlassPanel>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <GlassPanel className="p-5"><div className="eyebrow">Identity reconciliation</div><p className="mt-2 text-sm leading-6 text-ink-muted">Cross-index records are joined through exchange identifiers or a conservative, unambiguous normalized-name prefix. Ambiguous names remain separate rather than being guessed.</p></GlassPanel>
          <GlassPanel className="p-5"><div className="eyebrow">Next enrichment</div><p className="mt-2 text-sm leading-6 text-ink-muted">Each company will receive a verified investor-relations root, document catalogue and filing timeline.</p></GlassPanel>
          <GlassPanel className="p-5"><div className="eyebrow">Open data</div><p className="mt-2 text-sm leading-6 text-ink-muted">The same snapshot is available as structured JSON through <a className="font-semibold text-accent" href="/api/v1/stocks/universe">the universe API</a>.</p></GlassPanel>
        </section>
      </main>
      <Footer note={<span>Index membership is factual context, not a recommendation. Constituents can change after the displayed source or retrieval date.</span>} />
    </>
  );
}
