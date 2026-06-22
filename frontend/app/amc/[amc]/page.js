import { sb } from "../../lib/supabase";
import Tracker from "../../components/Tracker";
import Sparkline from "../../components/Sparkline";
import WatchButton from "../../components/WatchButton";
import trendData from "../../data/amc_trend.json";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const CLASS_COLOR = {
  Equity: "#22c55e",
  Debt: "#3b82f6",
  Hybrid: "#a855f7",
  Other: "#f59e0b",
  Solution: "#ec4899",
};

export async function generateMetadata({ params }) {
  return { title: `${decodeURIComponent(params.amc)} — MF Pulse` };
}

export default async function AmcPage({ params }) {
  const amc = decodeURIComponent(params.amc);
  const enc = encodeURIComponent(amc);

  const [summary, schemes] = await Promise.all([
    sb(`v_amc_summary?amc_name=eq.${enc}&select=asset_class,schemes&order=schemes.desc`),
    sb(
      `dim_scheme?amc_name=eq.${enc}&asset_class=eq.Equity` +
        `&select=scheme_code,scheme_name,asset_class,fact_nav_daily(nav_value,nav_date)&limit=40`
    ),
  ]);

  const total = summary.reduce((s, r) => s + Number(r.schemes), 0);

  if (!summary.length) {
    return (
      <main>
        <Tracker event="amc_view" payload={{ amc, found: false }} />
        <p className="notfound">
          No AMC named “{amc}”. <a href="/">← Back to dashboard</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <Tracker event="amc_view" payload={{ amc }} />
      <header className="top">
        <a className="back" href="/">← MF Pulse</a>
        <div className="live">{fmt(total)} schemes</div>
      </header>

      <h1 className="amc-title">{amc}</h1>

      {trendData.amcs[amc] && (
        <section className="panel">
          <h2>30-day equity index · normalised to 100 · real AMFI NAV history</h2>
          <Sparkline points={trendData.amcs[amc]} />
        </section>
      )}

      <section className="panel">
        <h2>Schemes by asset class</h2>
        <div className="chips">
          {summary.map((r) => (
            <span className="chip" key={r.asset_class}>
              <span className="cls-dot" style={{ background: CLASS_COLOR[r.asset_class] || "#64748b" }} />
              {r.asset_class}
              <b>{fmt(r.schemes)}</b>
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Equity schemes · latest NAV</h2>
        <table className="nav-table">
          <thead>
            <tr><th className="w-col"></th><th>Scheme</th><th className="num">NAV (₹)</th><th className="num">As of</th></tr>
          </thead>
          <tbody>
            {schemes.map((s) => {
              const nav = (s.fact_nav_daily && s.fact_nav_daily[0]) || {};
              return (
                <tr key={s.scheme_code}>
                  <td className="w-col"><WatchButton code={s.scheme_code} name={s.scheme_name} amc={amc} /></td>
                  <td>{s.scheme_name}</td>
                  <td className="num">{nav.nav_value ? Number(nav.nav_value).toFixed(2) : "—"}</td>
                  <td className="num dim">{nav.nav_date || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {schemes.length === 40 && <p className="more">Showing first 40 equity schemes.</p>}
      </section>

      <footer className="foot">
        Live NAV from AMFI · drill-downs and searches are logged to <code>user_events</code> for product analytics.
      </footer>
    </main>
  );
}
