import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";

const calculations = [
  ["Revenue CAGR", "(Ending revenue ÷ Beginning revenue)^(1 ÷ years) − 1", "Use 5–10 years and separate acquisition-led growth from organic growth."],
  ["Operating margin", "Operating profit ÷ Revenue", "Compare through a full cycle; explain price, mix, volume and cost effects."],
  ["ROCE", "EBIT ÷ Average capital employed", "Use average opening/closing capital and examine whether acquisitions distort it."],
  ["Cash conversion", "Cash flow from operations ÷ PAT", "Review cumulatively over 3–5 years; one quarter is easily distorted by working capital."],
  ["Net debt / EBITDA", "(Debt − cash) ÷ EBITDA", "Not appropriate for banks; pair it with maturity schedule and interest coverage."],
  ["FCF", "Cash flow from operations − Capital expenditure", "Separate maintenance from growth capex when the disclosure permits."],
];

const workflows = [
  ["00–05 min", "Define the business", "Write what is sold, who pays, revenue unit, geography, segments and the variables that change demand."],
  ["05–12 min", "Read the filings", "Open the latest results, annual report notes, auditor report, shareholding pattern and material announcements."],
  ["12–18 min", "Build the history", "Collect 5–10 years of sales, margins, capital, cash flow, debt and share count using consistent units."],
  ["18–23 min", "Use industry KPIs", "Banks: NIM/GNPA/credit cost. Consumer: volume/gross margin. Utilities: PLF/tariff/receivables."],
  ["23–27 min", "Value expectations", "Create bear/base/bull revenue, margin and capital scenarios; infer what the current valuation already assumes."],
  ["27–30 min", "Write disconfirming triggers", "State what would prove the thesis wrong, which filing reveals it and when you will check again."],
];

const sectorExamples = [
  ["Bank", "Loan growth → NIM → operating cost → credit cost → ROA", "GNPA, NNPA, slippages, provision coverage, CASA, CET1"],
  ["Consumer", "Volume × realisation − raw material − advertising/distribution", "Volume growth, gross margin, market share, inventory, ROCE"],
  ["IT services", "Billable staff × utilisation × pricing, adjusted for currency", "Constant-currency growth, deal wins, attrition, utilisation, FCF"],
  ["Utility", "Contracted capacity × availability/PLF × regulated tariff", "PLF, receivable days, fuel availability, regulated ROE, leverage"],
  ["Commodity", "Volume × (realisation − unit cash cost) across the cycle", "Cost curve, utilisation, EBITDA/unit, maintenance capex, net debt"],
  ["Industrial", "Order inflow → execution → margin → working-capital collection", "Book-to-bill, order conversion, margin, receivable days, ROCE"],
];

export const metadata = { title: "How to Analyse Indian Stocks — Practical Research Guide | MF Pulse" };

export default function StockLearningPage() {
  return <>
    <Nav active="/learn/stocks" />
    <main id="main-content" className="container-px py-10 sm:py-14">
      <ProductBreadcrumbs items={[["Learn", "/learn"], ["Stocks", null]]} />
      <div className="eyebrow text-accent">Practical stock research</div>
      <h1 className="page-title mt-3 max-w-4xl">From annual report to an evidence-backed thesis.</h1>
      <p className="measure mt-4 text-sm leading-6 text-ink-muted">A calculation-first guide to studying Indian listed companies. Every conclusion should identify the formula, period, source document, sector context and condition that would invalidate it.</p>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[["1", "Measure", "Calculate multi-year economics with consistent definitions."], ["2", "Explain", "Connect changes to volumes, price, costs, capital and industry structure."], ["3", "Disprove", "Search for evidence that contradicts the attractive narrative."]].map(([number, title, detail]) => <GlassPanel key={number} className="p-5"><div className="text-xs font-semibold text-accent">0{number}</div><h2 className="mt-3 text-lg font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p></GlassPanel>)}
      </section>

      <section className="mt-10"><SectionHeader eyebrow="Core calculations" title="Six formulas—and how they mislead" action="Use consistent periods" /><div className="grid gap-3 lg:grid-cols-2">{calculations.map(([name, formula, caution]) => <GlassPanel key={name} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold text-ink">{name}</h2><Badge tone="accent">Calculation</Badge></div><div className="mt-3 overflow-x-auto rounded-xl bg-surface-2 px-3 py-3 font-mono text-xs text-accent">{formula}</div><p className="mt-3 text-xs leading-5 text-ink-muted">{caution}</p></GlassPanel>)}</div></section>

      <section className="mt-10"><SectionHeader eyebrow="30-minute filing workflow" title="A repeatable first pass" action="Then deepen the work" /><GlassPanel className="overflow-hidden"><div className="divide-y divide-line">{workflows.map(([time, title, detail], index) => <div key={time} className="grid gap-2 p-5 sm:grid-cols-[90px_190px_1fr] sm:items-start"><div className="font-mono text-xs font-semibold text-accent">{time}</div><div className="text-sm font-semibold text-ink">{title}</div><p className="text-sm leading-6 text-ink-muted">{detail}</p></div>)}</div></GlassPanel></section>

      <section className="mt-10"><SectionHeader eyebrow="Sector logic" title="Never score unlike businesses with one template" /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{sectorExamples.map(([sector, engine, kpis]) => <GlassPanel key={sector} className="p-5"><Badge tone="neutral">{sector}</Badge><h2 className="mt-4 text-sm font-semibold text-ink">Earnings engine</h2><p className="mt-2 text-xs leading-5 text-ink-muted">{engine}</p><h3 className="mt-4 text-sm font-semibold text-ink">Evidence to track</h3><p className="mt-2 text-xs leading-5 text-ink-muted">{kpis}</p></GlassPanel>)}</div><Link href="/stocks/sectors" className="mt-4 inline-flex text-sm font-semibold text-accent">Open every sector framework →</Link></section>

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <GlassPanel className="p-6"><SectionHeader eyebrow="Valuation discipline" title="Translate price into expectations" /><ol className="space-y-3 text-sm leading-6 text-ink-muted"><li><span className="font-semibold text-ink">1.</span> Build bear, base and bull revenue growth.</li><li><span className="font-semibold text-ink">2.</span> Set margins using cycle history, not only the latest quarter.</li><li><span className="font-semibold text-ink">3.</span> Estimate reinvestment, dilution and balance-sheet needs.</li><li><span className="font-semibold text-ink">4.</span> Compare implied growth and returns with execution history.</li><li><span className="font-semibold text-ink">5.</span> Demand a margin of safety for uncertainty and governance risk.</li></ol></GlassPanel>
        <GlassPanel className="p-6"><SectionHeader eyebrow="Red-flag search" title="Evidence that deserves escalation" /><ul className="space-y-3 text-sm leading-6 text-ink-muted">{["Profit rises while cumulative operating cash flow persistently lags.", "Receivables or inventory grow much faster than sales.", "Frequent related-party transactions, auditor changes or qualified remarks.", "Promoter pledging, repeated dilution or debt-funded unrelated acquisitions.", "Adjusted metrics improve while statutory results and segment disclosure weaken."].map((item) => <li key={item} className="flex gap-2"><span className="text-missing">△</span><span>{item}</span></li>)}</ul></GlassPanel>
      </section>

      <GlassPanel className="mt-10 p-6"><SectionHeader eyebrow="Use it now" title="Apply the framework to a real company page" /><p className="text-sm leading-6 text-ink-muted">The company terminal combines profile, industry-specific drivers, KPI checklist, price chart, peers and direct exchange-filing routes. Numeric verdicts stay withheld until the evidence is comparable.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/stocks/company/ASIANPAINT" className="btn-premium-primary">Study Asian Paints</Link><Link href="/stocks/screener" className="btn-premium-secondary">Find another company</Link></div></GlassPanel>
    </main>
    <Footer note={<span>Educational research framework only—not investment advice or a recommendation.</span>} />
  </>;
}
