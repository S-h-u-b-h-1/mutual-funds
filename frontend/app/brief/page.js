import { sb } from "../lib/supabase";
import { buildBrief } from "../lib/brief";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import StatStrip from "../components/ui/StatStrip";
import TrustBar from "../components/ui/TrustBar";
import SignalCard from "../components/ui/SignalCard";
import Badge from "../components/ui/Badge";

export const metadata = { title: "Market Brief" };
export const revalidate = 600;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const inr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;
const lakhCr = (n) => `₹${(n / 100000).toFixed(2)}L Cr`;
const strip = (s) => s.replace(" Mutual Fund", "");

export default async function Brief() {
  let headline = [], amcFlows = [], signals = [], byClass = [];
  try {
    [headline, amcFlows, signals, byClass] = await Promise.all([
      sb("v_flow_headline?select=*", { revalidate: 600 }),
      sb("v_amc_flows?select=amc_name,asset_class,net_flow_cr", { revalidate: 600 }),
      sb("v_signals?select=*", { revalidate: 600 }),
      sb("v_asset_class_summary?select=*", { revalidate: 600 }),
    ]);
  } catch {}
  const flow = headline[0] || {};
  const brief = buildBrief({ headline: flow, amcFlows, signals });
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);

  const stats = [
    { label: "Equity net", value: inr(flow.equity_net_cr ?? 0), tone: "pos" },
    { label: "Debt net", value: inr(flow.debt_net_cr ?? 0), tone: "neg" },
    { label: "Total AUM", value: lakhCr(flow.total_aum_cr ?? 0) },
    { label: "Signals", value: signals.length },
  ];

  return (
    <>
      <Nav active="/brief" />
      <main className="container-px py-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Market Brief · {flow.month || "—"}</div>
        <h1 className="mt-2 max-w-3xl text-[28px] sm:text-[36px] font-bold leading-tight tracking-tightest text-ink">
          India Mutual-Fund Flow Brief
        </h1>
        <TrustBar asOf={latest} className="mt-3" sources={[{ label: "Flows", value: "SEBI · sample" }, { label: "Generated", value: "from data" }]} />

        <div className="mt-6 max-w-3xl"><StatStrip items={stats} /></div>

        <article className="mt-8 max-w-3xl space-y-4">
          {brief.paragraphs.map((p, i) => (
            <p key={i} className={`leading-relaxed text-ink-muted ${i === 0 ? "text-[16px] text-ink" : "text-[14.5px]"}`}>{p}</p>
          ))}
        </article>

        {signals.length > 0 && (
          <section className="mt-10 max-w-3xl">
            <SectionHeader eyebrow="z-score ≥ 1.8 vs trailing" title="Flagged this month" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {signals.slice(0, 6).map((s, i) => (
                <SignalCard key={i} amc={strip(s.amc_name)} assetClass={s.asset_class} signal={s.signal} z={Number(s.z_score).toFixed(1)} value={inr(s.net_flow_cr)} />
              ))}
            </div>
          </section>
        )}

        <GlassPanel className="mt-10 max-w-3xl flex items-start gap-3 p-4">
          <Badge tone="neutral">Note</Badge>
          <p className="text-[12.5px] leading-relaxed text-ink-faint">
            This brief is composed deterministically from the underlying flow and signal data — no
            generative model is used, so every figure traces directly to the dataset. Flow figures are
            sample data until the SEBI monthly export is wired in. See the{" "}
            <a className="text-ink-muted hover:text-ink" href="/methodology">methodology</a>.
          </p>
        </GlassPanel>
      </main>
      <Footer note={<span>Not investment advice. Auto-generated from AMFI / SEBI data.</span>} />
    </>
  );
}
