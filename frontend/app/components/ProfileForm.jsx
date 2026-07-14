"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DEFAULT_PROFILE, PROFILE_OPTIONS, getStoredProfile, optionLabel } from "../lib/userProfile";
import { saveResearchProfile } from "../lib/cloudSync";

const inputClass =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint shadow-sm transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";

function ChoiceGroup({ label, value, options, onChange }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={value === key}
            className={`min-h-11 rounded-2xl border px-3 text-left text-sm font-medium transition ${value === key ? "border-accent bg-accent/12 text-accent shadow-[inset_0_0_0_1px_rgb(var(--color-brand)/0.14)]" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// saveState is one of: 'idle' | 'saving' | 'retrying' | 'synced' | 'local-only' | 'failed'.
// Rendered literally in the UI below — never collapsed into a single generic "saved" message,
// since 'synced' and 'local-only' mean genuinely different things to a user trusting this
// platform with their data (see Production Activation Phase 3).
export default function ProfileForm({ mode = "setup", callbackUrl = "/dashboard" }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState({ ...DEFAULT_PROFILE });
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.user) return;
    setProfile({ ...DEFAULT_PROFILE, ...(getStoredProfile(session.user) || {}) });
  }, [session]);

  function updateProfile(key, value) {
    setSaveState("idle");
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function doSave({ isRetry = false } = {}) {
    setError("");
    setSaveState(isRetry ? "retrying" : "saving");
    const { syncState } = await saveResearchProfile(session.user, profile);
    setSaveState(syncState);
    if (syncState === "failed") {
      setError("Nothing saved — neither your device nor the server could store this. Check your connection and try again.");
    }
    return syncState;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!profile.role || !profile.primaryGoal || !profile.experience || !profile.riskComfort || !profile.horizon) {
      setError("Complete every required profile field before continuing.");
      return;
    }
    const syncState = await doSave();
    if (mode === "setup" && syncState !== "failed") {
      // Local or cloud succeeded — isProfileComplete() will read the local copy and let
      // AuthGate through. If BOTH failed, staying on this page (not redirecting) is the
      // honest outcome: redirecting would just bounce straight back here anyway.
      router.push(callbackUrl || "/dashboard");
      router.refresh();
    }
  }

  if (status === "loading") {
    return <div className="rounded-[2rem] border border-line bg-surface p-7 text-sm text-ink-muted shadow-float">Loading profile…</div>;
  }

  if (!session) {
    return <div className="rounded-[2rem] border border-line bg-surface p-7 text-sm text-ink-muted shadow-float">Sign in to manage your profile.</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[2rem] border border-line bg-surface p-5 shadow-float sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line/70 pb-5">
        <div>
          <div className="eyebrow text-accent">{mode === "setup" ? "Required setup" : "Account profile"}</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{mode === "setup" ? "Complete your investor context" : "Research preferences"}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            These fields personalize the research workspace and are saved to your account, so they follow you across devices.
          </p>
        </div>
        <div className="rounded-2xl bg-surface-2 px-4 py-3 text-xs text-ink-muted">
          Signed in as <span className="font-semibold text-ink">{session.user?.email || session.user?.name}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        <ChoiceGroup label="What best describes you? *" value={profile.role} options={PROFILE_OPTIONS.roles} onChange={(value) => updateProfile("role", value)} />
        <ChoiceGroup label="Primary research goal *" value={profile.primaryGoal} options={PROFILE_OPTIONS.goals} onChange={(value) => updateProfile("primaryGoal", value)} />
        <div className="grid gap-5 lg:grid-cols-2">
          <ChoiceGroup label="Experience level *" value={profile.experience} options={PROFILE_OPTIONS.experience} onChange={(value) => updateProfile("experience", value)} />
          <ChoiceGroup label="Risk comfort *" value={profile.riskComfort} options={PROFILE_OPTIONS.risk} onChange={(value) => updateProfile("riskComfort", value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">Investment horizon *
            <select value={profile.horizon} onChange={(e) => updateProfile("horizon", e.target.value)} required className={`${inputClass} mt-2`}>
              <option value="">Select horizon</option>
              {PROFILE_OPTIONS.horizons.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-ink">Portfolio size
            <select value={profile.aumBand} onChange={(e) => updateProfile("aumBand", e.target.value)} className={`${inputClass} mt-2`}>
              {PROFILE_OPTIONS.aumBands.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </select>
          </label>
        </div>

        <label className="block text-sm font-semibold text-ink">Categories you care about
          <input type="text" placeholder="Large cap, flexi cap, debt, ELSS…" value={profile.preferredCategories || ""} onChange={(e) => updateProfile("preferredCategories", e.target.value)} className={`${inputClass} mt-2`} />
        </label>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Current profile</div>
        <div className="mt-3 grid gap-2 text-sm text-ink-muted sm:grid-cols-2 lg:grid-cols-3">
          <span><b className="text-ink">Role:</b> {optionLabel("roles", profile.role)}</span>
          <span><b className="text-ink">Goal:</b> {optionLabel("goals", profile.primaryGoal)}</span>
          <span><b className="text-ink">Risk:</b> {optionLabel("risk", profile.riskComfort)}</span>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-2xl border border-neg/25 bg-neg/10 px-4 py-3 text-sm text-neg">{error}</p>}

      {saveState === "synced" && (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-2xl border border-pos/25 bg-pos/10 px-4 py-3 text-sm text-pos">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pos" aria-hidden="true" />
          Profile synced — saved to your account and available on any device.
        </p>
      )}
      {saveState === "local-only" && (
        <div role="status" className="mt-5 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
          <p className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
            Saved on this device — cloud sync unavailable. This won&rsquo;t follow you to another device yet.
          </p>
          <button type="button" onClick={() => doSave({ isRetry: true })} className="mt-2 inline-flex min-h-9 items-center rounded-full border border-warn/40 px-3 text-xs font-semibold text-warn hover:bg-warn/10">
            Retry cloud sync
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saveState === "saving" || saveState === "retrying"}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === "saving" ? "Saving…" : saveState === "retrying" ? "Retrying…" : mode === "setup" ? "Save profile and enter workspace" : "Save profile"}
        </button>
        {mode === "setup" && <a href="/" className="inline-flex min-h-12 items-center rounded-2xl px-4 text-sm font-semibold text-ink-muted hover:text-ink">Return to landing page</a>}
      </div>
    </form>
  );
}
