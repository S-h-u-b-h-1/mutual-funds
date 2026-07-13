"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DEFAULT_PROFILE, PROFILE_OPTIONS, getStoredProfile, optionLabel, saveStoredProfile } from "../lib/userProfile";

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

export default function ProfileForm({ mode = "setup", callbackUrl = "/dashboard" }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState({ ...DEFAULT_PROFILE });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.user) return;
    setProfile({ ...DEFAULT_PROFILE, ...(getStoredProfile(session.user) || {}) });
  }, [session]);

  function updateProfile(key, value) {
    setSaved(false);
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!profile.role || !profile.primaryGoal || !profile.experience || !profile.riskComfort || !profile.horizon) {
      setError("Complete every required profile field before continuing.");
      return;
    }
    saveStoredProfile(session.user, profile);
    setSaved(true);
    if (mode === "setup") {
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
            These fields personalize the frontend workspace. They are stored on this device and do not change backend account schema.
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
      {saved && mode !== "setup" && <p role="status" className="mt-5 rounded-2xl border border-pos/25 bg-pos/10 px-4 py-3 text-sm text-pos">Profile saved.</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-soft">
          {mode === "setup" ? "Save profile and enter workspace" : "Save profile"}
        </button>
        {mode === "setup" && <a href="/" className="inline-flex min-h-12 items-center rounded-2xl px-4 text-sm font-semibold text-ink-muted hover:text-ink">Return to landing page</a>}
      </div>
    </form>
  );
}
