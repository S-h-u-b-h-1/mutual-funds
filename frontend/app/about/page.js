export const metadata = { title: "About & data sources" };

export default function About() {
  return (
    <main>
      <header className="site-head">
        <div className="brand"><a href="/"><span className="pulse-dot" /> MF Pulse</a></div>
        <a className="back" href="/">← Dashboard</a>
      </header>

      <h1 className="amc-title">About MF Pulse</h1>
      <div className="amc-sub">Daily Indian mutual-fund flows & NAVs, from free public data.</div>

      <section className="section">
        <div className="section-head"><h2>Data sources</h2></div>
        <div className="panel">
          <ul style={{ lineHeight: 2, fontSize: 14, color: "var(--muted)", paddingLeft: 18 }}>
            <li><b style={{ color: "var(--text)" }}>NAVs & schemes</b> — AMFI daily <code>NAVAll.txt</code> (free, public), refreshed nightly.</li>
            <li><b style={{ color: "var(--text)" }}>NAV history</b> — AMFI date-range NAV report (real 30-day equity index).</li>
            <li><b style={{ color: "var(--text)" }}>Monthly net flows</b> — SEBI / AMFI monthly reports. The source is PDF/Excel only, so the headline flow figures shown are <b style={{ color: "#fcd34d" }}>sample data</b> until the monthly export is wired in.</li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>How it works</h2></div>
        <div className="panel">
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7 }}>
            A nightly pipeline downloads the AMFI file, parses it, loads Postgres, runs dbt
            transforms + data-quality gates, detects flow spikes, and serves everything through
            a cached API and this dashboard. Searches, drill-downs and alert sign-ups are logged
            for product analytics.
          </p>
        </div>
      </section>

      <footer className="foot">
        Not investment advice. Data © <a href="https://www.amfiindia.com">AMFI</a> / SEBI.
        · <a href="/status">System status</a> · <a href="https://github.com/S-h-u-b-h-1/MF-Pulse">Source</a>
      </footer>
    </main>
  );
}
