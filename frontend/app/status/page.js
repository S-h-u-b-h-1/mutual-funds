import { sb } from "../lib/supabase";

export const metadata = { title: "System status" };
export const revalidate = 300;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default async function Status() {
  let byClass = [], headline = [], signals = [];
  let ok = true;
  try {
    [byClass, headline, signals] = await Promise.all([
      sb("v_asset_class_summary?select=*", { revalidate: 300 }),
      sb("v_flow_headline?select=*", { revalidate: 300 }),
      sb("v_signals?select=z_score", { revalidate: 300 }),
    ]);
  } catch {
    ok = false;
  }

  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const stale = daysSince(latest);
  const checks = [
    { label: "Data API (Supabase / PostgREST)", ok, detail: ok ? "reachable" : "unreachable" },
    { label: "NAV freshness", ok: stale <= 5, detail: latest ? `latest ${latest} (${stale}d ago)` : "no data" },
    { label: "Scheme coverage", ok: totalSchemes >= 8000, detail: `${fmt(totalSchemes)} schemes` },
    { label: "Flow signals", ok: true, detail: `${signals.length} active` },
  ];
  const allGood = checks.every((c) => c.ok);

  return (
    <main>
      <header className="site-head">
        <div className="brand"><a href="/"><span className="pulse-dot" /> MF Pulse</a></div>
        <a className="back" href="/">← Dashboard</a>
      </header>

      <h1 className="amc-title">System status</h1>
      <div className="amc-sub" style={{ color: allGood ? "var(--pos)" : "var(--neg)" }}>
        {allGood ? "● All systems operational" : "● Degraded — see below"}
      </div>

      <section className="section">
        <div className="panel" style={{ padding: "8px 14px" }}>
          <table className="nav-table">
            <tbody>
              {checks.map((c) => (
                <tr key={c.label}>
                  <td style={{ width: 26 }}>{c.ok ? "✅" : "⚠️"}</td>
                  <td>{c.label}</td>
                  <td className="num dim">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="foot">
        Flow headline month: {headline[0]?.month || "—"} · auto-refreshes every 5 min.
      </footer>
    </main>
  );
}
