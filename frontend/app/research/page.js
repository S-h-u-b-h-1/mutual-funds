import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";

export const metadata = { title: "Research Hub" };

const GROUPS = [
  {
    eyebrow: "Reports",
    title: "Briefings & signals",
    items: [
      { t: "Market Brief", d: "Monthly flow narrative auto-composed from the dataset — leaders, breadth, and standout moves.", href: "/brief", tag: "monthly" },
      { t: "Flow Signals", d: "AMC × category net-flow surges flagged by z-score against trailing history.", href: "/signals", tag: "live" },
    ],
  },
  {
    eyebrow: "Tools",
    title: "Analysis",
    items: [
      { t: "AMC Comparison", d: "Compare any AMCs side-by-side on equity index, scheme mix, and flows.", href: "/compare", tag: "interactive" },
      { t: "Product Analytics", d: "Aggregate, privacy-safe behavioural data — what users search and explore.", href: "/analytics", tag: "live" },
    ],
  },
  {
    eyebrow: "Reference",
    title: "Documentation",
    items: [
      { t: "Methodology", d: "Sources, asset-class mapping, the equity index, z-score signals, and quality controls.", href: "/methodology", tag: "" },
      { t: "System Status", d: "Data freshness, coverage, and API health in real time.", href: "/status", tag: "" },
      { t: "About & sources", d: "What MF Pulse is, and the free public data it runs on.", href: "/about", tag: "" },
    ],
  },
];

const GLOSSARY = [
  ["AUM", "Assets Under Management — the total market value a fund or AMC manages."],
  ["NAV", "Net Asset Value — per-unit price of a scheme, published daily by AMFI."],
  ["Net flow", "Gross inflows minus redemptions over a period; the headline 'where money moved' figure."],
  ["z-score", "How many standard deviations the latest flow is from its trailing average; |z| ≥ 1.8 = a flagged surge."],
];

export default function Research() {
  return (
    <>
      <Nav active="/research" />
      <main className="container-px py-10">
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">Research Hub</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Briefings, analysis tools, and reference — everything to go from raw AMFI/SEBI data to a view.
        </p>

        {GROUPS.map((g) => (
          <section key={g.title} className="mt-9">
            <SectionHeader eyebrow={g.eyebrow} title={g.title} />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => (
                <a key={it.t} href={it.href} className="group glass p-5 transition-all duration-200 hover:border-line-strong hover:-translate-y-0.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-ink">{it.t}</h3>
                    {it.tag && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-faint">{it.tag}</span>}
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{it.d}</p>
                  <span className="mt-3 inline-block text-[12px] text-accent-soft">Open →</span>
                </a>
              ))}
            </div>
          </section>
        ))}

        <section className="mt-10">
          <SectionHeader eyebrow="reference" title="Glossary" />
          <GlassPanel className="divide-y divide-line px-5 sm:px-6">
            {GLOSSARY.map(([t, d]) => (
              <div key={t} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[140px_1fr] sm:gap-4">
                <div className="text-[13px] font-semibold text-ink">{t}</div>
                <div className="text-[13px] leading-relaxed text-ink-muted">{d}</div>
              </div>
            ))}
          </GlassPanel>
        </section>
      </main>
      <Footer note={<span>Not investment advice. Data © AMFI / SEBI.</span>} />
    </>
  );
}
