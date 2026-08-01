import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";

export const metadata = { title: "Methodology" };

const SECTIONS = [
  {
    t: "Data sources",
    b: "NAVs and the scheme universe come from AMFI's free public daily file (NAVAll), refreshed nightly. The 30-day equity index is built from AMFI's date-range NAV history. Monthly net flows come from SEBI/AMFI monthly reports — a PDF/Excel-only source, so headline flow figures are clearly-labelled sample data until the monthly export is wired in.",
  },
  {
    t: "Asset-class mapping",
    b: "Each scheme is classified Equity / Debt / Hybrid / Solution / Other from its AMFI category, including legacy close-ended labels (Income → Debt, Growth & ELSS → Equity) that would otherwise misclassify thousands of schemes and skew the headline equity-vs-debt split.",
  },
  {
    t: "30-day equity index",
    b: "Per AMC, every equity scheme's NAV is normalised to 100 at the window start, then averaged across the AMC's equity book per day. This produces a comparable 'how did this AMC's equity move' index independent of absolute NAV magnitudes.",
  },
  {
    t: "Flow signals (z-score)",
    b: "For each AMC × asset-class, the latest month's net flow is compared to its trailing history. The z-score = (latest − mean) / stdev; |z| ≥ 1.8 is flagged as an inflow or outflow surge. It needs at least four months of history.",
  },
  {
    t: "Data quality",
    b: "A quality gate halts the pipeline on negative NAVs, unexpected asset classes, stale data (latest NAV > 5 days old), or a scheme-coverage collapse (< 8,000 schemes). Zero NAVs are allowed — AMFI reports them for some wound-up pools.",
  },
  {
    t: "Serving & privacy",
    b: "Reads go through Supabase PostgREST with a publishable key and row-level security. Behavioural events (searches, drill-downs, sign-ups) are stored aggregate-only; subscriber emails are insert-only and never readable via the public key.",
  },
];

export default function Methodology() {
  return (
    <>
      <Nav active="/methodology" />
      <main className="container-px py-10">
        <ProductBreadcrumbs items={[["Help", "/help"], ["Methodology", null]]} />
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">Methodology</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          How MF Pulse turns free public data into flow intelligence — sources, classification,
          signals, and quality controls.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <GlassPanel key={s.t} className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold text-ink">{s.t}</h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">{s.b}</p>
            </GlassPanel>
          ))}
        </div>
      </main>
      <Footer note={<span>Not investment advice. Data © AMFI / SEBI.</span>} />
    </>
  );
}
