"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent";
const buttonClass =
  "w-full rounded-lg bg-accent px-3 py-2 font-medium text-white hover:bg-accent-soft disabled:opacity-50";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
      return;
    }
    router.push("/login");
  }

  if (!token || !email) {
    return <p role="alert" className="text-sm text-neg">This reset link is invalid. Request a new one from the forgot-password page.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm text-ink">New password<input
        type="password"
        required
        minLength={8}
        placeholder="New password (min. 8 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      /></label>
      <label className="block text-sm text-ink">Confirm password<input
        type="password"
        required
        minLength={8}
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={inputClass}
      /></label>
      {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Updating…" : "Set new password"}</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="container-px mx-auto max-w-md py-12 sm:py-20">
      <div className="eyebrow text-accent">Account security</div>
      <h1 className="page-title mt-3 mb-8">Choose a new password.</h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
