import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";

export const metadata = { title: "Ranking and analysis methodology" };

const FRAMEWORKS = [
  ["Active equity", "Rolling and long-horizon peer return; benchmark excess return; drawdown; downside consistency; cost; concentration; manager process."],
  ["Passive / index", "Tracking difference and tracking error; TER; replication quality; liquidity; matched-index return."],
  ["Debt", "Yield to maturity; duration; credit quality; liquidity; drawdown; cost. NAV return alone is insufficient."],
  ["Hybrid", "Allocation stability; equity/debt mix; downside control; risk-adjusted return; cost and diversification."],
  ["Goal-based", "Goal and lock-in fit; horizon-matched return; drawdown near the goal date; cost and glide-path consistency."],
  ["NFO / emerging", "Since-inception return; same-date benchmark and vintage peers; early drawdown; portfolio construction; explicit confidence cap."],
];

const CALCULATIONS = [
  ["Point-to-point return", "(Latest NAV / Earlier NAV - 1) × 100", "Used for 1D through 1Y observed returns."],
  ["Long-period CAGR", "(1 + total return)^(1 / years) - 1", "Used to present 3Y and 5Y performance per year."],
  ["Annualised volatility", "StdDev(daily returns) × √252", "Observed NAV variability; the window is always disclosed."],
  ["Maximum drawdown", "Largest peak-to-trough NAV fall", "Measures the deepest observed loss path, not normal volatility."],
  ["Recent category percentile", "100 × (1 - (rank - 1) / cohort size)", "Current rank is 1M momentum among same-category, same-plan Equity Growth peers."],
  ["Evidence confidence", "Coverage score capped by track-record stage", "History, risk, peers, benchmark, cost, portfolio and freshness determine how strongly a conclusion can be stated."],
];

const STAGES = [
  ["Observation only", "Under ~3 months or no usable 3M/1Y evidence", "25/100", "No normal performance rank"],
  ["Emerging evidence", "Under 1 year or no 1Y return", "45/100", "Vintage-matched comparison only"],
  ["Developing track record", "1–3 years or no 3Y/5Y history", "70/100", "Structured comparison, medium ceiling"],
  ["Established track record", "At least 3Y evidence", "100/100", "Eligible for the broadest supported analysis"],
];

const PORTFOLIO_STEPS = [
  ["01", "Validate evidence", "Check NAV freshness, scheme resolution, history, factsheet coverage and unresolved holdings before scoring."],
  ["02", "Map ownership", "Consolidate scheme rows and measure fund, AMC, category, sector and underlying-stock allocation."],
  ["03", "Judge fund quality", "Value-weight the scheme-level research evidence while disclosing how much portfolio value is scoreable."],
  ["04", "Measure real diversification", "Use effective-number, HHI and look-through overlap instead of treating every fund label as an independent exposure."],
  ["05", "Model downside interaction", "Combine weights, volatility, category correlations, concentration and defensive allocation."],
  ["06", "Build return ranges", "Shrink capped observed returns toward category priors and calculate 1Y, 3Y and 5Y ranges."],
  ["07", "Stress and explain", "Apply named shocks and state every strength or weakness with its importance, confidence and next research action."],
];

function Section({ eyebrow, title, children }) {
  return <section className="mt-12"><div className="eyebrow text-accent">{eyebrow}</div><h2 className="section-title mt-2">{title}</h2><div className="mt-5">{children}</div></section>;
}

export default function Methodology() {
  return (
    <>
      <Nav active="/methodology" />
      <main className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Help", "/help"], ["Methodology", null]]} />
        <header className="grid gap-7 border-b border-line pb-9 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div><div className="eyebrow text-accent">MF Pulse evidence standard</div><h1 className="page-title mt-3">Every conclusion should show its logic.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted">MF Pulse separates observed facts, analytical interpretation and unavailable evidence. The same formula is not forced onto every scheme type, and confidence cannot exceed the history and source coverage available for that fund or AMC.</p></div>
          <div className="rounded-2xl border border-accent/25 bg-accent/5 p-5"><div className="text-sm font-semibold text-ink">Download the complete methodology</div><p className="mt-2 text-xs leading-5 text-ink-muted">Fund ranking, NFO treatment, AMC logic, portfolio health, projection ranges, stress tests and limitations.</p><a href="/mf-pulse-ranking-methodology.pdf" download className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-xs font-semibold text-white">Download PDF</a></div>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {[["Observed fact", "A number directly computed from sourced NAV, benchmark or factsheet evidence."], ["Interpretation", "A deterministic rule explaining what that observed number does—and does not—mean."], ["Confidence", "Coverage and history stage control how strongly the platform may state the interpretation."]].map(([title, text]) => <article key={title} className="rounded-2xl border border-line bg-surface p-5"><div className="eyebrow">{title}</div><p className="mt-3 text-sm leading-6 text-ink-muted">{text}</p></article>)}
        </section>

        <Section eyebrow="01 · Rank meaning" title="A recent rank is not a universal quality rank.">
          <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="text-sm font-semibold text-ink">Current recent category rank</h3><p className="mt-3 text-sm leading-6 text-ink-muted">Funds are ordered by 1-month NAV return inside the same category and plan. Equity Growth and Direct/Regular cohorts remain separate. This is explicitly a recent-momentum position.</p></article><article className="rounded-2xl border border-warn/25 bg-warn/[0.03] p-5 sm:p-6"><h3 className="text-sm font-semibold text-ink">What it cannot prove</h3><p className="mt-3 text-sm leading-6 text-ink-muted">It cannot establish long-term manager skill, benchmark alpha, cost efficiency, portfolio quality, cycle resilience or suitability. Those require separate evidence and longer windows.</p></article></div>
        </Section>

        <Section eyebrow="02 · Scheme-specific logic" title="Different fund types answer different investor questions.">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-[10px] uppercase tracking-wider text-ink-faint"><tr><th className="px-4 py-3">Framework</th><th className="px-4 py-3">Primary evidence</th></tr></thead><tbody>{FRAMEWORKS.map(([name, logic]) => <tr key={name} className="border-t border-line"><th className="px-4 py-4 align-top text-left font-semibold text-ink">{name}</th><td className="px-4 py-4 leading-6 text-ink-muted">{logic}</td></tr>)}</tbody></table></div>
        </Section>

        <Section eyebrow="03 · Calculations" title="The formulas behind the displayed evidence.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{CALCULATIONS.map(([name, formula, detail]) => <article key={name} className="rounded-2xl border border-line bg-surface p-5"><div className="text-sm font-semibold text-ink">{name}</div><div className="financial-number mt-3 rounded-lg bg-bg p-3 text-xs text-accent">{formula}</div><p className="mt-3 text-xs leading-5 text-ink-muted">{detail}</p></article>)}</div>
        </Section>

        <Section eyebrow="04 · Confidence" title="New funds cannot inherit established-fund confidence.">
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full min-w-[720px] text-sm"><thead className="bg-surface-2 text-left text-[10px] uppercase tracking-wider text-ink-faint"><tr><th className="px-4 py-3">Stage</th><th className="px-4 py-3">History rule</th><th className="px-4 py-3">Confidence cap</th><th className="px-4 py-3">Ranking treatment</th></tr></thead><tbody>{STAGES.map((row) => <tr key={row[0]} className="border-t border-line">{row.map((value, index) => index === 0 ? <th key={value} className="px-4 py-4 text-left font-semibold text-ink">{value}</th> : <td key={value} className="px-4 py-4 text-ink-muted">{value}</td>)}</tr>)}</tbody></table></div>
        </Section>

        <Section eyebrow="05 · Fund explanations" title="What every fund reasoning box contains.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{["Applicable scheme framework", "Track-record stage and confidence cap", "Observed performance logic", "Recent risk and drawdown logic", "Evidence-backed strengths and weaknesses", "Missing evidence and prohibited conclusions"].map((item, index) => <article key={item} className="rounded-2xl border border-line bg-surface p-4"><div className="financial-number text-xs text-ink-faint">{String(index + 1).padStart(2, "0")}</div><div className="mt-2 text-sm font-semibold text-ink">{item}</div></article>)}</div>
        </Section>

        <Section eyebrow="06 · AMC analysis" title="Fund houses are judged from canonical funds, not duplicated plan variants.">
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><p className="text-sm leading-7 text-ink-muted">Direct and Regular variants are first grouped into one canonical investment idea. AMC evidence then considers category-relative 1Y beat rate, recent top-quartile presence, observed risk, average fund-health evidence and completeness. At least three canonical funds with 1Y evidence and 50% score-input completeness are required for a responsible headline peer rank. Governance, service quality, corporate creditworthiness and unsupported AUM claims are never inferred.</p></div>
        </Section>

        <Section eyebrow="07 · Comparison rules" title="MF Pulse withholds false winners.">
          <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-pos/25 bg-pos/[0.03] p-5"><h3 className="text-sm font-semibold text-ink">Like-for-like</h3><p className="mt-3 text-sm leading-6 text-ink-muted">Same-category and same-plan funds can be compared across observed return, volatility, drawdown, consistency and research evidence. Each metric leader remains visible with its exact logic.</p></article><article className="rounded-2xl border border-warn/25 bg-warn/[0.03] p-5"><h3 className="text-sm font-semibold text-ink">Structurally different funds</h3><p className="mt-3 text-sm leading-6 text-ink-muted">When categories or plan types differ, metric values remain factual but MF Pulse withholds an overall winner. Suitability and mandate differences make a single conclusion unreasonable.</p></article></div>
        </Section>

        <section id="portfolio-model" className="mt-12 scroll-mt-28"><div className="eyebrow text-accent">08 · Portfolio model</div><h2 className="section-title mt-2">Return ranges are evidence-shrunk; risk is covariance-aware.</h2><div id="portfolio-evaluation-strategy" className="mt-5 scroll-mt-28 rounded-2xl border border-accent/25 bg-accent/[0.03] p-5 sm:p-6"><div className="eyebrow text-accent">Evaluation strategy</div><h3 className="mt-2 text-xl font-semibold text-ink">A portfolio must pass seven checks before MF Pulse states a conclusion.</h3><p className="mt-3 max-w-4xl text-sm leading-7 text-ink-muted">The objective is to determine whether the holdings, portfolio structure and downside behaviour form a coherent plan for further research. A high historical return cannot compensate for weak evidence, accidental concentration or an intolerable stress loss.</p><ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{PORTFOLIO_STEPS.map(([number, title, text]) => <li key={number} className="rounded-xl bg-surface p-4"><div className="financial-number text-xs font-semibold text-accent">{number}</div><h4 className="mt-2 text-sm font-semibold text-ink">{title}</h4><p className="mt-2 text-xs leading-5 text-ink-muted">{text}</p></li>)}</ol><div className="mt-4 rounded-xl bg-surface p-4"><h4 className="text-sm font-semibold text-ink">Interpretation protocol</h4><p className="mt-2 text-xs leading-5 text-ink-muted">Every strength and weakness must include: the observed metric, why it matters to the whole portfolio, the evidence source and coverage, a confidence label, and a non-prescriptive next research action. “No overlap detected” is only a strength when look-through coverage is sufficient.</p></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="text-sm font-semibold text-ink">Expected annual return</h3><p className="mt-3 text-sm leading-6 text-ink-muted">Each holding starts with a disclosed long-run category planning prior. Capped 3Y CAGR, 1Y return and annualised 3M return may tilt that prior by at most 50%. A new fund therefore inherits mostly its category assumption instead of being rewarded or punished by a few early observations.</p><div className="financial-number mt-4 rounded-lg bg-bg p-3 text-xs text-accent">Model return = prior × (1 - credibility) + observed × credibility</div></article><article className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><h3 className="text-sm font-semibold text-ink">Portfolio risk</h3><p className="mt-3 text-sm leading-6 text-ink-muted">Portfolio volatility uses holding weights, observed 90-day volatility where available, and a transparent category-correlation matrix. This captures diversification better than averaging fund volatility, while confidence is capped because correlations are model assumptions.</p><div className="financial-number mt-4 rounded-lg bg-bg p-3 text-xs text-accent">σp = √(Σi Σj wi wj σi σj ρij)</div></article></div><div className="mt-4 grid gap-3 md:grid-cols-3">{[["Health score", "Quality 25%, diversification 20%, inverse concentration 15%, overlap 10%, downside resilience 20%, asset balance 10%."], ["Projection bands", "1Y, 3Y and 5Y value bands use 10th/50th/90th model percentiles with extra uncertainty inflation and loss probability."], ["Stress tests", "Equity sell-off, rates/credit shock and inflation/currency shock are deterministic scenarios. They intentionally have no assigned probability."]].map(([title, text]) => <article key={title} className="rounded-2xl border border-line bg-surface p-5"><h3 className="text-sm font-semibold text-ink">{title}</h3><p className="mt-3 text-xs leading-5 text-ink-muted">{text}</p></article>)}</div><div className="mt-4 rounded-2xl border border-warn/25 bg-warn/[0.03] p-5"><h3 className="text-sm font-semibold text-ink">Accuracy boundary</h3><p className="mt-3 text-sm leading-6 text-ink-muted">These are planning distributions, not price targets. They do not model market timing, future cash flows, taxes, regime changes or manager changes. Predictive accuracy cannot be claimed until the model passes published walk-forward backtests against simple baselines.</p></div></section>

        <Section eyebrow="09 · Known boundaries" title="Confidence is about evidence—not future certainty.">
          <ul className="grid gap-3 md:grid-cols-2">{[
            "Past returns and a high evidence score do not predict future performance.",
            "Current volatility is based on a recent window and may not represent every market cycle.",
            "Expense, holdings, AUM and manager coverage remain incomplete outside acquired factsheets.",
            "Official TRI benchmark series are not available for every mapped benchmark.",
            "Debt funds require duration, yield, credit-quality and liquidity evidence before full ranking.",
            "The composite indicators remain research aids until walk-forward backtesting establishes predictive value.",
          ].map((item) => <li key={item} className="rounded-xl border border-line bg-surface p-4 text-sm leading-6 text-ink-muted">{item}</li>)}</ul>
        </Section>
      </main>
      <Footer note={<span>Methodology version 3.1 · Deterministic research, not investment advice · Data © AMFI / SEBI / acquired AMC factsheets.</span>} />
    </>
  );
}
