import Link from "next/link";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import GlassPanel from "../components/ui/GlassPanel";
import Badge from "../components/ui/Badge";
import SectionHeader from "../components/ui/SectionHeader";

const helpPaths = [
  ["I want a risk-aware shortlist", "Answer five questions, see how the profile was scored, and compare the matched funds with visible reasons.", "/advisor", "Start here"],
  ["I want to compare specific funds", "Put up to four schemes in the same return, volatility, drawdown, consistency, tax, and evidence frame.", "/compare?mode=funds", "Compare"],
  ["I want to research mutual funds", "Search the AMFI-backed universe, inspect full fund evidence, and compare category-relative results.", "/funds", "Research"],
  ["I want to understand my portfolio", "Upload a CAS to study allocation, concentration, returns, risk, and missing evidence across holdings.", "/portfolio", "Diagnose"],
  ["I want to learn the basics", "Understand NAV, costs, risk, SIPs, XIRR, CAGR, and rolling returns before making a decision.", "/learn", "Learn"],
  ["Something looks stale", "Check the source date, coverage, and data status before interpreting a missing or old observation.", "/data-status", "Trust"],
];

const supportTopics = [
  ["Advisory agent", "Risk profile, explainable shortlist, product comparison, and follow-up dialogue.", "/advisor"],
  ["Mutual-fund comparison", "Compare selected schemes on observed return, risk, consistency, tax treatment, and research completeness.", "/compare?mode=funds"],
  ["Portfolio diagnosis", "Import holdings and review allocation, gains, concentration, and evidence gaps.", "/portfolio"],
  ["Fund research", "Search by name, AMC, category, benchmark, scheme code, or ISIN.", "/funds"],
  ["Methodology", "See how returns, risk, data health, and category-relative measures are calculated.", "/methodology"],
  ["Account and profile", "Sign in, create an account, and manage saved research preferences.", "/profile"],
  ["Data freshness", "Check the latest available NAV, coverage, and pipeline status.", "/data-status"],
  ["Service status", "Check whether the application or a supporting data service is degraded.", "/status"],
];

export default function HelpPage() {
  return (
    <>
      <Nav active="/help" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Help", null]]} />
        <div className="eyebrow text-accent">Help</div>
        <h1 className="page-title mt-3 max-w-4xl">Start with the decision you are trying to make.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">MFPulse connects risk profiling, product comparison, advisory dialogue, and portfolio evidence. Choose the outcome below instead of guessing which internal tool to open.</p>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {helpPaths.map(([title, detail, href, tag]) => (
            <Link key={title} href={href} className="premium-card p-5 transition hover:-translate-y-0.5 hover:border-accent/35">
              <div className="relative"><Badge tone="accent">{tag}</Badge><h2 className="mt-4 text-base font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p><span className="mt-4 inline-flex text-sm font-semibold text-accent">Open →</span></div>
            </Link>
          ))}
        </section>

        <section className="mt-8">
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader eyebrow="Support topics" title="Choose the customer problem, not the internal system" />
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {supportTopics.map(([title, detail, href]) => <Link key={title} href={href} className="rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-accent/35"><h2 className="text-sm font-semibold text-ink">{title}</h2><p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p><span className="mt-3 inline-flex text-xs font-semibold text-accent">Open →</span></Link>)}
            </div>
          </GlassPanel>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <GlassPanel className="p-5 sm:p-6"><SectionHeader eyebrow="Product boundaries" title="What the advisory result means" /><div className="mt-4 grid gap-3 text-sm leading-6 text-ink-muted"><p><span className="font-semibold text-ink">Profile:</span> provisional and based only on the five answers provided in that session.</p><p><span className="font-semibold text-ink">Shortlist:</span> a deterministic research ranking using fund family, risk, consistency, category standing, and available history.</p><p><span className="font-semibold text-ink">Dialogue:</span> an explanation layer over observed evidence—not a buy/sell instruction or regulated suitability assessment.</p></div></GlassPanel>
          <GlassPanel className="p-5 sm:p-6"><SectionHeader eyebrow="Recovery" title="If something feels wrong" /><div className="mt-4 grid gap-3"><Link href="/data-status" className="rounded-2xl bg-surface-2 p-4 text-sm font-semibold text-ink-muted hover:text-accent">Check data status →</Link><Link href="/methodology" className="rounded-2xl bg-surface-2 p-4 text-sm font-semibold text-ink-muted hover:text-accent">Review methodology →</Link><Link href="/advisor" className="rounded-2xl bg-surface-2 p-4 text-sm font-semibold text-ink-muted hover:text-accent">Restart advisory profile →</Link></div></GlassPanel>
        </section>
      </main>
      <Footer note={<span>Help content explains product behavior. Fund evidence remains source- and date-dependent.</span>} />
    </>
  );
}
