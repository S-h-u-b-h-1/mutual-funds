import Link from "next/link";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import GlassPanel from "../components/ui/GlassPanel";
import Badge from "../components/ui/Badge";
import SectionHeader from "../components/ui/SectionHeader";

const helpPaths = [
  ["I want to research mutual funds", "Start with fund research, compare candidates, then inspect source and freshness before acting.", "/funds", "Research"],
  ["I want to learn the basics", "Understand NAV, AUM, costs, risk, SIPs, redemption and switch before using execution workflows.", "/learn", "Learn"],
  ["I want to research stocks", "Use Stocks for discovery, company pages, sectors, screeners and learning. No stock trading is available.", "/stocks", "Research-only"],
  ["I want to understand my portfolio", "Upload a CAS or open your Invest portfolio to see real holdings, valuation and available gain/loss data.", "/portfolio", "Track"],
  ["I want to invest", "Mutual-fund execution belongs inside Suasion Invest and depends on your investment readiness.", "/invest", "Invest"],
  ["Something looks stale", "Check data status and freshness before assuming a fund, price or document is wrong.", "/data-status", "Trust"],
  ["I need account help", "Open your profile, sign in again, or contact advisor support depending on the problem.", "/profile", "Account"],
];

const supportTopics = [
  ["Account", "Sign in, create account, profile and session recovery.", "/login"],
  ["Portfolio", "Connect/import holdings, review valuation, gains, folios and unresolved rows.", "/portfolio"],
  ["Mutual Funds", "Search by name, compare funds, inspect fund pages and AMC context.", "/funds"],
  ["Investing", "Open Suasion Invest, check readiness and follow backend-supported execution steps.", "/invest"],
  ["SIP", "Set up recurring investment mandates and track mandate/provider status where supplied.", "/invest/sips"],
  ["Payments", "Payment state is shown only when the provider/backend returns it; no real-money claim is inferred.", "/invest/orders"],
  ["Redemption", "Start from a holding, use backend eligibility, review payout bank and track the timeline.", "/invest/redeem"],
  ["Switch", "Understand that a switch can be processed as redemption plus purchase, with both legs tracked.", "/invest/switch"],
  ["Documents", "Open statements, confirmations and tax documents when backend document support exists.", "/invest/documents"],
  ["Data freshness", "Check latest available NAV, coverage and data-pipeline health.", "/data-status"],
  ["Contact Suasion", "Use advisor support when product guidance or service follow-up is required.", "/advisor"],
];

export default function HelpPage() {
  return (
    <>
      <Nav active="/help" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Help", null]]} />
        <div className="eyebrow text-accent">Help</div>
        <h1 className="page-title mt-3 max-w-4xl">Find the right path without guessing where to go next.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          MF Pulse separates research, learning, portfolio tracking and mutual-fund execution. Use this page when you are unsure which product area owns your next step.
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {helpPaths.map(([title, detail, href, tag]) => (
            <Link key={title} href={href} className="premium-card p-5 transition hover:-translate-y-0.5 hover:border-accent/35">
              <div className="relative">
                <Badge tone={tag === "Research-only" ? "warn" : "accent"}>{tag}</Badge>
                <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
                <span className="mt-4 inline-flex text-sm font-semibold text-accent">Open →</span>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-8">
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader eyebrow="Support topics" title="Choose the customer problem, not the internal system" />
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {supportTopics.map(([title, detail, href]) => (
                <Link key={title} href={href} className="rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-accent/35 hover:text-accent">
                  <h2 className="text-sm font-semibold text-ink">{title}</h2>
                  <p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p>
                  <span className="mt-3 inline-flex text-xs font-semibold text-accent">Open →</span>
                </Link>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader eyebrow="Product boundaries" title="What MF Pulse will and will not do" />
            <div className="mt-4 grid gap-3 text-sm leading-6 text-ink-muted">
              <p><span className="font-semibold text-ink">Mutual Funds:</span> research, comparison, portfolio tracking and Suasion-backed execution where the backend supports it.</p>
              <p><span className="font-semibold text-ink">Stocks:</span> research, discovery, watchlist, portfolio intelligence and learning only. No buy/sell controls are shown.</p>
              <p><span className="font-semibold text-ink">Markets:</span> context surfaces such as news, signals and raw materials appear only when sourced feeds exist.</p>
            </div>
          </GlassPanel>
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader eyebrow="Recovery" title="If something feels wrong" />
            <div className="mt-4 grid gap-3">
              <Link href="/data-status" className="rounded-2xl bg-surface-2 p-4 text-sm font-semibold text-ink-muted hover:text-accent">Check data status →</Link>
              <Link href="/status" className="rounded-2xl bg-surface-2 p-4 text-sm font-semibold text-ink-muted hover:text-accent">Check service status →</Link>
              <Link href="/advisor" className="rounded-2xl bg-surface-2 p-4 text-sm font-semibold text-ink-muted hover:text-accent">Advisor support →</Link>
            </div>
          </GlassPanel>
        </section>
      </main>
      <Footer note={<span>Help content is product guidance only. Financial data and investment eligibility remain backend/source-driven.</span>} />
    </>
  );
}
