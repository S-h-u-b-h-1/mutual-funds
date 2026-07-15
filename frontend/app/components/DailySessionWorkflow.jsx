"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Badge from "./ui/Badge";
import { track } from "../lib/track";

const STORAGE_PREFIX = "mfp_morning_research_workflow";

function keyFor(date) {
  return `${STORAGE_PREFIX}_${date}`;
}

function StageCard({ stage, index, reviewed, active, onToggle, onSkip, children }) {
  return (
    <article className={`rounded-[1.35rem] border bg-surface p-4 transition ${active ? "border-accent/35 shadow-glow" : reviewed ? "border-pos/25" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${reviewed ? "bg-pos text-white" : active ? "bg-accent text-white" : "bg-surface-2 text-ink-faint"}`}>{reviewed ? "✓" : index + 1}</span>
            <h3 className="text-sm font-semibold text-ink">{stage.title}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{stage.conclusion}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onToggle} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${reviewed ? "bg-pos/10 text-pos" : "bg-accent/10 text-accent"}`}>{reviewed ? "Reviewed" : "Mark reviewed"}</button>
          <button type="button" onClick={onSkip} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink">Skip</button>
        </div>
      </div>
      {active && <div className="mt-4 border-t border-line/70 pt-4">{children}</div>}
    </article>
  );
}

export default function DailySessionWorkflow({ daily, headlines, children }) {
  const { data: session } = useSession();
  const [reviewed, setReviewed] = useState({});
  const [skipped, setSkipped] = useState({});
  const [activeStage, setActiveStage] = useState(0);
  const [note, setNote] = useState("");
  const [completedAt, setCompletedAt] = useState(null);

  const stages = useMemo(() => [
    {
      key: "breadth",
      title: "Market breadth",
      conclusion: `${daily.advancers || 0} schemes advanced and ${daily.decliners || 0} declined in the latest bundle.`,
      href: "/brief",
      evidence: daily.industry?.statements || [],
    },
    {
      key: "portfolio",
      title: "Portfolio/watchlist changes",
      conclusion: daily.explained?.length ? `${daily.explained.length} rule-based fund movements need attention.` : "No qualifying fund movement requires attention today.",
      href: "/dashboard#watchlist",
      evidence: (daily.explained || []).slice(0, 4).map((i) => `${i.title}: ${i.metric} ${i.previous_value} → ${i.current_value}`),
    },
    {
      key: "news",
      title: "Important news",
      conclusion: headlines?.length ? `${headlines.length} attributed headline${headlines.length === 1 ? "" : "s"} available for context.` : "No recent headline is available from the source feed.",
      href: "/news",
      evidence: (headlines || []).slice(0, 4).map((h) => `${h.source?.name || "News"}: ${h.title}`),
    },
    {
      key: "priorities",
      title: "Research priorities",
      conclusion: daily.categoryRotation?.length || daily.amcMomentum?.length ? "Category and AMC movement lists are ready for follow-up." : "No rotation list is available in this bundle.",
      href: "/research",
      evidence: [...(daily.categoryRotation || []).slice(0, 3), ...(daily.amcMomentum || []).slice(0, 3)].map((i) => `${i.name}: rank change ${i.rank_change || 0}`),
    },
    {
      key: "notes",
      title: "Notes and next actions",
      conclusion: note.trim() ? "A research note is saved locally for this session." : "Add a short note or finish without one.",
      href: "/dashboard#notebook",
      evidence: [],
    },
  ], [daily, headlines, note]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(keyFor(daily.asOf)) || "{}");
      setReviewed(stored.reviewed || {});
      setSkipped(stored.skipped || {});
      setNote(stored.note || "");
      setCompletedAt(stored.completedAt || null);
      setActiveStage(stored.activeStage || 0);
    } catch {}
  }, [daily.asOf]);

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(daily.asOf), JSON.stringify({ reviewed, skipped, note, completedAt, activeStage }));
    } catch {}
  }, [activeStage, completedAt, daily.asOf, note, reviewed, skipped]);

  const reviewedCount = stages.filter((stage) => reviewed[stage.key] || skipped[stage.key]).length;
  const progress = Math.round((reviewedCount / stages.length) * 100);

  function markReviewed(key) {
    setReviewed((current) => ({ ...current, [key]: !current[key] }));
    setSkipped((current) => ({ ...current, [key]: false }));
    track("morning_workflow_reviewed", { key });
  }

  function skip(key) {
    setSkipped((current) => ({ ...current, [key]: true }));
    setReviewed((current) => ({ ...current, [key]: false }));
    track("morning_workflow_skipped", { key });
  }

  function complete() {
    const timestamp = new Date().toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
    setCompletedAt(timestamp);
    track("morning_workflow_completed", { date: daily.asOf, reviewed: reviewedCount });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.7rem] border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-accent">Morning Research Workflow</div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-ink">Five concise checks before deeper research.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Preview works anonymously. Saving is local in this frontend until a verified cross-device workflow contract is supplied.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={daily.industry?.riskRegime === "Risk-On" ? "pos" : daily.industry?.riskRegime === "Risk-Off" ? "neg" : "warn"} dot>{daily.industry?.riskRegime || "Regime unavailable"}</Badge>
            <span className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-muted">~6 min</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-ink-faint"><span>{progress}% complete</span><span>{reviewedCount}/{stages.length} stages reviewed or skipped</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong"><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} /></div>
        </div>

        {completedAt && (
          <div className="mt-5 rounded-2xl border border-pos/25 bg-pos/10 p-4 text-sm text-ink-muted">
            <b className="text-pos">Workflow completed at {completedAt}.</b> {note.trim() ? "Your note is saved below." : "No note was captured."}
          </div>
        )}

        <div className="mt-5 grid gap-3">
          {stages.map((stage, index) => {
            const done = !!reviewed[stage.key];
            const wasSkipped = !!skipped[stage.key];
            return (
              <StageCard
                key={stage.key}
                stage={{ ...stage, conclusion: wasSkipped ? "Skipped for now. Resume later if this becomes relevant." : stage.conclusion }}
                index={index}
                reviewed={done}
                active={activeStage === index}
                onToggle={() => markReviewed(stage.key)}
                onSkip={() => skip(stage.key)}
              >
                {stage.evidence.length ? (
                  <ul className="space-y-2 text-sm text-ink-muted">
                    {stage.evidence.map((item, itemIndex) => <li key={itemIndex}>— {item}</li>)}
                  </ul>
                ) : stage.key === "notes" ? (
                  <label className="block text-sm font-semibold text-ink">Save note
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="What needs investigation next?" className="mt-2 w-full rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent" />
                  </label>
                ) : (
                  <p className="text-sm text-ink-muted">No new evidence is available for this stage.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={stage.href} className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bg">Open evidence</a>
                  <button type="button" onClick={() => setActiveStage(Math.min(stages.length - 1, index + 1))} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink">Continue</button>
                </div>
              </StageCard>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-ink-faint">{session ? "Signed in: progress is available in this browser session." : "Anonymous preview: sign in to use your personal dashboard and saved workspace."}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setActiveStage(0)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink">Resume</button>
            <button type="button" onClick={complete} className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white">Complete session</button>
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}
