// Research Dashboard (Phase 10, Decision Support sprint) — the investor's daily workspace.
// Aggregates pieces that already exist elsewhere (research queue = same data as the homepage's
// "What deserves attention today", research history = RecentActivity, market regime =
// daily.industry) into one page framed around the mission's own question: "what deserves my
// attention today, why, and where do I continue?" — not a new data source, a new lens on real ones.
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import SectionHeader from "../components/ui/SectionHeader";
import GlassPanel from "../components/ui/GlassPanel";
import Badge from "../components/ui/Badge";
import RecentActivity from "../components/RecentActivity";
import SavedComparisons from "../components/SavedComparisons";
import NotebookPreview from "../components/NotebookPreview";
import DailySessionWorkflow from "../components/DailySessionWorkflow";
import { getTopHeadlines, relativeTime } from "../lib/news";
import daily from "../data/daily.json";

export const metadata = { title: "Research Dashboard" };
export const revalidate = 3600;

export default async function Dashboard() {
  const headlines = await getTopHeadlines({ limit: 4 });

  return (
    <>
      <Nav active="/dashboard" />
      <Tracker event="page_view" payload={{ page: "dashboard" }} />
      <main className="container-px py-9 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Your workspace</div>
            <h1 className="mt-2 text-[28px] sm:text-[32px] font-bold tracking-tightest text-ink">Research Dashboard</h1>
            <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
              What deserves attention today, why it matters, and where to continue — never what to buy.
            </p>
          </div>
          {daily.industry && <Badge tone={daily.industry.riskRegime === "Risk-On" ? "pos" : daily.industry.riskRegime === "Risk-Off" ? "neg" : "warn"} dot>{daily.industry.riskRegime}</Badge>}
        </div>

        <DailySessionWorkflow daily={daily} headlines={headlines}>
          {/* Today's Research Queue — same deterministic explanation-engine data as the homepage,
              framed here as the day's dedicated queue rather than a homepage section. */}
          <section className="mt-8">
            <SectionHeader eyebrow={`${daily.explained.length} items · metric → previous → current, every one traceable`} title="Today's Research Queue" />
            {daily.explained.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {daily.explained.map((i, k) => (
                  <a key={k} href={`/fund/${i.entity_id}`} className="glass p-3.5 transition-colors hover:bg-white/[0.04]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-medium text-ink">{i.title}</span>
                      <Badge tone={i.severity === "caution" ? "warn" : "pos"}>{i.value}</Badge>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{i.why} {i.care}</p>
                    <p className="mt-1 text-[10.5px] tnum text-ink-faint">{i.metric}: {i.previous_value} → {i.current_value} · attention {i.attentionScore}/100</p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint">No qualifying research-worthy movement today.</p>
            )}
            {daily.industry?.statements?.length > 0 && (
              <div className="mt-3 rounded-lg border border-line bg-white/[0.02] px-4 py-3">
                <ul className="space-y-1 text-[12.5px] text-ink-muted">
                  {daily.industry.statements.map((s, k) => <li key={k}><span className="text-accent-soft">›</span> {s}</li>)}
                </ul>
              </div>
            )}
          </section>

          {/* Category & AMC rotation — real 1M-vs-3M rank movement, the same "momentum" signal
              the Decision Engine folds into each fund's Research Priority Score. */}
          <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <GlassPanel className="p-5">
              <SectionHeader title="Category rotation" eyebrow="1M rank vs 3M rank" />
              <div className="flex flex-wrap gap-2">
                {(daily.categoryRotation || []).map((c) => (
                  <a key={c.name} href={`/categories/${encodeURIComponent(c.name)}`} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
                    <span>{c.name}</span>
                    <span className={c.rank_change > 0 ? "text-pos tnum font-semibold" : c.rank_change < 0 ? "text-neg tnum font-semibold" : "text-ink-faint tnum"}>
                      {c.rank_change === 0 ? "–" : `${c.rank_change > 0 ? "↑" : "↓"}${Math.abs(c.rank_change)}`}
                    </span>
                  </a>
                ))}
                {!(daily.categoryRotation || []).length && <p className="text-[12.5px] text-ink-faint">No category rotation data yet.</p>}
              </div>
            </GlassPanel>
            <GlassPanel className="p-5">
              <SectionHeader title="AMC momentum" eyebrow="1M rank vs 3M rank, by peer avg NAV return" />
              <div className="flex flex-wrap gap-2">
                {(daily.amcMomentum || []).map((a) => (
                  <a key={a.name} href={`/amc/${encodeURIComponent(a.name + " Mutual Fund")}`} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
                    <span>{a.name}</span>
                    <span className={a.rank_change > 0 ? "text-pos tnum font-semibold" : a.rank_change < 0 ? "text-neg tnum font-semibold" : "text-ink-faint tnum"}>
                      {a.rank_change === 0 ? "–" : `${a.rank_change > 0 ? "↑" : "↓"}${Math.abs(a.rank_change)}`}
                    </span>
                  </a>
                ))}
                {!(daily.amcMomentum || []).length && <p className="text-[12.5px] text-ink-faint">No AMC momentum data yet.</p>}
              </div>
            </GlassPanel>
          </div>

          {/* Your research history — reuses the existing homepage component (same localStorage,
              same data) so there's exactly one implementation of "what have I looked at". */}
          <section className="mt-7">
            <RecentActivity />
          </section>

          <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div>
              <SectionHeader title="Saved comparisons" eyebrow="from Compare → Save workspace" />
              <SavedComparisons />
            </div>
            <div>
              <SectionHeader title="Your notebook" eyebrow="private observations, per fund" />
              <NotebookPreview />
            </div>
            <GlassPanel className="p-5">
              <SectionHeader title="Recent news" action={<a className="hover:text-ink" href="/news">See all →</a>} />
              <div className="space-y-2.5">
                {headlines.map((n) => (
                  <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="block text-[12.5px] transition-colors hover:text-ink">
                    <div className="text-ink-faint">{n.source?.name || "Unknown source"} · {relativeTime(n.publishedAt)}</div>
                    <div className="text-ink-muted">{n.title}</div>
                  </a>
                ))}
                {!headlines.length && <p className="text-[12.5px] text-ink-faint">No recent news.</p>}
              </div>
            </GlassPanel>
          </div>

          {/* Coverage & pipeline health — condensed summary, full depth lives on their own pages
              (never duplicated logic, just a smaller lens + a link onward). */}
          <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <a href="/internal/data-completeness" className="glass block p-5 transition-colors hover:bg-white/[0.04]">
              <div className="text-[13px] font-semibold text-ink">Coverage improvements →</div>
              <p className="mt-1 text-[12px] text-ink-muted">Field-level completeness across factsheets, benchmarks, and NAV history.</p>
            </a>
            <a href="/status" className="glass block p-5 transition-colors hover:bg-white/[0.04]">
              <div className="text-[13px] font-semibold text-ink">Pipeline health →</div>
              <p className="mt-1 text-[12px] text-ink-muted">Ingestion freshness, run success rate, and data-source reachability.</p>
            </a>
          </div>
        </DailySessionWorkflow>
      </main>
      <Footer note={<span>Not investment advice — a workspace for research, not a recommendation engine.</span>} />
    </>
  );
}
