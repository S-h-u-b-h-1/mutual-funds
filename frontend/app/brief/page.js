import { sb } from "../lib/supabase";
import { buildBrief } from "../lib/brief";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import StatStrip from "../components/ui/StatStrip";
import TrustBar from "../components/ui/TrustBar";
import SignalCard from "../components/ui/SignalCard";

export const metadata = { title: "Market Brief" };
export const revalidate = 600;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const inr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;
const lakhCr = (n) => `₹${(n / 100000).toFixed(2)}L Cr`;
const strip = (s) => s.replace(" Mutual Fund", "");

function FlowList({ items, tone }) {
  if (!items.length) return <div className="text-[13px] text-ink-faint">None this month.</div>;
  return (
    <ul className="divide-y divide-line">
      {items.map((r, i) => (
        <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-4 text-right text-[11px] text-ink-faint tnum">{i + 1}</span>
            <span className="truncate text-ink">{r.name}</span>
          </span>
          <span className={`tnum font-semibold ${tone === "pos" ? "text-pos" : "text-neg"}`}>{r.v >= 0 ? "+" : "−"}₹{fmt(Math.abs(Math.round(r.v)))} Cr</span>
        </li>
      ))}
    </ul>
  );
}

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
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

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
        {/* Masthead */}
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Research Note · Fund Flows · {flow.month || "—"}</div>
        <h1 className="mt-2 max-w-3xl text-[28px] sm:text-[36px] font-bold leading-tight tracking-tightest text-ink">
          India Mutual-Fund Flow Brief
        </h1>
        <TrustBar asOf={latest} className="mt-3" sources={[{ label: "Generated", value: generated }, { label: "Method", value: "rule-based" }]} />

        {/* Sample-data disclosure */}
        <div className="mt-5 max-w-3xl rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[12.5px] text-warn">
          <b>Disclosure:</b> <span className="text-ink-muted">Monthly net-flow figures in this note are <b className="text-warn">sample data</b>. The SEBI/AMFI monthly report is PDF-only and not yet wired in; scheme &amp; NAV data is live from AMFI. Figures are illustrative until the export is connected.</span>
        </div>

        <div className="mt-6 max-w-3xl"><StatStrip items={stats} /></div>

        {/* Executive summary */}
        <section className="mt-9 max-w-3xl">
          <SectionHeader eyebrow="01" title="Executive summary" />
          <GlassPanel className="p-5 sm:p-6">
            <p className="text-[16px] leading-relaxed text-ink">{brief.lead}</p>
            {brief.paragraphs[1] && <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{brief.paragraphs[1]}</p>}
          </GlassPanel>
        </section>

        {/* Top in / out */}
        <section className="mt-9 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <SectionHeader eyebrow="02" title="Top equity inflows" />
            <GlassPanel className="px-5 py-2"><FlowList items={brief.topInflows} tone="pos" /></GlassPanel>
          </div>
          <div>
            <SectionHeader eyebrow="03" title="Top equity outflows" />
            <GlassPanel className="px-5 py-2"><FlowList items={brief.topOutflows} tone="neg" /></GlassPanel>
          </div>
        </section>

        {/* Category commentary */}
        <section className="mt-9 max-w-3xl">
          <SectionHeader eyebrow="04" title="Category commentary" />
          <GlassPanel className="space-y-4 p-5 sm:p-6">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-pos">Equity</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{brief.commentary.equity}</p>
            </div>
            <div className="hairline h-px" />
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-[#60a5fa]">Debt</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{brief.commentary.debt}</p>
            </div>
          </GlassPanel>
        </section>

        {/* Signals */}
        {signals.length > 0 && (
          <section className="mt-9 max-w-3xl">
            <SectionHeader eyebrow="05" title="Flagged signals" action={<a className="hover:text-ink" href="/signals">All →</a>} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {signals.slice(0, 6).map((s, i) => (
                <SignalCard key={i} amc={strip(s.amc_name)} assetClass={s.asset_class} signal={s.signal} z={Number(s.z_score).toFixed(1)} value={inr(s.net_flow_cr)} />
              ))}
            </div>
          </section>
        )}

        {/* Risks & methodology */}
        <section className="mt-9 max-w-3xl">
          <SectionHeader eyebrow="06" title="Risks & methodology" />
          <GlassPanel className="p-5 sm:p-6">
            <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-ink-muted">
              {brief.risks.map((r, i) => (
                <li key={i} className="flex gap-2.5"><span className="text-ink-faint">—</span><span>{r}</span></li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-faint">
              This note is composed deterministically from the underlying flow and signal data — no generative
              model is used, so every figure traces directly to the dataset. Full method on the{" "}
              <a className="text-ink-muted hover:text-ink" href="/methodology">methodology</a> page.
            </p>
          </GlassPanel>
        </section>
      </main>
      <Footer note={<span>Not investment advice · auto-generated from AMFI / SEBI data · {generated}.</span>} />
    </>
  );
}
