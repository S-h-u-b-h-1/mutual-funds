"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

const inputClass =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint shadow-sm transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10";
const buttonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-55";
const oauthButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-line bg-surface px-5 text-sm font-semibold text-ink-muted shadow-sm transition hover:border-accent/40 hover:text-ink disabled:opacity-50";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [providers, setProviders] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({}));
  }, []);

  async function handleCredentials(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (result?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  async function handleMagicLink(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    await signIn("resend", { email: magicEmail, redirect: false, callbackUrl });
    setBusy(false);
    setMagicSent(true);
  }

  return (
    <main className="container-px mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl items-center gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
      <section className="rounded-[2rem] border border-line bg-ink p-7 text-bg shadow-float sm:p-9">
        <div className="eyebrow text-accent-soft">Secure workspace</div>
        <h1 className="mt-4 text-4xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-5xl">Welcome back to MF Pulse.</h1>
        <p className="mt-5 text-sm leading-6 text-bg/72">
          Sign in to unlock your personal dashboard, portfolio workspace, and saved analysis. Fund research, comparisons, and market news are already open — no account required.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            ["Private", "Workspace gated behind your account."],
            ["Personalized", "Profile context tunes the frontend experience."],
            ["Clean", "Navbar uses a compact profile chip after sign in."],
          ].map(([title, detail]) => (
            <div key={title} className="rounded-2xl bg-white/[0.06] p-4">
              <div className="text-sm font-semibold text-bg">{title}</div>
              <div className="mt-1 text-xs leading-5 text-bg/62">{detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface p-5 shadow-float sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow text-accent">Research account</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">Sign in</h2>
          </div>
          <a href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-sm font-semibold text-ink-muted hover:text-ink">Create account</a>
        </div>

        {providers?.google || providers?.github ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {providers.google && (
              <button type="button" className={oauthButtonClass} disabled={busy} onClick={() => signIn("google", { callbackUrl })}>
                Continue with Google
              </button>
            )}
            {providers.github && (
              <button type="button" className={oauthButtonClass} disabled={busy} onClick={() => signIn("github", { callbackUrl })}>
                Continue with GitHub
              </button>
            )}
          </div>
        ) : null}

        <form onSubmit={handleCredentials} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-ink">Email<input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-2`} /></label>
          <label className="block text-sm font-semibold text-ink">Password<input type="password" autoComplete="current-password" required placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-2`} /></label>
          {error && <p role="alert" className="rounded-2xl border border-neg/25 bg-neg/10 px-4 py-3 text-sm text-neg">{error}</p>}
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Signing in…" : "Sign in and continue"}</button>
        </form>

        <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm text-ink-muted">
          <a href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="hover:text-ink">New user? Create profile</a>
          <a href="/forgot-password" className="hover:text-ink">Forgot password?</a>
        </div>

        {providers?.resend && (
          <div className="mt-7 border-t border-line pt-6">
            {magicSent ? (
              <p className="rounded-2xl bg-pos/10 px-4 py-3 text-sm text-pos">Check {magicEmail} for a sign-in link.</p>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-3">
                <p className="text-sm font-semibold text-ink">Or use a magic link</p>
                <label className="block text-sm font-semibold text-ink">Email<input type="email" autoComplete="email" required placeholder="you@example.com" value={magicEmail} onChange={(e) => setMagicEmail(e.target.value)} className={`${inputClass} mt-2`} /></label>
                <button type="submit" disabled={busy} className={oauthButtonClass}>Send sign-in link</button>
              </form>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
