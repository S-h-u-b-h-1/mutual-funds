// MF Pulse dashboard — server component reading the live Supabase views via PostgREST.
import { sb } from "./lib/supabase";
import Search from "./components/Search";
import Tracker from "./components/Tracker";
import Watchlist from "./components/Watchlist";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const inr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;
const lakhCr = (n) => `₹${(n / 100000).toFixed(1)}L Cr`;

const CLASS_COLOR = {
  Equity: "#22c55e",
  Debt: "#3b82f6",
  Hybrid: "#a855f7",
  Other: "#f59e0b",
  Solution: "#ec4899",
};

export default async function Page() {
  const [byClass, amcRows, headline, amcFlows] = await Promise.all([
    sb("v_asset_class_summary?select=*"),
    sb("v_amc_summary?select=*&asset_class=eq.Equity&order=schemes.desc&limit=8"),
    sb("v_flow_headline?select=*"),
    sb("v_amc_flows?select=amc_name,asset_class,net_flow_cr&order=net_flow_cr.desc&limit=8"),
  ]);
  const flow = headline[0] || {};

  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const amcCount = new Set(amcRows.map((r) => r.amc_name)).size;
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const maxClass = Math.max(...byClass.map((r) => Number(r.schemes)));

  return (
    <main>
      <header className="top">
        <div className="brand">
          <span className="dot" /> MF Pulse
        </div>
        <div className="live">Live · data from AMFI · {latest}</div>
      </header>

      <Tracker event="page_view" payload={{ page: "home" }} />
      <Search />
      <Watchlist />

      <div className="flow-head">
        <h2 className="flow-title">Net flows · {flow.month || "—"}</h2>
        <span className="badge-sample" title="The SEBI/AMFI monthly report is PDF-only; these figures are seeded sample data until the monthly export is wired in.">
          Sample · live SEBI feed pending
        </span>
      </div>
      <section className="hero">
        <div className="card">
          <div className="big pos">{inr(flow.equity_net_cr ?? 0)}</div>
          <div className="lbl">Equity net inflow</div>
        </div>
        <div className="card">
          <div className="big neg">{inr(flow.debt_net_cr ?? 0)}</div>
          <div className="lbl">Debt net flow</div>
        </div>
        <div className="card">
          <div className="big">{lakhCr(flow.total_aum_cr ?? 0)}</div>
          <div className="lbl">Total AUM (reporting AMCs)</div>
        </div>
      </section>

      <section className="panel">
        <h2>AMC net flows · {flow.month || "—"} · sample</h2>
        <div className="chips">
          {amcFlows.map((r) => (
            <a className="chip" key={r.amc_name + r.asset_class} href={`/amc/${encodeURIComponent(r.amc_name)}`}>
              {r.amc_name.replace(" Mutual Fund", "")}
              <b style={{ color: Number(r.net_flow_cr) >= 0 ? "#22c55e" : "#f87171" }}>
                {inr(r.net_flow_cr)}
              </b>
            </a>
          ))}
        </div>
      </section>

      <section className="hero">
        <div className="card">
          <div className="big">{fmt(totalSchemes)}</div>
          <div className="lbl">Schemes tracked (live · AMFI)</div>
        </div>
        <div className="card">
          <div className="big">51</div>
          <div className="lbl">Asset management companies</div>
        </div>
        <div className="card">
          <div className="big">{byClass.length}</div>
          <div className="lbl">Asset classes</div>
        </div>
      </section>

      <section className="panel">
        <h2>Universe by asset class</h2>
        {byClass.map((r) => (
          <div className="bar-row" key={r.asset_class}>
            <span className="bar-lbl">{r.asset_class}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{
                  width: `${(Number(r.schemes) / maxClass) * 100}%`,
                  background: CLASS_COLOR[r.asset_class] || "#64748b",
                }}
              />
            </span>
            <span className="bar-val">{fmt(r.schemes)}</span>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Top AMCs by equity schemes · tap any to drill down</h2>
        <div className="chips">
          {amcRows.map((r) => (
            <a className="chip" key={r.amc_name} href={`/amc/${encodeURIComponent(r.amc_name)}`}>
              {r.amc_name.replace(" Mutual Fund", "")}
              <b>{fmt(r.schemes)}</b>
            </a>
          ))}
        </div>
      </section>

      <footer className="foot">
        Scheme & NAV data is <b>live from AMFI</b> — {fmt(totalSchemes)} schemes across 51 AMCs,
        refreshed nightly. Net-flow figures are <b>sample data</b>: the SEBI/AMFI monthly report is
        PDF-only, and the loader (<code>ingestion/sebi_flows.py</code>) ingests it the moment you
        export the monthly CSV.
      </footer>
    </main>
  );
}
