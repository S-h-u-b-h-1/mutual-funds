import { notFound } from "next/navigation";
import { sb } from "../../lib/supabase";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import SectionHeader from "../../components/ui/SectionHeader";
import GlassPanel from "../../components/ui/GlassPanel";
import StatStrip from "../../components/ui/StatStrip";
import Badge from "../../components/ui/Badge";
import { signalSlug } from "../../lib/signalSlug";

export const revalidate = 600;

const inr = (n) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))} Cr`;
const monthLabel = (m) => new Date(m + "T00:00:00Z").toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

export async function generateMetadata({ params }) {
  return { title: `Flow signal · ${params.slug}` };
}

export default async function SignalDetail({ params }) {
  let signals = [], history = [];
  try {
    [signals, history] = await Promise.all([
      sb("v_signals?select=*", { revalidate: 600 }),
      sb("v_flow_history?select=*", { revalidate: 600 }),
    ]);
  } catch {}

  const sig = signals.find((s) => signalSlug(s.amc_name, s.asset_class) === params.slug);
  if (!sig) notFound();

  const amc = sig.amc_name.replace(" Mutual Fund", "");
  const up = sig.signal === "inflow_surge";
  const series = history
    .filter((h) => h.amc_name === sig.amc_name && h.asset_class === sig.asset_class)
    .sort((a, b) => a.month.localeCompare(b.month));
  const prior = series.filter((h) => h.month < sig.month).map((h) => Number(h.net_flow_cr));
  const trailingAvg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;

  // related: same category (other AMCs), same AMC (other categories)
  const relatedAmcs = signals.filter((s) => s.asset_class === sig.asset_class && s.amc_name !== sig.amc_name).slice(0, 6);
  const relatedCats = signals.filter((s) => s.amc_name === sig.amc_name && s.asset_class !== sig.asset_class).slice(0, 4);

  // simple net-flow bar chart
  const vals = series.map((h) => Number(h.net_flow_cr));
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const W = 760, H = 200, PAD = 24, mid = H / 2;
  const bw = series.length ? (W - 2 * PAD) / series.length : 0;

  return (
    <>
      <Nav active="/signals" />
      <main className="container-px py-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          <a className="hover:text-ink" href="/signals">Flow signals</a> · {amc} · {sig.asset_class}
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-[24px] sm:text-[30px] font-bold tracking-tightest text-ink">
            {amc} · {sig.asset_class} {up ? "inflow" : "outflow"} surge
          </h1>
          <Badge tone="warn" dot>illustrative sample</Badge>
        </div>

        <div className="mt-5 max-w-3xl">
          <StatStrip items={[
            { label: "Signal", value: up ? "Inflow surge" : "Outflow surge", tone: up ? "pos" : "neg" },
            { label: "Net flow", value: inr(sig.net_flow_cr), tone: Number(sig.net_flow_cr) >= 0 ? "pos" : "neg" },
            { label: "Z-score", value: Number(sig.z_score).toFixed(1), sub: "vs trailing" },
            { label: "Trailing avg", value: trailingAvg == null ? "—" : inr(trailingAvg) },
            { label: "Signal month", value: monthLabel(sig.month) },
          ]} />
        </div>

        <section className="mt-7">
          <SectionHeader eyebrow="net monthly flow · the signal month is highlighted" title="Historical flow" action={<Badge tone="warn">sample</Badge>} />
          <GlassPanel className="p-5 sm:p-6">
            {series.length >= 2 ? (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Monthly net flow">
                <line x1={PAD} y1={mid} x2={W - PAD} y2={mid} stroke="var(--line,#1e2636)" strokeWidth="1" />
                {series.map((h, i) => {
                  const v = Number(h.net_flow_cr);
                  const hgt = (Math.abs(v) / maxAbs) * (mid - PAD);
                  const x = PAD + i * bw + bw * 0.15;
                  const isSig = h.month === sig.month;
                  const fill = isSig ? (v >= 0 ? "var(--pos,#34d399)" : "var(--neg,#f87171)") : "rgba(255,255,255,0.18)";
                  return (
                    <g key={h.month}>
                      <rect x={x} y={v >= 0 ? mid - hgt : mid} width={bw * 0.7} height={hgt} rx="2" fill={fill} />
                      {isSig && <text x={x + bw * 0.35} y={v >= 0 ? mid - hgt - 4 : mid + hgt + 12} fill="#9aa3b5" fontSize="10" textAnchor="middle">{monthLabel(h.month)}</text>}
                    </g>
                  );
                })}
              </svg>
            ) : (
              <p className="text-[13px] text-ink-faint">Insufficient historical flow points to chart for this AMC/category.</p>
            )}
          </GlassPanel>
        </section>

        <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <GlassPanel className="p-5 lg:col-span-2">
            <SectionHeader title="Why this signal was generated" />
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              In {monthLabel(sig.month)}, {amc}&rsquo;s net {sig.asset_class.toLowerCase()} flow was <b className="text-ink">{inr(sig.net_flow_cr)}</b>
              {trailingAvg != null && <> versus a trailing average of <b className="text-ink">{inr(trailingAvg)}</b></>} — a
              deviation of <b className="text-ink">{Number(sig.z_score).toFixed(1)} standard deviations</b> (z ≥ 1.8 flags a surge).
              That makes it an unusually large {up ? "inflow" : "outflow"} relative to this AMC&rsquo;s own recent pattern.
            </p>
            <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-faint">
              <b className="text-warn">Source note:</b> monthly flow figures are <b>illustrative sample</b> data — SEBI/AMFI publish
              fund flows as PDF only, so a verified export is not yet wired in. The z-score methodology is real; the flow values
              are placeholders. See <a className="text-ink-muted hover:text-ink" href="/methodology">methodology</a> and the
              live <a className="text-ink-muted hover:text-ink" href="/data-quality">data-quality report</a>.
            </p>
          </GlassPanel>

          <GlassPanel className="p-5">
            <SectionHeader title="Related" />
            <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-ink-faint">Same category · other AMCs</div>
            <div className="space-y-1.5">
              {relatedAmcs.length ? relatedAmcs.map((s) => (
                <a key={s.amc_name} href={`/signals/${signalSlug(s.amc_name, s.asset_class)}`} className="flex items-center justify-between text-[12.5px] text-ink-muted hover:text-ink">
                  <span className="truncate">{s.amc_name.replace(" Mutual Fund", "")}</span>
                  <span className="tnum text-ink-faint">z {Number(s.z_score).toFixed(1)}</span>
                </a>
              )) : <span className="text-[12px] text-ink-faint">None.</span>}
            </div>
            {relatedCats.length > 0 && (
              <>
                <div className="mb-2 mt-4 text-[11px] uppercase tracking-[0.08em] text-ink-faint">Same AMC · other categories</div>
                <div className="space-y-1.5">
                  {relatedCats.map((s) => (
                    <a key={s.asset_class} href={`/signals/${signalSlug(s.amc_name, s.asset_class)}`} className="flex items-center justify-between text-[12.5px] text-ink-muted hover:text-ink">
                      <span>{s.asset_class}</span><span className="tnum text-ink-faint">z {Number(s.z_score).toFixed(1)}</span>
                    </a>
                  ))}
                </div>
              </>
            )}
            <a href={`/amc/${encodeURIComponent(amc)}`} className="mt-4 inline-block text-[12.5px] text-accent-soft hover:text-ink">View {amc} →</a>
          </GlassPanel>
        </div>
      </main>
      <Footer note={<span>Flow signals use sample monthly flows until the SEBI export is wired in — see <a className="text-ink-muted hover:text-ink" href="/methodology">methodology</a>.</span>} />
    </>
  );
}
