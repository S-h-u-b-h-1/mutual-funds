import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { RESEARCH_LAYERS, STOCK_STRATEGIES } from "../../lib/stocks/strategyFramework";

export const metadata = { title: "Stock Research Strategies — MF Pulse" };

export default function StockStrategiesPage() {
  return <>
    <Nav active="/stocks" />
    <main id="main-content" className="container-px py-10 sm:py-14">
      <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Strategy lab", null]]} />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_360px]">
        <div><div className="eyebrow text-accent">Evidence-gated strategy lab</div><h1 className="page-title mt-3 max-w-4xl">Different businesses need different research logic.</h1><p className="measure mt-4 text-sm leading-6 text-ink-muted">These are repeatable study frameworks—not tips, model portfolios or automatic buy signals. A company only earns a conclusion after the required evidence is sourced, comparable and current.</p></div>
        <GlassPanel className="p-5"><SectionHeader eyebrow="Operating rule" title="Missing data never becomes a pass" /><p className="text-sm leading-6 text-ink-muted">MF Pulse separates the method from the verdict. Until normalized financials and valuations are licensed, company pages show the questions and primary evidence routes without inventing scores.</p></GlassPanel>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        {STOCK_STRATEGIES.map((strategy, index) => <GlassPanel key={strategy.key} className="p-5">
          <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold text-accent">0{index + 1}</div><h2 className="mt-2 text-lg font-semibold text-ink">{strategy.name}</h2></div><Badge tone="neutral">{strategy.horizon}</Badge></div>
          <p className="mt-3 text-sm font-medium leading-6 text-ink">{strategy.question}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{strategy.evidence.map((item) => <div key={item} className="rounded-xl bg-surface-2 px-3 py-2 text-xs leading-5 text-ink-muted"><span className="mr-2 text-accent">✓</span>{item}</div>)}</div>
          <div className="mt-4 rounded-xl border border-neg/20 bg-neg/5 px-3 py-3 text-xs leading-5 text-ink-muted"><span className="font-semibold text-neg">Reject or investigate:</span> {strategy.reject}</div>
        </GlassPanel>)}
      </section>

      <GlassPanel className="mt-8 overflow-hidden">
        <div className="p-5"><SectionHeader eyebrow="Data contract" title="What powers a defensible verdict" action="No silent substitution" /></div>
        <div className="overflow-x-auto border-t border-line"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-surface-2 text-[10px] uppercase tracking-wider text-ink-faint"><tr><th className="px-5 py-3">Research layer</th><th className="px-4 py-3">Preferred source</th><th className="px-5 py-3">Current treatment</th></tr></thead><tbody className="divide-y divide-line">{RESEARCH_LAYERS.map(([layer, source, treatment]) => <tr key={layer}><td className="px-5 py-4 font-semibold text-ink">{layer}</td><td className="px-4 py-4 text-ink-muted">{source}</td><td className="px-5 py-4 text-xs leading-5 text-ink-muted">{treatment}</td></tr>)}</tbody></table></div>
      </GlassPanel>
      <div className="mt-6 flex flex-wrap gap-3"><Link href="/stocks/universe" className="btn-premium-primary">Apply to a company</Link><Link href="/stocks/sources" className="btn-premium-secondary">Inspect source policy</Link></div>
    </main>
    <Footer note={<span>Strategy frameworks are educational research tools, not recommendations or return promises.</span>} />
  </>;
}
