import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import SignalCard from "../components/ui/SignalCard";
import { EmptyState } from "../components/ui/Badge";

export const metadata = { title: "Flow signals" };
export const revalidate = 600;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);

export default async function Signals() {
  let signals = [];
  try {
    signals = await sb("v_signals?select=*", { revalidate: 600 });
  } catch {}

  return (
    <>
      <Nav active="/signals" />
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Signal research</div>
        <h1 className="page-title mt-3">Investigate movements outside their recent baseline.</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Months where industry-wide net flow into a fund category deviated sharply from its trailing average
          (z-score ≥ 1.8). Computed from AMFI&rsquo;s Monthly Report — real, refreshed every month.
        </p>
        <section className="mt-8">
          {signals.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {signals.map((s, i) => (
                <SignalCard key={i} assetClass={s.asset_class} signal={s.signal} z={Number(s.z_score).toFixed(1)} value={`₹${fmt(s.net_flow_cr)} Cr`} />
              ))}
            </div>
          ) : (
            <EmptyState title="No active signals" hint="Surges appear when monthly flows deviate from trend." />
          )}
        </section>
      </main>
      <Footer note={<span>Signals are industry-wide per fund category (AMFI Monthly Report), not broken out by AMC — see <a className="text-ink-muted hover:text-ink" href="/methodology">methodology</a>.</span>} />
    </>
  );
}
