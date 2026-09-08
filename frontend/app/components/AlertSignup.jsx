"use client";
import { useState } from "react";
import { track } from "../lib/track";

// Email capture for daily flow alerts. Persists to `alerts` (anon INSERT only)
// and logs an analytics event. Delivery activates when a Resend key is set.
export default function AlertSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | ok | err
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setState("err");
    setBusy(true);
    setState("idle");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ email, alert_type: "daily_summary" }),
      });
      if (!response.ok) throw new Error("subscription_failed");
      track("alert_signup", { status: "received" });
      setState("ok");
      setEmail("");
    } catch {
      setState("err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="alerts" className="mt-10">
      <form
        onSubmit={submit}
        className="glass relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-5 p-6 sm:p-7"
      >
        <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <h3 className="text-base font-semibold text-ink">Daily flow alerts</h3>
          <p className="mt-1 text-[13px] text-ink-muted">Register interest in daily flow alerts. Email delivery is not active yet.</p>
        </div>
        <div className="relative flex w-full sm:w-auto gap-2">
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setState("idle"); }}
            aria-label="Email address"
            className="flex-1 sm:w-64 rounded-xl border border-line-strong bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-soft whitespace-nowrap shadow-glow disabled:cursor-not-allowed disabled:opacity-55"
          >
            {busy ? "Saving…" : state === "ok" ? "Request received ✓" : "Register interest"}
          </button>
        </div>
        {state === "err" && <span role="alert" className="relative basis-full text-[12px] text-neg">We could not save this subscription. Check the email and your connection, then try again.</span>}
      </form>
    </section>
  );
}
