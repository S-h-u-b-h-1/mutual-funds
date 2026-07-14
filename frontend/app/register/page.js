"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { DEFAULT_PROFILE, PROFILE_OPTIONS } from "../lib/userProfile";
import { saveResearchProfile } from "../lib/cloudSync";

const inputClass =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint shadow-sm transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";
const buttonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-55";

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

export default function RegisterPage() {
  const router = useRouter();
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("callbackUrl");
    if (next) setCallbackUrl(next);
  }, []);

  function updateProfile(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (!profile.role || !profile.primaryGoal || !profile.experience || !profile.riskComfort || !profile.horizon) {
      setError("Complete the profile questions to unlock the research workspace.");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error || "Something went wrong.");
      setBusy(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setBusy(false);
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    // Signed in now, so this reaches the cloud save (not just the local fallback) — session
    // must exist first, which is why this runs after signIn() resolves, not before it.
    await saveResearchProfile({ email }, profile);

    setBusy(false);
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="container-px mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl items-center gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
      <section className="rounded-[2rem] border border-line bg-ink p-7 text-bg shadow-float sm:p-9">
        <div className="eyebrow text-accent-soft">MF Pulse access</div>
        <h1 className="mt-4 text-4xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-5xl">Create your research profile.</h1>
        <p className="mt-5 text-sm leading-6 text-bg/72">
          Signup now captures the context MF Pulse needs: who you are, what you research, your experience, risk comfort, and horizon. The backend account remains unchanged.
        </p>
        <div className="mt-8 grid gap-3 text-sm">
          {["Unlock all research pages after sign in", "Keep navbar identity compact and clean", "Personalize portfolio and fund-fit surfaces"].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3">
              <span className="h-2 w-2 rounded-full bg-pos" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface p-5 shadow-float sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow text-accent">Personal research account</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Sign up</h2>
          </div>
          <a href="/login" className="text-sm font-semibold text-ink-muted hover:text-ink">Already have an account?</a>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">Name<input type="text" autoComplete="name" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-2`} /></label>
            <label className="block text-sm font-semibold text-ink">Email<input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-2`} /></label>
          </div>

          <label className="block text-sm font-semibold text-ink">Password
            <input type="password" required minLength={8} placeholder="Password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-2`} />
          </label>

          <ChoiceGroup label="What best describes you?" value={profile.role} options={PROFILE_OPTIONS.roles} onChange={(value) => updateProfile("role", value)} />
          <ChoiceGroup label="Primary goal" value={profile.primaryGoal} options={PROFILE_OPTIONS.goals} onChange={(value) => updateProfile("primaryGoal", value)} />

          <div className="grid gap-5 lg:grid-cols-2">
            <ChoiceGroup label="Experience level" value={profile.experience} options={PROFILE_OPTIONS.experience} onChange={(value) => updateProfile("experience", value)} />
            <ChoiceGroup label="Risk comfort" value={profile.riskComfort} options={PROFILE_OPTIONS.risk} onChange={(value) => updateProfile("riskComfort", value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">Investment horizon
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
            <input type="text" placeholder="Large cap, flexi cap, ELSS…" value={profile.preferredCategories} onChange={(e) => updateProfile("preferredCategories", e.target.value)} className={`${inputClass} mt-2`} />
          </label>

          {error && <p role="alert" className="rounded-2xl border border-neg/25 bg-neg/10 px-4 py-3 text-sm text-neg">{error}</p>}
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Creating account…" : "Create account and unlock workspace"}</button>
        </form>
      </section>
    </main>
  );
}
