import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import SectionHeader from "../components/ui/SectionHeader";
import Badge from "../components/ui/Badge";
import { sb } from "../lib/supabase";
import { allFunds, getFund, asOf } from "../lib/funds";
import { allMetadata } from "../lib/metadata";
import daily from "../data/daily.json";

export const metadata = { title: "Discover — MF Pulse" };
export const revalidate = 900;

// Phase 3 discoverability — every section is either (a) computed from real AMFI/factsheet data
// (always populated) or (b) a real aggregate of tracked user_events (may be genuinely empty on
// a low-traffic day — shown honestly, never padded). No section here fabricates popularity.
function Empty({ children }) {
  return <p className="text-[12.5px] text-ink-faint">{children}</p>;
}

function Chip({ href, children }) {
  return <a href={href} className="rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink">{children}</a>;
}

export default async function DiscoverPage() {
  const [searches, funds, cats, amcs, compared, watchlisted] = await Promise.all([
    sb("v_top_searches?select=*", { revalidate: 900 }).catch(() => []),
    sb("v_top_funds_viewed?select=*", { revalidate: 900 }).catch(() => []),
    sb("v_top_categories_viewed?select=*", { revalidate: 900 }).catch(() => []),
    sb("v_top_amcs_viewed?select=*", { revalidate: 900 }).catch(() => []),
    sb("v_top_compared?select=*", { revalidate: 900 }).catch(() => []),
    sb("v_top_watchlisted?select=*", { revalidate: 900 }).catch(() => []),
  ]);

  // Real, always-populated: rank-improvement signals already computed by the explanation engine.
  const improved = (daily.explained || []).filter((e) => e.severity === "positive").slice(0, 6);

  // Real, factsheet-sourced launch dates (SBI today — honestly small, never padded).
  const launched = allMetadata()
    .filter((m) => m.launch_date)
    .sort((a, b) => (b.launch_date > a.launch_date ? 1 : -1))
    .slice(0, 6);

  const viewedFunds = funds.map((v) => ({ ...v, fund: getFund(v.scheme_code) })).filter((v) => v.fund);

  return (
    <>
      <Nav active="/discover" />
      <Tracker event="page_view" payload={{ page: "discover" }} />
      <main className="container-px py-8 sm:py-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Discover · {asOf}</div>
        <h1 className="mt-2 text-[26px] sm:text-[32px] font-bold tracking-tightest text-ink">What&rsquo;s worth looking at</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Real signals from the data, and real activity from investors using MF Pulse. Nothing
          here is ranked by guesswork — sections based on tracked behaviour show exactly what
          they measure, and say so plainly when there isn&rsquo;t enough activity yet.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <SectionHeader eyebrow="rank-improvement engine · real NAV" title="Recently improved funds" />
            {improved.length ? (
              <div className="space-y-2">
                {improved.map((e) => (
                  <a key={e.entity_id} href={`/fund/${e.entity_id}`} className="glass block p-3 transition-colors hover:bg-white/[0.045]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-ink">{e.title}</span>
                      <Badge tone="pos">{e.current_value}</Badge>
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-faint">{e.why}</p>
                  </a>
                ))}
              </div>
            ) : <Empty>No funds crossed a rank-improvement threshold today.</Empty>}
          </section>

          <section>
            <SectionHeader eyebrow="factsheet-verified launch dates" title="Recently launched funds" />
            {launched.length ? (
              <div className="space-y-2">
                {launched.map((m) => (
                  <a key={m.scheme_code} href={`/fund/${m.scheme_code}`} className="glass flex items-center justify-between gap-3 p-3 transition-colors hover:bg-white/[0.045]">
                    <span className="truncate text-[13px] text-ink">{m.scheme_name?.split(" - ")[0]}</span>
                    <span className="shrink-0 text-[11.5px] tnum text-ink-faint">{m.launch_date}</span>
                  </a>
                ))}
              </div>
            ) : <Empty>No launch dates available yet — factsheet coverage is still limited.</Empty>}
            <p className="mt-2 text-[10.5px] text-ink-faint">Launch dates come from acquired AMC factsheets (SBI today) — not every fund's launch date has been acquired yet, so this list is a subset, not the newest funds industry-wide.</p>
          </section>

          <section>
            <SectionHeader eyebrow="real search activity" title="Trending searches" />
            {searches.length ? (
              <div className="flex flex-wrap gap-2">
                {searches.map((s) => <Chip key={s.query} href={`/funds?q=${encodeURIComponent(s.query)}`}>{s.query} <span className="text-ink-faint">· {s.searches}</span></Chip>)}
              </div>
            ) : <Empty>Not enough search activity yet to show a trend.</Empty>}
          </section>

          <section>
            <SectionHeader eyebrow="real page views" title="Most viewed funds" />
            {viewedFunds.length ? (
              <div className="space-y-2">
                {viewedFunds.map((v) => (
                  <a key={v.scheme_code} href={`/fund/${v.scheme_code}`} className="glass flex items-center justify-between gap-3 p-3 transition-colors hover:bg-white/[0.045]">
                    <span className="truncate text-[13px] text-ink">{v.fund.name.replace(/ - (Direct|Regular).*/i, "")}</span>
                    <span className="shrink-0 text-[11.5px] tnum text-ink-faint">{v.views} view{v.views === 1 ? "" : "s"}</span>
                  </a>
                ))}
              </div>
            ) : <Empty>Not enough views yet to surface a most-viewed list.</Empty>}
          </section>

          <section>
            <SectionHeader eyebrow="real page views" title="Popular categories" />
            {cats.length ? (
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => <Chip key={c.category} href={`/categories/${encodeURIComponent(c.category)}`}>{c.category} <span className="text-ink-faint">· {c.views}</span></Chip>)}
              </div>
            ) : <Empty>Not enough category views yet.</Empty>}
          </section>

          <section>
            <SectionHeader eyebrow="real page views" title="Popular AMCs" />
            {amcs.length ? (
              <div className="flex flex-wrap gap-2">
                {amcs.map((a) => <Chip key={a.amc} href={`/amc/${encodeURIComponent(a.amc.replace(" Mutual Fund", "") + " Mutual Fund")}`}>{a.amc} <span className="text-ink-faint">· {a.views}</span></Chip>)}
              </div>
            ) : <Empty>Not enough AMC views yet.</Empty>}
          </section>

          <section>
            <SectionHeader eyebrow="real comparison activity" title="Most compared AMCs" />
            {compared.length ? (
              <div className="flex flex-wrap gap-2">{compared.map((c) => <Chip key={c.amc} href="/compare">{c.amc} <span className="text-ink-faint">· {c.compares}</span></Chip>)}</div>
            ) : <Empty>Not enough comparison activity yet.</Empty>}
          </section>

          <section>
            <SectionHeader eyebrow="real watchlist activity" title="Most watchlisted funds" />
            {watchlisted.length ? (
              <div className="space-y-2">
                {watchlisted.map((w) => {
                  const f = getFund(w.scheme_code);
                  return f ? (
                    <a key={w.scheme_code} href={`/fund/${w.scheme_code}`} className="glass flex items-center justify-between gap-3 p-3 transition-colors hover:bg-white/[0.045]">
                      <span className="truncate text-[13px] text-ink">{f.name.replace(/ - (Direct|Regular).*/i, "")}</span>
                      <span className="shrink-0 text-[11.5px] tnum text-ink-faint">{w.adds} add{w.adds === 1 ? "" : "s"}</span>
                    </a>
                  ) : null;
                })}
              </div>
            ) : <Empty>Not enough watchlist activity yet.</Empty>}
          </section>
        </div>

        <p className="mt-8 text-[11px] text-ink-faint">
          Behaviour-based sections are real aggregates of tracked events (never fabricated) — they
          are genuinely sparse on a low-traffic platform and will fill in as usage grows. Data-based
          sections (recently improved, recently launched) are always fully real regardless of traffic.
        </p>
      </main>
      <Footer note={<span>Discoverability from real tracked behaviour + real AMFI/factsheet data · as of {asOf}.</span>} />
    </>
  );
}
