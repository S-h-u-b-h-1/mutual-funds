import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";

const modules = [
  ["How to research a company", "Start with what the company sells, who buys it, why it wins or loses, and which variables move revenue and margins.", ["Business model", "Unit economics", "Competitive advantage", "Key risks"]],
  ["How to read annual reports", "Read management discussion, accounting notes, auditor comments and related-party transactions before relying on headline ratios.", ["Narrative", "Numbers", "Notes", "Governance"]],
  ["How to study management", "Look for capital allocation, disclosure quality, promoter behavior, execution record and treatment of minority shareholders.", ["Incentives", "Integrity", "Execution", "Communication"]],
  ["How to think about valuation", "Valuation is a range of assumptions, not a single P/E shortcut. Compare history, peers, growth, margins and risk.", ["Multiples", "DCF assumptions", "Margin of safety", "Scenario analysis"]],
  ["How to track risks", "Keep an explicit list of what can break the thesis: demand, margins, debt, regulation, commodity costs and governance.", ["Business", "Financial", "Commodity", "Governance"]],
  ["How to build an investment thesis", "A thesis should be falsifiable. Record what must happen, what would prove you wrong, and what you still need to verify.", ["Thesis", "Risks", "Catalysts", "Questions"]],
];

export default function StockLearningPage() {
  return (
    <>
      <Nav active="/learn/stocks" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Learn", "/learn/stocks"], ["Stocks", null]]} />
        <div className="eyebrow text-accent">Learn · Stocks</div>
        <h1 className="page-title mt-3 max-w-4xl">A research culture for company analysis, not a stream of tips.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          MF Pulse learns from the depth and accountability of long-form investor research communities, but does not reproduce their posts. These modules are concise frameworks that will appear in context on company pages.
        </p>
        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(([title, detail, tags]) => (
            <GlassPanel key={title} className="p-5">
              <Badge tone="accent">Framework</Badge>
              <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}
              </div>
            </GlassPanel>
          ))}
        </section>

        <section id="thesis" className="mt-8">
          <GlassPanel className="p-6">
            <div className="eyebrow text-accent">Private notes model</div>
            <h2 className="mt-2 text-xl font-semibold text-ink">Research notes should separate thesis from evidence.</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {["Thesis", "Risks", "Catalysts", "Questions", "Valuation", "Management"].map((label) => (
                <div key={label} className="rounded-2xl bg-surface-2 p-4">
                  <div className="text-sm font-semibold text-ink">{label}</div>
                  <p className="mt-2 text-xs leading-5 text-ink-muted">Stored privately for logged-in users once the company notes API is wired into the UI.</p>
                </div>
              ))}
            </div>
          </GlassPanel>
        </section>
      </main>
      <Footer note={<span>Learning content is educational and must not be treated as a stock recommendation.</span>} />
    </>
  );
}
