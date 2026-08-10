"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const inputClass =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint shadow-sm transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";
const buttonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-55";

function safeCallback(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default function RegisterPage() {
  const router = useRouter();
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCallbackUrl(safeCallback(new URLSearchParams(window.location.search).get("callbackUrl")));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      let body = {};
      try { body = await response.json(); } catch {}

      if (!response.ok) {
        setError(body.error || "Account creation is temporarily unavailable. Please try again.");
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}&created=1`);
        return;
      }

      router.push(`/profile/setup?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      router.refresh();
    } catch {
      setError("We could not reach the account service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container-px mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl items-center gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
      <section className="rounded-[2rem] border border-line bg-ink p-7 text-bg shadow-float sm:p-9">
        <div className="eyebrow text-accent-soft">MF Pulse account</div>
        <h1 className="mt-4 text-4xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-5xl">Create your account in a minute.</h1>
        <p className="mt-5 text-sm leading-6 text-bg/72">
          Start with the essentials. After your account is ready, a short profile setup personalizes your dashboard and portfolio tools.
        </p>
        <div className="mt-8 grid gap-3 text-sm">
          {["Save watchlists and research", "Sync your workspace across devices", "Keep portfolio tools private"].map((item) => (
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
            <div className="eyebrow text-accent">New account</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Sign up</h2>
          </div>
          <a href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-sm font-semibold text-ink-muted hover:text-ink">Already have an account?</a>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-ink">Name
            <input type="text" autoComplete="name" required maxLength={200} placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-2`} />
          </label>
          <label className="block text-sm font-semibold text-ink">Email
            <input type="email" autoComplete="email" required maxLength={320} placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} className={`${inputClass} mt-2`} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink">Password
              <input type="password" autoComplete="new-password" required minLength={8} maxLength={200} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} mt-2`} />
            </label>
            <label className="block text-sm font-semibold text-ink">Confirm password
              <input type="password" autoComplete="new-password" required minLength={8} maxLength={200} placeholder="Repeat password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={`${inputClass} mt-2`} />
            </label>
          </div>

          {error && <p role="alert" className="rounded-2xl border border-neg/25 bg-neg/10 px-4 py-3 text-sm text-neg">{error}</p>}
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Creating account…" : "Create account"}</button>
          <p className="text-center text-xs leading-5 text-ink-faint">You&rsquo;ll complete your research preferences on the next screen.</p>
        </form>
      </section>
    </main>
  );
}
