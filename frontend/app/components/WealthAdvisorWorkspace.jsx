"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ADVISORY_DRAFT_KEY, ADVISORY_QUESTIONS, answerAdvisoryQuestion, buildRiskProfile, buildShortlist, rankFundsForProfile } from "../lib/advisoryEngine";
import { getResearchProfile } from "../lib/cloudSync";

const QUESTIONS = ADVISORY_QUESTIONS;

const QUICK_PROMPTS = ["Why is the first match suitable?", "Which option is steadier?", "Which has stronger observed returns?", "How did my horizon affect this?"].map((label) => ({ label }));

function ArrowIcon({ direction = "right" }) {
  const transform = direction === "left" ? "rotate(180 12 12)" : undefined;
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true" transform={transform}><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Progress({ current, answered }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Question ${current + 1} of ${QUESTIONS.length}`}>
      {QUESTIONS.map((question, index) => <span key={question.key} className={`h-1.5 flex-1 rounded-full ${index <= current || answered.has(question.key) ? "bg-accent" : "bg-surface-strong"}`} />)}
    </div>
  );
}

function Questionnaire({ answers, setAnswers, onComplete }) {
  const firstUnanswered = QUESTIONS.findIndex((question) => answers[question.key] == null);
  const [current, setCurrent] = useState(() => (firstUnanswered < 0 ? QUESTIONS.length - 1 : firstUnanswered));
  const question = QUESTIONS[current];
  const complete = QUESTIONS.every((item) => answers[item.key] != null);
  const answered = new Set(Object.keys(answers).filter((key) => answers[key] != null));

  function choose(value) {
    setAnswers((existing) => ({ ...existing, [question.key]: value }));
    if (current < QUESTIONS.length - 1) setCurrent((valueNow) => valueNow + 1);
  }

  return (
    <section className="grid overflow-hidden rounded-[1.8rem] border border-line bg-surface shadow-float lg:grid-cols-[280px_minmax(0,1fr)]" aria-labelledby="profile-heading">
      <div className="relative overflow-hidden bg-ink p-6 text-bg sm:p-8">
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full border border-bg/10" />
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/25 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bg/55">Step 1 · Understand you</div>
          <h2 id="profile-heading" className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Build your risk profile</h2>
          <p className="mt-3 text-sm leading-6 text-bg/65">Five answers create an explainable suitability profile. No account, PAN, phone number, or sales call.</p>
          <div className="mt-8 space-y-3 text-xs text-bg/60">
            {["Goal and time horizon", "Ability to absorb loss", "Likely behavior in a decline", "Investment experience"].map((item, index) => <div key={item} className="flex items-center gap-3"><span className={`grid h-6 w-6 place-items-center rounded-full border ${index < answered.size ? "border-accent bg-accent text-white" : "border-bg/20"}`}>{index < answered.size ? "✓" : index + 1}</span><span>{item}</span></div>)}
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-8">
        <Progress current={current} answered={answered} />
        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="eyebrow">Question {current + 1} of {QUESTIONS.length}</div>
          <button type="button" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0} className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-ink-muted hover:bg-surface-2 disabled:opacity-30"><ArrowIcon direction="left" /> Back</button>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-ink sm:text-2xl">{question.title}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{question.detail}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {question.options.map((option) => {
            const active = answers[question.key] === option.value;
            return <button key={option.value} type="button" onClick={() => choose(option.value)} aria-pressed={active} className={`min-h-[84px] rounded-2xl border p-4 text-left transition-spring hover:-translate-y-0.5 ${active ? "border-accent bg-accent/10 shadow-glow" : "border-line bg-bg/45 hover:border-accent/45 hover:bg-surface-2"}`}><span className="block text-sm font-semibold text-ink">{option.label}</span><span className="mt-1.5 block text-xs leading-5 text-ink-faint">{option.hint}</span></button>;
          })}
        </div>
        {complete ? <button type="button" onClick={onComplete} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow hover:bg-accent-soft sm:w-auto">See my advisory plan <ArrowIcon /></button> : null}
      </div>
    </section>
  );
}

function ProfileSummary({ profile, onRetake, locked = false }) {
  return (
    <section className="relative overflow-hidden rounded-[1.7rem] border border-line bg-ink p-5 text-bg shadow-float sm:p-7">
      <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bg/55">{locked ? "Your approved profile" : "Your provisional profile"}</div>
          <div className="mt-3 flex flex-wrap items-end gap-3"><h2 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{profile.label}</h2><span className="mb-1 rounded-full border border-bg/15 px-3 py-1 text-xs text-bg/70">Risk score {profile.score}/100</span></div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-bg/68">{profile.summary}</p>
          {locked
            ? <Link href="/profile" className="mt-5 inline-flex text-xs font-semibold text-[#83dfca] hover:text-white">Profile changes require approval →</Link>
            : <button type="button" onClick={onRetake} className="mt-5 text-xs font-semibold text-[#83dfca] hover:text-white">Retake profile →</button>}
        </div>
        <div>
          <div className="mb-3 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-bg/50"><span>Illustrative research mix</span><span>100%</span></div>
          <div className="flex h-3 overflow-hidden rounded-full bg-bg/10">{profile.allocation.map((item) => <span key={item.label} className={item.tone} style={{ width: `${item.value}%` }} />)}</div>
          <div className="mt-3 grid grid-cols-3 gap-2">{profile.allocation.map((item) => <div key={item.label}><div className="financial-number text-base font-semibold">{item.value}%</div><div className="mt-1 text-[10px] text-bg/55">{item.label}</div></div>)}</div>
          <p className="mt-3 text-[10px] leading-4 text-bg/45">Category-level research mix, not a personalized asset-allocation instruction.</p>
        </div>
      </div>
    </section>
  );
}

function AccountHandoff({ profile, onRetake }) {
  const callbackUrl = "/advisor?resume=1";
  return (
    <section className="relative overflow-hidden rounded-[1.8rem] border border-line bg-ink p-6 text-bg shadow-float sm:p-8" aria-labelledby="account-handoff-title">
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-pos/25 bg-pos/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8ee3c5]"><span className="h-1.5 w-1.5 rounded-full bg-current" />Profile ready</div>
          <h2 id="account-handoff-title" className="mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Your {profile.label.toLowerCase()} plan is ready.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-bg/68">Sign in or create an account to reveal the matched funds, open the detailed comparison, and continue the advisory dialogue. Your five answers are saved only for this handoff.</p>
          <button type="button" onClick={onRetake} className="mt-5 text-xs font-semibold text-[#83dfca] hover:text-white">Change my answers →</button>
        </div>
        <div className="rounded-[1.4rem] border border-bg/10 bg-bg/[0.06] p-4 sm:p-5">
          <div className="eyebrow text-bg/45">Continue into MFPulse</div>
          <div className="mt-4 grid gap-3">
            <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow hover:bg-accent-soft">Sign in and continue</Link>
            <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-bg/20 bg-bg/[0.04] px-5 text-sm font-semibold text-bg hover:border-[#83dfca]/50 hover:text-[#83dfca]">Create a free account</Link>
          </div>
          <p className="mt-4 text-center text-[10px] leading-4 text-bg/45">Your advisory answers will be restored after authentication.</p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, suffix = "" }) {
  const missing = value == null || !Number.isFinite(Number(value));
  return <div><div className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">{label}</div><div className={`financial-number mt-1 text-sm font-semibold ${missing ? "text-missing" : "text-ink"}`}>{missing ? "Unavailable" : `${Number(value).toFixed(2)}${suffix}`}</div></div>;
}

function ShortlistCard({ fund, selected, onToggle, rank }) {
  return (
    <article className={`relative flex h-full flex-col rounded-[1.45rem] border p-5 transition-spring ${selected ? "border-accent bg-accent/5 shadow-glow" : "border-line bg-surface hover:-translate-y-1 hover:border-accent/35"}`}>
      <div className="flex items-start justify-between gap-3"><div><div className="eyebrow text-accent">Match {rank} · {fund.fitScore}/100 fit</div><h3 className="mt-2 text-base font-semibold leading-snug text-ink">{fund.shortName}</h3><p className="mt-1 text-xs text-ink-faint">{fund.amc} · {fund.category}</p></div><button type="button" onClick={() => onToggle(fund.code)} aria-pressed={selected} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-base ${selected ? "border-accent bg-accent text-white" : "border-line text-ink-faint hover:border-accent hover:text-accent"}`} aria-label={`${selected ? "Remove" : "Add"} ${fund.shortName} ${selected ? "from" : "to"} comparison`}>{selected ? "✓" : "+"}</button></div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-y border-line/70 py-4"><Metric label="3Y return" value={fund.r3y} suffix="%" /><Metric label="Volatility" value={fund.vol90} suffix="%" /><Metric label="Max drawdown" value={fund.maxdd90} suffix="%" /></div>
      <ul className="mt-4 space-y-2 text-xs leading-5 text-ink-muted">{fund.reasons.slice(0, 2).map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span>{reason}</span></li>)}</ul>
      <Link href={`/fund/${fund.code}`} className="mt-auto pt-5 text-xs font-semibold text-accent hover:text-accent-soft">Inspect full evidence →</Link>
    </article>
  );
}

function ComparisonTable({ funds }) {
  if (funds.length < 2) return <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">Select at least two shortlist cards to compare their observed evidence.</div>;
  const rows = [
    ["1-year return", "r1y", "%"],
    ["3-year annualized", "r3y", "%"],
    ["5-year annualized", "r5y", "%"],
    ["90-day volatility", "vol90", "%"],
    ["90-day max drawdown", "maxdd90", "%"],
    ["Return consistency", "consistency", "/100"],
    ["Category percentile", "catPct", "th"],
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-surface-2"><tr><th className="px-4 py-4 text-left text-[10px] uppercase tracking-wider text-ink-faint">Evidence</th>{funds.map((fund) => <th key={fund.code} className="border-l border-line px-4 py-4 text-left text-xs font-semibold text-ink">{fund.shortName}</th>)}</tr></thead>
        <tbody>{rows.map(([label, key, suffix]) => <tr key={key} className="border-t border-line"><th className="px-4 py-3 text-left text-xs font-medium text-ink-muted">{label}</th>{funds.map((fund) => <td key={fund.code} className="financial-number border-l border-line px-4 py-3 text-ink">{Number.isFinite(fund[key]) ? `${Number(fund[key]).toFixed(key === "consistency" || key === "catPct" ? 0 : 2)}${suffix}` : "Unavailable"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function AdvisoryDialogue({ profile, funds }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState(() => [{ id: "intro", role: "assistant", text: `I have matched ${funds.length} research candidates to your ${profile.label.toLowerCase()} profile. Ask about risk, returns, horizon, tax, or why a fund ranked where it did.` }]);

  function ask(text) {
    const clean = text.trim();
    if (!clean) return;
    const answer = answerAdvisoryQuestion(clean, { profile, funds });
    setMessages((items) => [...items, { id: `${Date.now()}-q`, role: "user", text: clean }, { id: `${Date.now()}-a`, role: "assistant", text: answer }]);
    setQuestion("");
  }

  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-line bg-surface shadow-glass" aria-labelledby="dialogue-heading">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-surface-2 px-5 py-4"><div><div className="eyebrow text-accent">Step 3 · Advisory dialogue</div><h2 id="dialogue-heading" className="mt-1 text-base font-semibold text-ink">Ask about the trade-offs</h2></div><span className="rounded-full border border-pos/25 bg-pos/10 px-3 py-1 text-[10px] font-semibold text-pos">Evidence mode</span></div>
      <div className="max-h-[380px] space-y-3 overflow-y-auto p-4 sm:p-5" aria-live="polite">{messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-ink text-bg" : "rounded-bl-md border border-line bg-bg text-ink-muted"}`}>{message.text}</div></div>)}</div>
      <div className="border-t border-line p-4 sm:p-5">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{QUICK_PROMPTS.map(({ label }) => <button key={label} type="button" onClick={() => ask(label)} className="shrink-0 rounded-full border border-line px-3 py-2 text-[11px] font-semibold text-ink-muted hover:border-accent hover:text-accent">{label}</button>)}</div>
        <form onSubmit={(event) => { event.preventDefault(); ask(question); }} className="flex gap-2"><label htmlFor="advisor-question" className="sr-only">Ask the wealth advisory agent</label><input id="advisor-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask: Which option is steadier?" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent" /><button type="submit" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent text-white hover:bg-accent-soft" aria-label="Send question"><ArrowIcon /></button></form>
      </div>
    </section>
  );
}

export default function WealthAdvisorWorkspace({ candidates, asOf, requireAccount = false, resumeDraft = false }) {
  const { status } = useSession();
  const [answers, setAnswers] = useState({});
  const [profile, setProfile] = useState(null);
  const [accountHandoff, setAccountHandoff] = useState(false);
  const [restoringDraft, setRestoringDraft] = useState(resumeDraft);
  const shortlist = useMemo(() => profile ? buildShortlist(candidates, profile, 3) : [], [candidates, profile]);
  const alternatives = useMemo(() => {
    if (!profile) return [];
    const shortlisted = new Set(shortlist.map((fund) => fund.code));
    return rankFundsForProfile(candidates, profile).filter((fund) => !shortlisted.has(fund.code)).slice(0, 5);
  }, [candidates, profile, shortlist]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const comparedFunds = useMemo(() => shortlist.filter((fund) => selectedCodes.includes(fund.code)), [shortlist, selectedCodes]);

  useEffect(() => {
    if (!resumeDraft) return;
    try {
      const stored = window.sessionStorage.getItem(ADVISORY_DRAFT_KEY);
      const draft = stored ? JSON.parse(stored) : null;
      if (draft?.version === 1 && draft.answers) {
        const restoredProfile = buildRiskProfile(draft.answers);
        const restoredShortlist = buildShortlist(candidates, restoredProfile, 3);
        setAnswers(draft.answers);
        setProfile(restoredProfile);
        setSelectedCodes(restoredShortlist.map((fund) => fund.code));
        window.sessionStorage.removeItem(ADVISORY_DRAFT_KEY);
      }
    } catch {
      window.sessionStorage.removeItem(ADVISORY_DRAFT_KEY);
    } finally {
      setRestoringDraft(false);
    }
  }, [candidates, resumeDraft]);

  useEffect(() => {
    if (status !== "authenticated" || resumeDraft) return;
    let active = true;
    getResearchProfile().then((savedProfile) => {
      if (!active || !savedProfile?.advisoryAnswers) return;
      const approvedProfile = buildRiskProfile(savedProfile.advisoryAnswers);
      const approvedShortlist = buildShortlist(candidates, approvedProfile, 3);
      setAnswers(savedProfile.advisoryAnswers);
      setProfile(approvedProfile);
      setSelectedCodes(approvedShortlist.map((fund) => fund.code));
    }).catch(() => {
      /* The questionnaire remains available if the governed cloud profile cannot be loaded. */
    });
    return () => { active = false; };
  }, [candidates, resumeDraft, status]);

  function completeProfile() {
    const nextProfile = buildRiskProfile(answers);
    const nextShortlist = buildShortlist(candidates, nextProfile, 3);
    if (requireAccount && status !== "authenticated") {
      window.sessionStorage.setItem(ADVISORY_DRAFT_KEY, JSON.stringify({ version: 1, answers, createdAt: new Date().toISOString() }));
      setProfile(nextProfile);
      setAccountHandoff(true);
      requestAnimationFrame(() => document.getElementById("advisory-account-handoff")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    setProfile(nextProfile);
    setSelectedCodes(nextShortlist.map((fund) => fund.code));
    requestAnimationFrame(() => document.getElementById("advisory-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function retake() {
    setProfile(null);
    setAccountHandoff(false);
    setSelectedCodes([]);
    requestAnimationFrame(() => document.getElementById("advisory-questionnaire")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function toggleFund(code) {
    setSelectedCodes((codes) => codes.includes(code) ? codes.filter((item) => item !== code) : codes.length < 4 ? [...codes, code] : codes);
  }

  if (restoringDraft) return <div className="rounded-[1.8rem] border border-line bg-surface p-8 text-center text-sm text-ink-muted shadow-float">Restoring your advisory profile…</div>;

  if (accountHandoff && profile) return <div id="advisory-account-handoff" className="scroll-mt-32"><AccountHandoff profile={profile} onRetake={retake} /></div>;

  if (!profile) return <div id="advisory-questionnaire" className="scroll-mt-32"><Questionnaire answers={answers} setAnswers={setAnswers} onComplete={completeProfile} /></div>;

  return (
    <div id="advisory-results" className="scroll-mt-32 space-y-8">
      <ProfileSummary profile={profile} onRetake={retake} locked={status === "authenticated"} />

      <section aria-labelledby="shortlist-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="eyebrow text-accent">Step 2 · Product comparison</div><h2 id="shortlist-heading" className="section-title mt-2">A shortlist with reasons—not a black-box winner</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Each match combines portfolio role, category-relative standing, return consistency, risk, and available history. Select two or more to compare.</p></div><div className="text-xs text-ink-faint">AMFI NAV observations · {asOf}</div></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">{shortlist.map((fund, index) => <ShortlistCard key={fund.code} fund={fund} rank={index + 1} selected={selectedCodes.includes(fund.code)} onToggle={toggleFund} />)}</div>
      </section>

      <section aria-labelledby="comparison-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="eyebrow">Side-by-side evidence</div><h2 id="comparison-heading" className="section-title mt-2">See return and risk in the same frame</h2></div>{comparedFunds.length >= 2 ? <Link href={`/compare?mode=funds&funds=${comparedFunds.map((fund) => fund.code).join(",")}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-xs font-semibold text-ink hover:border-accent hover:text-accent">Open detailed comparison <ArrowIcon /></Link> : null}</div>
        <ComparisonTable funds={comparedFunds} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <AdvisoryDialogue profile={profile} funds={shortlist} />
        <aside className="rounded-[1.6rem] border border-line bg-surface p-5 shadow-glass"><div className="eyebrow">Other research candidates</div><h2 className="mt-2 text-base font-semibold text-ink">Useful alternatives</h2><p className="mt-2 text-xs leading-5 text-ink-faint">These scored next for the same profile. They are not hidden; open one to inspect its full evidence.</p><div className="mt-4 divide-y divide-line">{alternatives.map((fund) => <Link key={fund.code} href={`/fund/${fund.code}`} className="flex items-center justify-between gap-3 py-3 group"><div className="min-w-0"><div className="truncate text-sm font-semibold text-ink group-hover:text-accent">{fund.shortName}</div><div className="mt-1 truncate text-[11px] text-ink-faint">{fund.category} · {fund.fitScore}/100 fit</div></div><span className="text-ink-faint">→</span></Link>)}</div></aside>
      </div>

      <section className="rounded-2xl border border-warn/25 bg-warn/5 p-4 text-xs leading-5 text-ink-muted"><strong className="text-ink">Important:</strong> This is an educational, provisional suitability screen based only on the answers above and observed fund data. It does not consider income, liabilities, insurance, taxes, existing holdings, or regulatory suitability requirements. It does not execute investments or generate buy/sell instructions.</section>
    </div>
  );
}
