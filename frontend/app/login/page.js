"use client";

// Intentionally minimal/unstyled beyond the app's existing base tokens (bg/ink/surface/line) —
// Antigravity owns the design system; this page exists only so the Auth.js backend (auth.js)
// has somewhere for a human to actually sign in. See auth.js for provider registration.
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { migrateLocalDataToCloud } from "../lib/migrateLocalData";

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
    migrateLocalDataToCloud(); // fire-and-forget — no-ops instantly for already-migrated users
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
    <div className="container-px py-16 max-w-sm mx-auto">
      <h1 className="text-xl font-semibold text-ink mb-6">Sign in to MF Pulse</h1>

      {providers?.google || providers?.github ? (
        <div className="space-y-2 mb-6">
          {providers.google && (
            <button className={oauthButtonClass} disabled={busy} onClick={() => signIn("google", { callbackUrl })}>
              Continue with Google
            </button>
          )}
          {providers.github && (
            <button className={oauthButtonClass} disabled={busy} onClick={() => signIn("github", { callbackUrl })}>
              Continue with GitHub
            </button>
          )}
        </div>
      ) : null}

      <form onSubmit={handleCredentials} className="space-y-3">
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>Sign in</button>
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
              <input type="email" required placeholder="Email" value={magicEmail} onChange={(e) => setMagicEmail(e.target.value)} className={inputClass} />
              <button type="submit" disabled={busy} className={oauthButtonClass}>Send sign-in link</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
