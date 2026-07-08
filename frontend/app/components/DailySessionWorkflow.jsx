"use client";
import { useState, useEffect } from "react";
import Badge from "./ui/Badge";
import SectionHeader from "./ui/SectionHeader";
import { track } from "../lib/track";

export default function DailySessionWorkflow({ daily, headlines, children }) {
  const [completedSession, setCompletedSession] = useState(null);
  const [step, setStep] = useState(null); // null = intro, 1 = story, 2 = alerts, 3 = rotations, 4 = news/questions, 5 = finish
  const [checkedStatements, setCheckedStatements] = useState({});
  const [reviewedFunds, setReviewedFunds] = useState({});
  const [trackedCohorts, setTrackedCohorts] = useState({});
  const [unansweredQuestions, setUnansweredQuestions] = useState(["", "", ""]);
  const [observations, setObservations] = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Check if session already completed today
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`mfp_session_completed_${daily.asOf}`);
      if (stored) {
        setCompletedSession(JSON.parse(stored));
      }
    } catch {}
  }, [daily.asOf]);

  const triggerAudioPing = () => {
    try {
      const isEnabled = localStorage.getItem("mfp_audio_enabled") !== "false";
      if (!isEnabled) return;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      // Success chord: C5 (523.25Hz) followed by E5 (659.25Hz)
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  };

  const startSession = () => {
    setStep(1);
    track("session_started", { date: daily.asOf });
  };

  const nextStep = () => {
    if (step < 5) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const toggleStatement = (index) => {
    setCheckedStatements((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const toggleFundReviewed = (code) => {
    setReviewedFunds((prev) => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  const toggleCohortTracked = (name) => {
    setTrackedCohorts((prev) => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  const handleQuestionChange = (index, value) => {
    const next = [...unansweredQuestions];
    next[index] = value;
    setUnansweredQuestions(next);
  };

  const completeSession = () => {
    const session = {
      date: daily.asOf,
      completedAt: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      statementsReviewed: Object.keys(checkedStatements).filter((k) => checkedStatements[k]),
      fundsReviewed: Object.keys(reviewedFunds).filter((k) => reviewedFunds[k]),
      cohortsTracked: Object.keys(trackedCohorts).filter((k) => trackedCohorts[k]),
      questions: unansweredQuestions.filter((q) => q.trim() !== ""),
      observations,
    };

    try {
      localStorage.setItem(`mfp_session_completed_${daily.asOf}`, JSON.stringify(session));
    } catch {}

    setCompletedSession(session);
    setStep(null);
    triggerAudioPing();
    track("session_completed", { date: daily.asOf });
  };

  const resetSession = () => {
    if (confirm("Are you sure you want to restart today's session? All inputs will be cleared.")) {
      try {
        localStorage.removeItem(`mfp_session_completed_${daily.asOf}`);
      } catch {}
      setCompletedSession(null);
      setCheckedStatements({});
      setReviewedFunds({});
      setTrackedCohorts({});
      setUnansweredQuestions(["", "", ""]);
      setObservations("");
      setStep(1);
    }
  };

  // Check if current step forms are validated before proceeding
  const isStepValid = () => {
    if (step === 1) {
      // Require checking at least one statement to ensure engagement
      return Object.values(checkedStatements).some(Boolean);
    }
    if (step === 2) {
      // Require reviewing at least one alert if explained alerts exist
      if (daily.explained.length === 0) return true;
      return Object.values(reviewedFunds).some(Boolean);
    }
    return true;
  };

  // Render completed banner
  if (completedSession) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-pos bg-pos/5 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-pos animate-pulse" />
              <h4 className="text-[14px] font-bold text-white">Today's Research Session Completed</h4>
            </div>
            <p className="text-[12.5px] text-ink-muted">
              You reviewed {completedSession.statementsReviewed.length} market points, analyzed {completedSession.fundsReviewed.length} fund alerts, and logged your notebook thesis at {completedSession.completedAt}.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowSummaryModal(!showSummaryModal)}
              className="rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] px-3.5 py-2 text-[12px] font-bold text-white transition-all"
            >
              {showSummaryModal ? "Hide Briefing" : "Read Strategy Briefing 📑"}
            </button>
            <button
              onClick={resetSession}
              className="rounded-xl border border-white/10 bg-white/[0.01] hover:bg-white/[0.04] px-3.5 py-2 text-[12px] text-ink-faint hover:text-white transition-all"
            >
              Restart Session
            </button>
          </div>

          {showSummaryModal && (
            <div className="w-full border-t border-white/[0.08] pt-4 mt-2 space-y-4 animate-fade-in text-[12.5px]">
              {completedSession.observations && (
                <div>
                  <span className="text-[9.5px] uppercase font-bold tracking-widest text-ink-faint block mb-1">
                    Today's Strategy Thesis
                  </span>
                  <p className="text-white bg-white/[0.015] border border-line rounded-lg p-3 leading-relaxed">
                    {completedSession.observations}
                  </p>
                </div>
              )}
              {completedSession.questions.length > 0 && (
                <div>
                  <span className="text-[9.5px] uppercase font-bold tracking-widest text-ink-faint block mb-1">
                    Open Questions for Tomorrow
                  </span>
                  <ul className="space-y-1 text-ink-muted pl-4 list-disc">
                    {completedSession.questions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {completedSession.cohortsTracked.length > 0 && (
                <div>
                  <span className="text-[9.5px] uppercase font-bold tracking-widest text-ink-faint block mb-1">
                    Tracked Cohorts
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {completedSession.cohortsTracked.map((c) => (
                      <span key={c} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-white bg-white/[0.02]">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
    );
  }

  // Active Session Wizard View
  if (step !== null) {
    return (
      <div className="rounded-2xl border border-accent bg-[#0d0f17] p-6 space-y-6 animate-fade-in">
        
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-accent-soft">
              Step {step} of 5
            </span>
            <h3 className="text-[16px] font-bold text-white mt-0.5">
              {step === 1 && "1. Audit Daily Market Breadth & Story"}
              {step === 2 && "2. Review Critical Explained Alerts"}
              {step === 3 && "3. Track Cohort & AMC Rotations"}
              {step === 4 && "4. News Integration & Unanswered Questions"}
              {step === 5 && "5. Review Log & Complete Daily Work"}
            </h3>
          </div>
          <Badge tone={daily.industry.riskRegime === "Risk-On" ? "pos" : "neg"} dot>
            {daily.industry.riskRegime} Regime
          </Badge>
        </div>

        {/* STEP 1: MARKET STORY */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Verify today's market breadth metrics. Check off each statement once reviewed to unlock the next step.
            </p>
            <div className="space-y-2.5">
              {daily.industry.statements.map((s, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleStatement(idx)}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    checkedStatements[idx]
                      ? "border-accent/40 bg-accent/5 text-white"
                      : "border-line bg-white/[0.01] text-ink-muted hover:bg-white/[0.02]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!checkedStatements[idx]}
                    onChange={() => {}}
                    className="mt-0.5 rounded border-line bg-transparent accent-accent"
                  />
                  <span className="text-[12.5px] leading-relaxed select-none">{s}</span>
                </div>
              ))}
            </div>
            {Object.values(checkedStatements).filter(Boolean).length === 0 && (
              <p className="text-[11px] text-warn">⚠️ Check off at least one statement to demonstrate audit verification.</p>
            )}
          </div>
        )}

        {/* STEP 2: RESEARCH ALERTS */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Review today's critical fund movements. Toggle "Mark Audited" for each fund item to confirm your review.
            </p>
            
            {daily.explained.length > 0 ? (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {daily.explained.map((i, k) => (
                  <div
                    key={k}
                    className={`rounded-xl border p-4 transition-all space-y-3 ${
                      reviewedFunds[i.entity_id] ? "border-pos/30 bg-pos/5" : "border-line bg-white/[0.01]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-[13px] font-bold text-white">{i.title}</h4>
                        <p className="text-[12px] text-ink-muted mt-1 leading-relaxed">{i.why} {i.care}</p>
                      </div>
                      <Badge tone={i.severity === "caution" ? "warn" : "pos"}>{i.value}</Badge>
                    </div>

                    <div className="text-[11px] text-ink-faint font-mono border-t border-white/[0.04] pt-2 flex flex-wrap items-center justify-between gap-2">
                      <span>{i.metric}: {i.previous_value} → {i.current_value}</span>
                      <div className="flex items-center gap-3">
                        <a
                          href={`/fund/${i.entity_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-soft hover:underline font-sans"
                        >
                          Deep Dive details →
                        </a>
                        <button
                          onClick={() => toggleFundReviewed(i.entity_id)}
                          className={`rounded px-2 py-0.5 text-[10px] uppercase font-bold font-sans transition-all ${
                            reviewedFunds[i.entity_id]
                              ? "bg-pos/20 text-pos"
                              : "bg-white/10 text-white hover:bg-white/20"
                          }`}
                        >
                          {reviewedFunds[i.entity_id] ? "✓ Audited" : "Mark Audited"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-faint py-6 text-center">
                No explained fund alerts require attention today.
              </p>
            )}
            {daily.explained.length > 0 && Object.values(reviewedFunds).filter(Boolean).length === 0 && (
              <p className="text-[11px] text-warn">⚠️ Mark at least one explained movement as audited before proceeding.</p>
            )}
            {Object.keys(reviewedFunds).filter((k) => reviewedFunds[k]).length > 0 && (
              <div className="mt-3 flex justify-end">
                <a
                  href={`/compare?funds=${Object.keys(reviewedFunds).filter((k) => reviewedFunds[k]).join(",")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-[12.5px] font-bold text-white transition-all hover:bg-accent/20"
                >
                  Compare Audited Alerts Side-by-Side ({Object.keys(reviewedFunds).filter((k) => reviewedFunds[k]).length}) →
                </a>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: ROTATIONS & MOMENTUM */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Analyze category rotations and AMC momentum shifts. Select key cohorts to track today.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Category list */}
              <div className="space-y-3 rounded-xl border border-line bg-white/[0.005] p-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint">
                  Category Momentum
                </span>
                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                  {(daily.categoryRotation || []).map((c) => (
                    <div
                      key={c.name}
                      onClick={() => toggleCohortTracked(c.name)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-[12.5px] cursor-pointer transition-all ${
                        trackedCohorts[c.name]
                          ? "border-accent bg-accent/5 text-white"
                          : "border-transparent bg-white/[0.01] text-ink-muted hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!trackedCohorts[c.name]}
                          onChange={() => {}}
                          className="rounded border-line bg-transparent accent-accent"
                        />
                        <span className="font-semibold">{c.name}</span>
                      </div>
                      <span className={c.rank_change > 0 ? "text-pos font-mono font-bold" : c.rank_change < 0 ? "text-neg font-mono font-bold" : "text-ink-faint font-mono"}>
                        {c.rank_change === 0 ? "—" : `${c.rank_change > 0 ? "↑" : "↓"}${Math.abs(c.rank_change)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AMC list */}
              <div className="space-y-3 rounded-xl border border-line bg-white/[0.005] p-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint">
                  AMC Momentum Shifts
                </span>
                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                  {(daily.amcMomentum || []).map((a) => (
                    <div
                      key={a.name}
                      onClick={() => toggleCohortTracked(a.name)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-[12.5px] cursor-pointer transition-all ${
                        trackedCohorts[a.name]
                          ? "border-accent bg-accent/5 text-white"
                          : "border-transparent bg-white/[0.01] text-ink-muted hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!trackedCohorts[a.name]}
                          onChange={() => {}}
                          className="rounded border-line bg-transparent accent-accent"
                        />
                        <span className="font-semibold">{a.name}</span>
                      </div>
                      <span className={a.rank_change > 0 ? "text-pos font-mono font-bold" : a.rank_change < 0 ? "text-neg font-mono font-bold" : "text-ink-faint font-mono"}>
                        {a.rank_change === 0 ? "—" : `${a.rank_change > 0 ? "↑" : "↓"}${Math.abs(a.rank_change)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* STEP 4: NEWS & QUESTIONS */}
        {step === 4 && (
          <div className="space-y-5">
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Verify external headlines and log unanswered questions for tomorrow's checklist.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              
              {/* Headlines column */}
              <div className="md:col-span-5 space-y-3 rounded-xl border border-line bg-white/[0.005] p-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint">
                  Today's Top Headlines
                </span>
                <div className="space-y-3">
                  {headlines.map((n) => (
                    <div key={n.id} className="text-[12px] border-b border-white/[0.03] pb-2 last:border-0 last:pb-0">
                      <span className="text-[10px] text-ink-faint font-mono block">
                        {n.source?.name || "News"} · {new Date(n.publishedAt).toLocaleDateString("en-IN")}
                      </span>
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-accent-soft font-bold block mt-0.5 leading-snug">
                        {n.title}
                      </a>
                    </div>
                  ))}
                  {headlines.length === 0 && (
                    <p className="text-[11.5px] text-ink-faint">No recent headlines loaded.</p>
                  )}
                </div>
              </div>

              {/* Questions/Notes column */}
              <div className="md:col-span-7 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block">
                    Unanswered Questions for Tomorrow
                  </label>
                  {unansweredQuestions.map((q, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={q}
                      onChange={(e) => handleQuestionChange(idx, e.target.value)}
                      placeholder={`Question #${idx + 1}... (e.g. Will Small-Cap valuations cool?)`}
                      className="w-full rounded-xl border border-line bg-white/[0.02] px-3.5 py-2 text-[12.5px] text-white outline-none focus:border-line-strong"
                    />
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block">
                    Strategy Thesis / Diary Notes
                  </label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Type notes summarizing today's overall research consensus..."
                    rows={3}
                    className="w-full rounded-xl border border-line bg-white/[0.02] px-3.5 py-2 text-[12.5px] text-white outline-none placeholder:text-ink-faint focus:border-line-strong leading-relaxed"
                  />
                </div>
              </div>

            </div>
          </div>
        )}

        {/* STEP 5: FINAL REVIEW LOG */}
        {step === 5 && (
          <div className="space-y-5 text-[12.5px]">
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Confirm your logged data and complete today's research cycle.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              <div className="rounded-xl border border-line bg-white/[0.005] p-5 space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block">
                  Acknowledge & Reviewed
                </span>
                <ul className="space-y-1.5 text-white pl-4 list-disc font-mono text-[11.5px]">
                  <li>{Object.values(checkedStatements).filter(Boolean).length} Breadth Statements confirmed</li>
                  <li>{Object.values(reviewedFunds).filter(Boolean).length} Fund Explained alerts audited</li>
                  <li>{Object.values(trackedCohorts).filter(Boolean).length} Rotations tracked</li>
                </ul>
              </div>

              <div className="rounded-xl border border-line bg-white/[0.005] p-5 space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block">
                  Questions Captured
                </span>
                <ul className="space-y-1.5 text-white pl-4 list-disc">
                  {unansweredQuestions.filter(q => q.trim() !== "").map((q, idx) => (
                    <li key={idx} className="italic text-ink-muted">"{q}"</li>
                  ))}
                  {unansweredQuestions.filter(q => q.trim() !== "").length === 0 && (
                    <li className="text-ink-faint">No specific questions logged.</li>
                  )}
                </ul>
              </div>

            </div>

            {observations && (
              <div className="rounded-xl border border-line bg-white/[0.02] p-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-ink-faint block mb-1">
                  Strategy Thesis
                </span>
                <p className="text-white leading-relaxed">{observations}</p>
              </div>
            )}
          </div>
        )}

        {/* Navigation Actions */}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
          <button
            onClick={prevStep}
            disabled={step === 1}
            className={`rounded-xl border border-white/10 px-4 py-2 text-[12px] font-bold transition-all ${
              step === 1
                ? "text-ink-faint border-white/5 cursor-not-allowed"
                : "text-white hover:bg-white/[0.04]"
            }`}
          >
            ← Back
          </button>
          
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                if (confirm("Cancel session? Inputs will not be saved.")) {
                  setStep(null);
                }
              }}
              className="rounded-xl border border-transparent px-4 py-2 text-[12px] text-ink-faint hover:text-white transition-all"
            >
              Cancel Session
            </button>
            {step < 5 ? (
              <button
                onClick={nextStep}
                disabled={!isStepValid()}
                className={`rounded-xl px-4 py-2 text-[12px] font-bold text-white transition-all ${
                  isStepValid()
                    ? "bg-accent hover:bg-accent/80"
                    : "bg-white/5 text-ink-faint cursor-not-allowed"
                }`}
              >
                Next Step →
              </button>
            ) : (
              <button
                onClick={completeSession}
                className="rounded-xl bg-pos px-5 py-2 text-[12.5px] font-bold text-white hover:bg-pos/80 transition-all"
              >
                Complete Today's Research Session ✓
              </button>
            )}
          </div>
        </div>

      </div>
    );
  }

  // Intro Launcher
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <h4 className="text-[14px] font-bold text-white">Daily Research Session Available</h4>
          </div>
          <p className="text-[12.5px] text-ink-muted max-w-xl">
            An interactive, step-by-step audit of today's market breath, explained fund metrics, rotation checklists, news headlines, and strategy notebook logging.
          </p>
        </div>
        <button
          onClick={startSession}
          className="rounded-xl bg-accent px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-accent/80 transition-all shadow-lg"
        >
          Start Today's Session (20-min target)
        </button>
      </div>
      {children}
    </div>
  );
}
