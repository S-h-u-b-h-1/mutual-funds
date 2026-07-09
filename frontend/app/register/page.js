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
    <div className="container-px py-16 max-w-sm mx-auto">
      <h1 className="text-xl font-semibold text-ink mb-6">Create your MF Pulse account</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min. 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>Create account</button>
      </form>
      <p className="text-sm text-ink-muted mt-3">
        Already have an account? <a href="/login" className="hover:text-ink">Sign in</a>
      </p>
    </div>
  );
}
