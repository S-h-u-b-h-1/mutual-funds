import Link from "next/link";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import GlassPanel from "../components/ui/GlassPanel";
import Badge from "../components/ui/Badge";
import SectionHeader from "../components/ui/SectionHeader";
import { asOf } from "../lib/funds";

const mutualFundConcepts = [
  ["NAV", "The per-unit value of a mutual fund after valuing its portfolio and expenses.", "Use it as the unit price for transactions and valuation. Higher NAV alone does not mean a better fund.", "MF Pulse shows the latest available official NAV date, not real-time pricing."],
  ["AUM", "Assets under management: the total money managed in a fund or fund house.", "It gives scale context, especially for liquidity and business stability.", "Large AUM is not automatically safer or better-performing."],
  ["Expense ratio", "The annual cost charged by the fund, reflected inside NAV.", "Lower costs can help long-term returns when other factors are comparable.", "Costs should be read with strategy, risk and tracking quality."],
  ["Exit load", "A charge that may apply when units are redeemed before a stated period.", "It can affect short holding-period redemptions.", "Exact applicability must come from the scheme/provider at transaction time."],
  ["CAGR", "A smoothed annualized return over a period.", "Useful for comparing long periods in a simple way.", "It hides volatility and the path taken to reach that return."],
  ["XIRR", "A money-weighted return that accounts for your actual cash-flow dates.", "Best suited to SIPs, staggered purchases and redemptions.", "It needs a reliable transaction ledger; MF Pulse should not invent it."],
  ["Riskometer", "The AMC-disclosed risk label for a scheme.", "It gives a quick first-pass risk indication.", "It is not a substitute for volatility, drawdown, portfolio and suitability checks."],
  ["Volatility", "How much returns move around over time.", "Higher volatility means the journey can feel bumpier even if long-term returns are attractive.", "Short windows may not represent future behavior."],
  ["Sharpe", "A risk-adjusted return measure.", "It helps compare reward per unit of volatility.", "It depends on the period and assumptions used."],
  ["Benchmark", "The index or reference used to assess fund performance.", "A fair benchmark helps judge whether a fund added value.", "Benchmark choice matters; an unfair benchmark can mislead."],
  ["Direct vs Regular", "Direct plans usually exclude distributor commission; regular plans include distributor servicing economics.", "Plan affects cost and the way advice/distribution is handled.", "Execution through Suasion follows backend-disclosed distributor information."],
  ["Growth vs IDCW", "Growth keeps gains invested; IDCW can distribute income when declared.", "The option changes cash-flow behavior.", "IDCW payouts are not guaranteed and reduce NAV when paid."],
  ["SIP", "A recurring investment instruction for a chosen amount and frequency.", "It spreads entry timing and builds discipline.", "Mandate/payment/provider state determines whether installments actually execute."],
  ["Redemption", "Selling units from an existing holding.", "It turns units into a payout request to the linked bank.", "Settlement timing and eligibility must come from backend/provider data."],
  ["Switch", "Moving from one scheme to another, usually processed as a redemption plus purchase.", "It helps reposition within supported scheme paths.", "Both legs need truthful tracking; do not treat a switch as complete until both are confirmed."],
];

const journeyCards = [
  ["Find a fund", "Search by fund name, AMC or category. You should not need an AMFI code.", "/funds", "Research"],
  ["Compare before deciding", "Compare returns, risk, costs, category and missing data side by side.", "/compare", "Compare"],
  ["Connect your portfolio", "Upload or connect your existing mutual-fund portfolio to see holdings and valuation in one place.", "/portfolio", "Track"],
  ["Check readiness", "Investment readiness tells you which compliance or account steps are still required.", "/invest/compliance", "Readiness"],
  ["Get help", "Use Help when a data, account, payment, SIP, document, redemption or switch question appears.", "/help", "Support"],
  ["Learn stocks separately", "Stock research is learning and discovery only. MF Pulse does not show stock Buy/Sell actions.", "/learn/stocks", "Stocks"],
];

export const metadata = { title: "Learn | MF Pulse" };

export default function LearnPage() {
  return (
    <>
      <Nav active="/learn" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Learn", null]]} />
        <div className="eyebrow text-accent">Learn</div>
        <h1 className="page-title mt-3 max-w-4xl">Understand the investment terms before you act.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          MF Pulse learning is educational context, not advice. It explains what a metric means, why it matters, how to read it, and where it can mislead you.
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Learning paths">
          {journeyCards.map(([title, detail, href, tag]) => (
            <Link key={title} href={href} className="premium-card p-5 transition hover:-translate-y-0.5 hover:border-accent/35">
              <Badge tone={tag === "Stocks" ? "warn" : "accent"}>{tag}</Badge>
              <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
              <span className="mt-4 inline-flex text-sm font-semibold text-accent">Open →</span>
            </Link>
          ))}
        </section>

        <section id="mutual-funds" className="mt-10 sm:mt-12">
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader eyebrow={`Mutual funds · NAV as of ${asOf}`} title="Common concepts, plain English" />
            <div className="mt-5 grid gap-4">
              {mutualFundConcepts.map(([term, meaning, interpretation, limitation]) => (
                <article key={term} className="rounded-2xl border border-line bg-surface-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-ink">{term}</h2>
                    <Badge tone="neutral">Educational</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-ink-muted md:grid-cols-3">
                    <p><span className="font-semibold text-ink">What is it?</span><br />{meaning}</p>
                    <p><span className="font-semibold text-ink">Why it matters</span><br />{interpretation}</p>
                    <p><span className="font-semibold text-ink">Limitation</span><br />{limitation}</p>
                  </div>
                </article>
              ))}
            </div>
          </GlassPanel>
        </section>
      </main>
      <Footer note={<span>Learning is educational. Eligibility, prices, documents and transaction states remain source/backend-driven.</span>} />
    </>
  );
}
