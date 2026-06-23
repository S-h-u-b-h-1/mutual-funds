// MF Pulse dashboard — server component reading the live Supabase views via PostgREST.
import { sb } from "./lib/supabase";
import Search from "./components/Search";
import Tracker from "./components/Tracker";
import Watchlist from "./components/Watchlist";
import TrendChart from "./components/TrendChart";
import AlertSignup from "./components/AlertSignup";
import trendData from "./data/amc_trend.json";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const inr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;
const lakhCr = (n) => `₹${(n / 100000).toFixed(2)}L Cr`;

const CLASS_COLOR = { Equity: "#34d399", Debt: "#60a5fa", Hybrid: "#a78bfa", Other: "#fbbf24", Solution: "#f472b6" };

// All-AMC equity index: average each AMC's normalised index per date.
function marketIndex() {
  const byDate = {};
  for (const pts of Object.values(trendData.amcs)) {
    for (const [d, v] of pts) (byDate[d] ||= []).push(v);
  }
  return Object.entries(byDate)
    .map(([d, a]) => [d.slice(5), Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) / 100])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));
}

export default async function Page() {
  const [byClass, amcRows, headline, amcFlows, signals] = await Promise.all([
    sb("v_asset_class_summary?select=*"),
    sb("v_amc_summary?select=*&asset_class=eq.Equity&order=schemes.desc&limit=10"),
    sb("v_flow_headline?select=*"),
    sb("v_amc_flows?select=amc_name,asset_class,net_flow_cr&order=net_flow_cr.desc&limit=10"),
    sb("v_signals?select=*&limit=6"),
  ]);
  const flow = headline[0] || {};
  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const maxClass = Math.max(...byClass.map((r) => Number(r.schemes)));
  const series = marketIndex();
  const idxChange = series.length ? series[series.length - 1][1] - series[0][1] : 0;

  return (
    <main>
      <Tracker event="page_view" payload={{ page: "home" }} />

      <header className="site-head">
        <div className="brand"><span className="pulse-dot" /> MF Pulse</div>
        <div className="live-pill">Live · AMFI · {latest}</div>
      </header>

      <div className="section-head" style={{ marginTop: 26 }}>
        <div>
          <div className="eyebrow">Net flows · {flow.month || "—"}</div>
          <h2 style={{ fontSize: 22, fontWeight: 750, letterSpacing: "-0.03em", marginTop: 4 }}>
            Where India's mutual-fund money moved
          </h2>
        </div>
        <span className="badge-sample" title="SEBI/AMFI monthly flow report is PDF-only; these figures are seeded sample data until the monthly export is wired in.">
          Sample flows
        </span>
      </div>

      <section className="hero">
        <div className="metric pos">
          <div className="v pos">{inr(flow.equity_net_cr ?? 0)}</div>
          <div className="k">Equity net inflow</div>
        </div>
        <div className="metric neg">
          <div className="v neg">{inr(flow.debt_net_cr ?? 0)}</div>
          <div className="k">Debt net flow</div>
        </div>
        <div className="metric neutral">
          <div className="v">{lakhCr(flow.total_aum_cr ?? 0)}</div>
          <div className="k">Total AUM · reporting AMCs</div>
        </div>
      </section>

      <Search />

      <section className="section">
        <div className="section-head">
          <h2>30-day equity index · all AMCs · normalised to 100</h2>
          <span style={{ fontSize: 13, fontWeight: 700, color: idxChange >= 0 ? "var(--pos)" : "var(--neg)" }}>
            {idxChange >= 0 ? "▲" : "▼"} {idxChange.toFixed(2)}
          </span>
        </div>
        <div className="panel"><TrendChart series={series} /></div>
      </section>

      {signals.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>⚡ Flow signals · {flow.month || "—"}</h2><span className="eyebrow">z-score ≥ 1.8 vs trailing</span></div>
          <div className="signals">
            {signals.map((s, i) => (
              <a className="signal" key={i} href={`/amc/${encodeURIComponent(s.amc_name)}`}>
                <span className={`sig-dot ${s.signal === "inflow_surge" ? "up" : "down"}`}>{s.signal === "inflow_surge" ? "▲" : "▼"}</span>
                <span className="sig-body">
                  <span className="sig-amc">{s.amc_name.replace(" Mutual Fund", "")} · {s.asset_class}</span>
                  <span className="sig-meta">{s.signal === "inflow_surge" ? "Inflow surge" : "Outflow surge"} · {inr(s.net_flow_cr)}</span>
                </span>
                <span className="sig-z">z {Number(s.z_score).toFixed(1)}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <Watchlist />

      <section className="section">
        <div className="section-head"><h2>AMC net flows · {flow.month || "—"}</h2><span className="eyebrow">tap to drill down</span></div>
        <div className="chips">
          {amcFlows.map((r) => (
            <a className="chip" key={r.amc_name + r.asset_class} href={`/amc/${encodeURIComponent(r.amc_name)}`}>
              {r.amc_name.replace(" Mutual Fund", "")}
              <b className={Number(r.net_flow_cr) >= 0 ? "pos" : "neg"}>{inr(r.net_flow_cr)}</b>
            </a>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="hero" style={{ marginTop: 0 }}>
          <div className="metric"><div className="v">{fmt(totalSchemes)}</div><div className="k">Schemes tracked · live AMFI</div></div>
          <div className="metric"><div className="v">51</div><div className="k">Asset management companies</div></div>
          <div className="metric"><div className="v">{byClass.length}</div><div className="k">Asset classes</div></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Universe by asset class</h2></div>
        <div className="panel">
          {byClass.map((r) => (
            <div className="bar-row" key={r.asset_class}>
              <span className="bar-lbl">{r.asset_class}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(Number(r.schemes) / maxClass) * 100}%`, background: CLASS_COLOR[r.asset_class] || "#64748b" }} />
              </span>
              <span className="bar-val">{fmt(r.schemes)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Top AMCs by equity schemes</h2><span className="eyebrow">tap to drill down</span></div>
        <div className="chips">
          {amcRows.map((r) => (
            <a className="chip" key={r.amc_name} href={`/amc/${encodeURIComponent(r.amc_name)}`}>
              {r.amc_name.replace(" Mutual Fund", "")}<b style={{ color: "var(--muted)" }}>{fmt(r.schemes)}</b>
            </a>
          ))}
        </div>
      </section>

      <AlertSignup />

      <footer className="foot">
        Scheme &amp; NAV data is <b>live from AMFI</b> — {fmt(totalSchemes)} schemes across 51 AMCs, refreshed nightly.
        Net-flow figures are <b>sample data</b> (SEBI/AMFI monthly report is PDF-only; <code>ingestion/sebi_flows.py</code> ingests the real export).
        <br />Built with Next.js · Supabase · data © <a href="https://www.amfiindia.com">AMFI</a>
        · <a href="/about">About</a> · <a href="/status">Status</a>
      </footer>
    </main>
  );
}
