import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import SectionHeader from "../../components/ui/SectionHeader";
import Badge from "../../components/ui/Badge";
import { FinancialTrendChart, StockHistoryChart } from "../../components/stocks/StockResearchCharts";
import { AllocationDonut, ComparisonBars, RiskReturnMap } from "../../components/ui/ResearchCharts";

export const metadata = { title: "Interactive Stock Analysis Demo — MF Pulse" };

function buildIllustrativeHistory() {
  const points = [];
  for (let month = 0; month <= 120; month += 1) {
    const date = new Date(Date.UTC(2016 + Math.floor(month / 12), month % 12, 1));
    const growth = 118 * Math.pow(1.0115, month);
    const cycle = Math.sin(month / 5.8) * 11 + Math.sin(month / 16) * 18;
    const shock = month >= 49 && month <= 56 ? -42 + Math.abs(month - 53) * 7 : 0;
    points.push({ asOfDate: date.toISOString().slice(0, 10), price: Number(Math.max(62, growth + cycle + shock).toFixed(2)), source: "Illustrative demo series" });
  }
  return points;
}

const financials = [
  [2019, 4820, 710, 322], [2020, 5140, 742, 335], [2021, 4760, 621, 238],
  [2022, 5880, 876, 401], [2023, 6720, 1038, 486], [2024, 7640, 1204, 568], [2025, 8510, 1392, 661],
].map(([fiscalYear, revenue, ebitda, net_profit]) => ({ fiscalYear, fields: { revenue, ebitda, net_profit } }));

const peers = [
  { code: "ASTER", name: "Aster Manufacturing", shortName: "Aster", roce: 18.4, debt: 0.34, margin: 16.4, growth: 12.1 },
  { code: "PEER-A", name: "Peer Alpha", shortName: "Peer Alpha", roce: 14.1, debt: 0.62, margin: 13.8, growth: 8.4 },
  { code: "PEER-B", name: "Peer Beta", shortName: "Peer Beta", roce: 20.2, debt: 0.22, margin: 17.1, growth: 10.2 },
  { code: "PEER-C", name: "Peer Gamma", shortName: "Peer Gamma", roce: 11.8, debt: 0.91, margin: 11.5, growth: 15.6 },
];

export default function StockAnalysisDemoPage() {
  const history = buildIllustrativeHistory();
  return (
    <>
      <Nav active="/stocks" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Interactive demo", null]]} />
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2"><div className="eyebrow text-accent">Stock analysis demo</div><Badge tone="warn">Illustrative data</Badge></div>
            <h1 className="page-title mt-3 max-w-4xl">See the complete company-research experience before the live feed arrives.</h1>
            <p className="measure mt-4 text-sm leading-6 text-ink-muted">Aster Manufacturing is a fictional company. Every figure on this page is sample data designed to demonstrate chart interactions, comparison logic and evidence-led explanations—not a real security or investment opportunity.</p>
            <div className="mt-5 flex flex-wrap gap-2"><Badge tone="pos">10-year history</Badge><Badge tone="accent">7 annual statements</Badge><Badge tone="neutral">4-company peer set</Badge></div>
          </div>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Demo company" title="Aster Manufacturing Ltd." />
            <div className="grid grid-cols-2 gap-3">
              {[["Illustrative price", "₹462.81"], ["Revenue CAGR", "+10.0%"], ["ROCE", "18.4%"], ["Debt / equity", "0.34×"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-surface-2 p-3"><div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div><div className="mt-1 text-lg font-semibold text-ink financial-number">{value}</div></div>)}
            </div>
          </GlassPanel>
        </section>

        <GlassPanel className="mt-8 p-5 sm:p-6">
          <SectionHeader eyebrow="Price trend" title="Explore the full available history" action="Try the range controls" />
          <StockHistoryChart points={history} sourceLabel="illustrative demo series · not market data" />
        </GlassPanel>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <GlassPanel className="p-5 sm:p-6"><SectionHeader eyebrow="Fundamentals" title="Revenue, EBITDA and profit trend" action="₹ crore" /><FinancialTrendChart statements={financials} /></GlassPanel>
          <GlassPanel className="p-5 sm:p-6"><SectionHeader eyebrow="Business mix" title="Illustrative revenue allocation" /><AllocationDonut centerLabel="FY25 revenue" centerValue="₹8,510 Cr" items={[{ name: "Industrial systems", value: 42 }, { name: "Consumer products", value: 27 }, { name: "Exports", value: 19 }, { name: "Services", value: 12 }]} /></GlassPanel>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <GlassPanel className="p-5 sm:p-6"><SectionHeader eyebrow="Risk / return" title="Where the company sits against peers" action="Illustrative" /><RiskReturnMap returnLabel="Illustrative 3-year return (%)" riskLabel="Illustrative volatility (%)" points={[{ name: "Aster", return: 15.8, risk: 19.4, size: 16, highlight: true, detail: "Selected company" }, { name: "Peer Alpha", return: 10.2, risk: 17.2, size: 12 }, { name: "Peer Beta", return: 13.1, risk: 14.8, size: 14 }, { name: "Peer Gamma", return: 18.4, risk: 28.6, size: 10 }, { name: "Sector median", return: 11.7, risk: 20.5, size: 8 }]} /></GlassPanel>
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader eyebrow="Evidence interpretation" title="Strengths, risks and what to verify" />
            <div className="grid gap-3">{[
              ["Strength", "ROCE of 18.4% and improving operating profit suggest efficient capital use, subject to persistence across the cycle.", "text-accent"],
              ["Strength", "Operating cash flow covers reported profit in the sample history, reducing the accounting-quality concern.", "text-accent"],
              ["Risk", "Exports contribute 19% of revenue, creating currency and overseas-demand sensitivity.", "text-amber-400"],
              ["Verify", "Read customer concentration, related-party transactions, auditor notes and capital-allocation history before forming a thesis.", "text-sky-300"],
            ].map(([label, detail, tone], index) => <div key={`${label}-${index}`} className="rounded-2xl border border-line bg-surface-2 p-4"><div className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>{label}</div><p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p></div>)}</div>
          </GlassPanel>
        </section>

        <GlassPanel className="mt-6 p-5 sm:p-6">
          <SectionHeader eyebrow="Peer comparison" title="Compare operating quality side by side" />
          <ComparisonBars funds={peers} metrics={[{ key: "roce", label: "ROCE", help: "Capital efficiency", suffix: "%" }, { key: "debt", label: "Debt / equity", help: "Balance-sheet leverage", suffix: "×", lowerIsBetter: true, digits: 2 }, { key: "margin", label: "EBITDA margin", help: "Operating profitability", suffix: "%" }, { key: "growth", label: "Revenue growth", help: "Latest annual growth", suffix: "%" }]} />
        </GlassPanel>

        <div className="mt-8 flex flex-wrap gap-3"><Link href="/stocks" className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-bg">Return to Stocks</Link><Link href="/stocks/sources" className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink">Inspect live-data sources</Link></div>
      </main>
      <Footer note={<span>This page uses fictional demonstration data only. It is not investment advice, a recommendation, or a representation of any listed company.</span>} />
    </>
  );
}
