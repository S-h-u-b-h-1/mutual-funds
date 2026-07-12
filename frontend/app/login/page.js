"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent";
const buttonClass =
  "w-full rounded-lg bg-accent px-3 py-2 font-medium text-white hover:bg-accent-soft disabled:opacity-50";
const oauthButtonClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink hover:border-accent disabled:opacity-50";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

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
    // Migration is now a user-confirmed prompt (SyncPrompt.jsx, mounted globally in
    // app/layout.js), not a silent auto-call here — the user gets asked, not just synced.
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
    <main className="container-px mx-auto max-w-md py-12 sm:py-20">
      <div className="eyebrow text-accent">Research workspace</div>
      <h1 className="page-title mt-3">Welcome back.</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">Sign in to sync watchlists, comparisons, and portfolio research across devices.</p>

      {providers?.google || providers?.github ? (
        <div className="mb-6 mt-8 space-y-2">
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

      <form onSubmit={handleCredentials} className="mt-8 space-y-4">
        <label className="block text-sm text-ink">Email<input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm text-ink">Password<input type="password" autoComplete="current-password" required placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
        {error && <p role="alert" className="text-sm text-neg">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>

      <div className="flex justify-between text-sm text-ink-muted mt-3">
        <a href="/register" className="hover:text-ink">Create an account</a>
        <a href="/forgot-password" className="hover:text-ink">Forgot password?</a>
      </div>

      {providers?.resend && (
        <div className="mt-8 pt-6 border-t border-line">
          {magicSent ? (
            <p className="text-sm text-ink-muted">Check {magicEmail} for a sign-in link.</p>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <p className="text-sm text-ink-muted">Or sign in with a magic link</p>
              <label className="block text-sm text-ink">Email<input type="email" autoComplete="email" required placeholder="you@example.com" value={magicEmail} onChange={(e) => setMagicEmail(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
              <button type="submit" disabled={busy} className={oauthButtonClass}>Send sign-in link</button>
            </form>
          )}
        </div>
      )}
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
