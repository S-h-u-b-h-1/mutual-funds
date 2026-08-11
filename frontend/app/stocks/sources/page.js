import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { SOURCE_STATUS, STOCK_SOURCES, getStockSourceSummary, groupedStockSources } from "../../lib/stocks/sourceRegistry";

export const metadata = { title: "Stock Data Sources — MF Pulse" };

const authorityLabels = {
  regulator: "Primary regulator",
  exchange: "Primary exchange",
  index_provider: "Official index provider",
  company_primary: "Company primary source",
  business_media: "Publisher coverage",
  licensed_vendor: "Licensed market data",
};

export default function StockSourcesPage() {
  const summary = getStockSourceSummary();
  const groups = groupedStockSources();

  return (
    <>
      <Nav active="/stocks" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Data sources", null]]} />
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div>
            <div className="eyebrow text-accent">Stock intelligence sources</div>
            <h1 className="page-title mt-3 max-w-4xl">Know the source before trusting the conclusion.</h1>
            <p className="measure mt-4 text-sm leading-6 text-ink-muted">
              MF Pulse prioritises exchange filings, regulator releases and company investor-relations documents. News adds context, but it does not override a primary filing. Every collected item keeps its publisher, timestamp and original link.
            </p>
          </div>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Coverage contract" title={`${summary.total} governed source channels`} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                [summary.active, "Active feeds"], [summary.ready, "Ready to connect"],
                [summary.reference, "Direct references"], [summary.licensed, "Licence-gated"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl bg-surface-2 p-3">
                  <div className="text-xl font-semibold text-ink tnum">{value}</div>
                  <div className="mt-1 text-xs text-ink-muted">{label}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="mt-8 grid gap-3 md:grid-cols-3">
          {[
            ["1", "Primary facts first", "NSE, BSE, SEBI, RBI and company filings establish the factual record."],
            ["2", "Media for context", "Publisher feeds explain events; they are attributed and linked, never presented as company filings."],
            ["3", "No silent scraping", "Public visibility is not treated as reuse permission. Restricted market data stays unavailable until licensed."],
          ].map(([number, title, detail]) => (
            <GlassPanel key={number} className="p-5">
              <div className="text-xs font-semibold text-accent">0{number}</div>
              <h2 className="mt-3 text-base font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
            </GlassPanel>
          ))}
        </section>

        <div className="mt-10 space-y-8">
          {Object.entries(groups).map(([category, sources]) => (
            <section key={category}>
              <SectionHeader eyebrow="Source group" title={category} action={`${sources.length} ${sources.length === 1 ? "channel" : "channels"}`} />
              <div className="grid gap-3 lg:grid-cols-2">
                {sources.map((source) => {
                  const status = SOURCE_STATUS[source.collectionStatus];
                  const content = (
                    <GlassPanel className="h-full p-5 transition hover:border-accent/30">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <span className="text-[11px] text-ink-faint">{authorityLabels[source.authority]}</span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-ink">{source.name}</h3>
                      <p className="mt-1 text-xs text-ink-faint">{source.publisher} · {source.format}</p>
                      <p className="mt-3 text-sm leading-6 text-ink-muted">{source.investorValue}</p>
                      <dl className="mt-4 grid gap-2 border-t border-line pt-4 text-xs">
                        <div><dt className="inline text-ink-faint">Refresh: </dt><dd className="inline text-ink-muted">{source.frequency}</dd></div>
                        <div><dt className="inline text-ink-faint">Handling: </dt><dd className="inline text-ink-muted">{source.usePolicy}</dd></div>
                      </dl>
                      {source.url && <div className="mt-4 text-xs font-semibold text-accent">Open original source ↗</div>}
                    </GlassPanel>
                  );
                  return source.url ? <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">{content}</a> : <div key={source.id}>{content}</div>;
                })}
              </div>
            </section>
          ))}
        </div>

        <GlassPanel className="mt-10 p-5 sm:p-6">
          <SectionHeader eyebrow="Collection roadmap" title="Complete the NIFTY 50 + BSE 100 company evidence graph" />
          <div className="grid gap-4 text-sm leading-6 text-ink-muted md:grid-cols-3">
            <p><span className="font-semibold text-ink">Universe:</span> reconcile companies by ISIN across both official index lists, preserving membership history rather than overwriting it.</p>
            <p><span className="font-semibold text-ink">Company sources:</span> verify one investor-relations root per company and catalogue annual reports, presentations, transcripts and releases.</p>
            <p><span className="font-semibold text-ink">Evidence:</span> connect every filing and article to a company using exchange identifiers and explain exactly why it appears. Historical prices remain licence-gated.</p>
          </div>
          <Link href="/stocks" className="mt-5 inline-flex text-sm font-semibold text-accent">Return to Stocks →</Link>
        </GlassPanel>
      </main>
      <Footer note={<span>Source links are provided for investor research. Availability does not imply permission to republish an entire source document or market-data feed.</span>} />
    </>
  );
}
