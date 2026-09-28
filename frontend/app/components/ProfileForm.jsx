"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ADVISORY_QUESTIONS, advisoryAnswerLabel, researchProfileFromAdvisoryAnswers } from "../lib/advisoryEngine";
import { getProfileGovernanceState, requestResearchProfileChange, saveResearchProfile } from "../lib/cloudSync";
import { DEFAULT_PROFILE, PROFILE_OPTIONS, getStoredProfile, optionLabel } from "../lib/userProfile";

const inputClass =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint shadow-sm transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";

function ChoiceGroup({ label, value, options, onChange }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map(([key, text]) => (
          <button key={key} type="button" onClick={() => onChange(key)} aria-pressed={value === key} className={`min-h-11 rounded-2xl border px-3 text-left text-sm font-medium transition ${value === key ? "border-accent bg-accent/12 text-accent" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"}`}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ProfileFacts({ profile }) {
  const riskLabels = { conservative: "Cautious", balanced: "Balanced", growth: "Growth-oriented" };
  const facts = [
    ["Advisory profile", riskLabels[profile.riskProfile] || optionLabel("risk", profile.riskComfort)],
    ["Risk score", Number.isFinite(Number(profile.riskScore)) ? `${profile.riskScore}/100` : "Not recorded"],
    ["Primary goal", profile.advisoryAnswers ? advisoryAnswerLabel("goal", profile.advisoryAnswers.goal) : optionLabel("goals", profile.primaryGoal)],
    ["Time horizon", profile.advisoryAnswers ? advisoryAnswerLabel("horizon", profile.advisoryAnswers.horizon) : optionLabel("horizons", profile.horizon)],
    ["Market-decline response", profile.advisoryAnswers ? advisoryAnswerLabel("reaction", profile.advisoryAnswers.reaction) : "Not recorded"],
    ["Financial capacity", profile.advisoryAnswers ? advisoryAnswerLabel("capacity", profile.advisoryAnswers.capacity) : "Not recorded"],
    ["Experience", profile.advisoryAnswers ? advisoryAnswerLabel("experience", profile.advisoryAnswers.experience) : optionLabel("experience", profile.experience)],
    ["Portfolio size", optionLabel("aumBands", profile.aumBand)],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {facts.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-line bg-bg/45 p-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</dt>
          <dd className="mt-2 text-sm font-semibold leading-5 text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReassessmentForm({ currentProfile, onSubmitted, onCancel }) {
  const [answers, setAnswers] = useState(currentProfile.advisoryAnswers || {});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!ADVISORY_QUESTIONS.every((question) => answers[question.key] != null)) {
      setError("Complete all five reassessment questions.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const requestedProfile = {
        ...researchProfileFromAdvisoryAnswers(answers),
        aumBand: currentProfile.aumBand || "not-specified",
        preferredCategories: currentProfile.preferredCategories || "",
      };
      const result = await requestResearchProfileChange(requestedProfile, reason);
      onSubmitted(result.request);
    } catch (requestError) {
      setError(requestError.message || "The request could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-[1.6rem] border border-accent/25 bg-accent/[0.04] p-5 sm:p-6">
      <div className="eyebrow text-accent">Profile reassessment request</div>
      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-ink">Propose updated answers for review</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Your current profile remains active. An advisor or administrator must approve this reassessment before any recommendation or comparison uses it.</p>
      <div className="mt-6 grid gap-5">
        {ADVISORY_QUESTIONS.map((question) => (
          <label key={question.key} className="block text-sm font-semibold text-ink">
            {question.title}
            <select value={answers[question.key] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: question.key === "goal" ? event.target.value : Number(event.target.value) }))} required className={`${inputClass} mt-2`}>
              <option value="">Select an answer</option>
              {question.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ))}
        <label className="block text-sm font-semibold text-ink">
          Why has your profile changed? *
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={20} maxLength={1000} required rows={4} placeholder="For example: my investment horizon changed after a new financial commitment…" className={`${inputClass} mt-2 resize-y`} />
          <span className="mt-2 block text-xs font-normal text-ink-faint">This explanation gives the reviewer context. Minimum 20 characters.</span>
        </label>
      </div>
      {error && <p role="alert" className="mt-5 rounded-2xl border border-neg/25 bg-neg/10 px-4 py-3 text-sm text-neg">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow disabled:opacity-60">{busy ? "Submitting…" : "Submit for approval"}</button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-12 items-center rounded-2xl px-4 text-sm font-semibold text-ink-muted hover:text-ink">Cancel</button>
      </div>
    </form>
  );
}

function GovernedProfile({ session }) {
  const [profile, setProfile] = useState(null);
  const [latestRequest, setLatestRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getProfileGovernanceState()
      .then((state) => {
        if (!active) return;
        setProfile(state.profile || getStoredProfile(session.user));
        setLatestRequest(state.latestRequest || null);
      })
      .catch(() => {
        if (!active) return;
        setProfile(getStoredProfile(session.user));
        setError("The governed cloud profile is temporarily unavailable. No changes can be submitted until it reconnects.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [session]);

  if (loading) return <div className="rounded-[2rem] border border-line bg-surface p-7 text-sm text-ink-muted shadow-float">Loading governed profile…</div>;
  if (!profile) return <div className="rounded-[2rem] border border-line bg-surface p-7 text-sm text-ink-muted shadow-float">No completed profile was found. <Link href="/profile/setup" className="font-semibold text-accent">Complete profile setup →</Link></div>;

  const pending = latestRequest?.status === "pending";
  return (
    <section className="rounded-[2rem] border border-line bg-surface p-5 shadow-float sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line/70 pb-5">
        <div><div className="eyebrow text-accent">Governed advisory profile</div><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Your saved metrics and goals</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">This profile is locked because it shapes your suitability screen and fund comparisons. It cannot be overwritten from this page.</p></div>
        <div className="rounded-full border border-pos/25 bg-pos/10 px-4 py-2 text-xs font-semibold text-pos">Locked and active</div>
      </div>
      <div className="mt-6"><ProfileFacts profile={profile} /></div>
      <div className="mt-5 rounded-2xl border border-line bg-surface-2 p-4 text-xs leading-5 text-ink-muted">Signed in as <strong className="text-ink">{session.user?.email || session.user?.name}</strong>. Your current profile stays active while a change request is reviewed.</div>
      {error && <p role="alert" className="mt-5 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">{error}</p>}
      {pending ? (
        <div className="mt-6 rounded-[1.4rem] border border-warn/25 bg-warn/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow text-warn">Approval pending</div><h3 className="mt-2 text-lg font-semibold text-ink">Your requested reassessment is under review</h3></div><span className="rounded-full border border-warn/25 px-3 py-1 text-xs font-semibold text-warn">Pending</span></div>
          <p className="mt-3 text-sm leading-6 text-ink-muted">{latestRequest.reason}</p>
          <div className="mt-4"><ProfileFacts profile={latestRequest.requestedProfile} /></div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setShowRequest(true)} disabled={showRequest || Boolean(error)} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 px-5 text-sm font-semibold text-accent hover:bg-accent/15 disabled:opacity-50">Request a profile change</button>
          {latestRequest?.status === "rejected" && <span className="text-xs text-ink-muted">Last request was not approved{latestRequest.reviewNote ? `: ${latestRequest.reviewNote}` : "."}</span>}
          {latestRequest?.status === "approved" && <span className="text-xs text-pos">Your latest approved profile is active.</span>}
        </div>
      )}
      {showRequest && !pending && <ReassessmentForm currentProfile={profile} onSubmitted={(request) => { setLatestRequest(request); setShowRequest(false); }} onCancel={() => setShowRequest(false)} />}
    </section>
  );
}

function SetupProfile({ session, callbackUrl }) {
  const router = useRouter();
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...(getStoredProfile(session.user) || {}) }));
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");

  function updateProfile(key, value) {
    setSaveState("idle");
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!profile.role || !profile.primaryGoal || !profile.experience || !profile.riskComfort || !profile.horizon) {
      setError("Complete every required profile field before continuing.");
      return;
    }
    setError("");
    setSaveState("saving");
    const { syncState } = await saveResearchProfile(session.user, profile);
    setSaveState(syncState);
    if (syncState === "failed") {
      setError("Nothing saved—check your connection and try again.");
      return;
    }
    router.push(callbackUrl || "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] border border-line bg-surface p-5 shadow-float sm:p-7">
      <div className="border-b border-line/70 pb-5"><div className="eyebrow text-accent">Required setup</div><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Complete your investor context</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Your first completed profile is saved to your account and then locked. Later updates must go through an approval request.</p></div>
      <div className="mt-6 grid gap-5">
        <ChoiceGroup label="What best describes you? *" value={profile.role} options={PROFILE_OPTIONS.roles} onChange={(value) => updateProfile("role", value)} />
        <ChoiceGroup label="Primary research goal *" value={profile.primaryGoal} options={PROFILE_OPTIONS.goals} onChange={(value) => updateProfile("primaryGoal", value)} />
        <div className="grid gap-5 lg:grid-cols-2"><ChoiceGroup label="Experience level *" value={profile.experience} options={PROFILE_OPTIONS.experience} onChange={(value) => updateProfile("experience", value)} /><ChoiceGroup label="Risk comfort *" value={profile.riskComfort} options={PROFILE_OPTIONS.risk} onChange={(value) => updateProfile("riskComfort", value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">Investment horizon *<select value={profile.horizon} onChange={(event) => updateProfile("horizon", event.target.value)} required className={`${inputClass} mt-2`}><option value="">Select horizon</option>{PROFILE_OPTIONS.horizons.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
          <label className="block text-sm font-semibold text-ink">Portfolio size<select value={profile.aumBand} onChange={(event) => updateProfile("aumBand", event.target.value)} className={`${inputClass} mt-2`}>{PROFILE_OPTIONS.aumBands.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
        </div>
        <label className="block text-sm font-semibold text-ink">Categories you care about<input type="text" value={profile.preferredCategories || ""} onChange={(event) => updateProfile("preferredCategories", event.target.value)} className={`${inputClass} mt-2`} /></label>
      </div>
      {error && <p role="alert" className="mt-5 rounded-2xl border border-neg/25 bg-neg/10 px-4 py-3 text-sm text-neg">{error}</p>}
      {saveState === "local-only" && <p role="status" className="mt-5 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">Saved on this device only. Cloud governance will activate when sync reconnects.</p>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="submit" disabled={saveState === "saving"} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow disabled:opacity-60">{saveState === "saving" ? "Saving…" : "Save and lock profile"}</button><Link href="/" className="inline-flex min-h-12 items-center px-4 text-sm font-semibold text-ink-muted hover:text-ink">Return to landing page</Link></div>
    </form>
  );
}

export default function ProfileForm({ mode = "setup", callbackUrl = "/dashboard" }) {
  const { data: session, status } = useSession();
  if (status === "loading") return <div className="rounded-[2rem] border border-line bg-surface p-7 text-sm text-ink-muted shadow-float">Loading profile…</div>;
  if (!session) return <div className="rounded-[2rem] border border-line bg-surface p-7 text-sm text-ink-muted shadow-float">Sign in to manage your profile.</div>;
  return mode === "edit" ? <GovernedProfile session={session} /> : <SetupProfile session={session} callbackUrl={callbackUrl} />;
}
