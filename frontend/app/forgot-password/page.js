"use client";

import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent";
const buttonClass =
  "w-full rounded-lg bg-accent px-3 py-2 font-medium text-white hover:bg-accent-soft disabled:opacity-50";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    setSent(true); // Always shown regardless of outcome — the API itself never reveals whether the email exists.
  }

  return (
    <main className="container-px mx-auto max-w-md py-12 sm:py-20">
      <div className="eyebrow text-accent">Account recovery</div>
      <h1 className="page-title mt-3">Reset your password.</h1>
      {sent ? (
        <p className="text-sm text-ink-muted">
          If an account exists for {email}, a reset link has been sent. It expires in 1 hour.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block text-sm text-ink">Email<input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
      <p className="text-sm text-ink-muted mt-3">
        <a href="/login" className="hover:text-ink">Back to sign in</a>
      </p>
    </main>
  );
}
