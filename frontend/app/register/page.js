"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent";
const buttonClass =
  "w-full rounded-lg bg-accent px-3 py-2 font-medium text-white hover:bg-accent-soft disabled:opacity-50";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

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
    setBusy(false);
    if (result?.error) {
      // Registered fine, but auto-sign-in failed for some reason — send them to log in manually.
      router.push("/login");
      return;
    }
    // Migration is now a user-confirmed prompt (SyncPrompt.jsx, mounted globally in
    // app/layout.js), not a silent auto-call here — the user gets asked, not just synced.
    router.push("/");
    router.refresh();
  }

  return (
    <main className="container-px mx-auto max-w-md py-12 sm:py-20">
      <div className="eyebrow text-accent">Personal research account</div>
      <h1 className="page-title mt-3">Build a research trail.</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">Save funds, preserve comparisons, and keep portfolio analysis available across devices.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block text-sm text-ink">Name<input type="text" autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm text-ink">Email<input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="block text-sm text-ink">Password
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min. 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        </label>
        {error && <p role="alert" className="text-sm text-neg">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="text-sm text-ink-muted mt-3">
        Already have an account? <a href="/login" className="hover:text-ink">Sign in</a>
      </p>
    </main>
  );
}
