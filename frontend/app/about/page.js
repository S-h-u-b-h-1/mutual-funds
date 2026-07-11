import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import Badge from "../components/ui/Badge";

export const metadata = { title: "About & data sources" };

export default function About() {
  return (
    <>
      <Nav active="/about" />
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Product and provenance</div>
        <h1 className="page-title mt-3">Research infrastructure, made legible.</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          MF Pulse turns public Indian mutual-fund data into evidence-led research without presenting rankings as advice.
        </p>

        <section className="mt-8">
          <SectionHeader title="Data sources" />
          <GlassPanel className="p-5 sm:p-6">
            <ul className="space-y-3 text-[13.5px] leading-relaxed text-ink-muted">
              <li><b className="text-ink">NAVs &amp; schemes</b> — AMFI daily <code className="text-ink-muted">NAVAll.txt</code> (free, public), refreshed nightly.</li>
              <li><b className="text-ink">NAV history</b> — AMFI date-range report powering the real 30-day equity index.</li>
              <li className="flex flex-wrap items-center gap-2"><span><b className="text-ink">Monthly net flows</b> — SEBI / AMFI monthly reports (PDF/Excel only).</span> <Badge tone="warn">sample until export wired</Badge></li>
            </ul>
          </GlassPanel>
        </section>

        <section className="mt-8">
          <SectionHeader title="How it works" />
          <GlassPanel className="p-5 sm:p-6">
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              A nightly pipeline downloads the AMFI file, parses it, loads Postgres, runs dbt transforms
              and data-quality gates, detects flow spikes, and serves everything through a cached API and
              this dashboard. Searches, drill-downs and sign-ups feed a privacy-safe analytics dataset.
              Full detail on the <a className="text-accent-soft hover:underline" href="/methodology">methodology</a> page.
            </p>
          </GlassPanel>
        </section>
      </main>
      <Footer note={<span>Not investment advice. Data © AMFI / SEBI.</span>} />
    </>
  );
}
