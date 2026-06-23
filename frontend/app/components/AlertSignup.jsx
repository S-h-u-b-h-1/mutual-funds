"use client";
import { useState } from "react";
import { track } from "../lib/track";
import { SUPA } from "../lib/supabase";

// Email capture for daily flow alerts. Logs an `alert_signup` event (the
// behavioural sink). Actual delivery is wired when a Resend key is configured.
export default function AlertSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | ok | err

  function submit(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setState("err");
    // Persist the subscription + log the analytics event. A repeat email hits the
    // UNIQUE constraint (409) which we treat as "already subscribed" — emails stay
    // private (anon has INSERT only, never SELECT).
    fetch(`${SUPA.URL}/rest/v1/alerts`, {
      method: "POST",
      headers: {
        apikey: SUPA.KEY,
        Authorization: `Bearer ${SUPA.KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email, alert_type: "daily_summary" }),
    }).catch(() => {});
    track("alert_signup", { email });
    setState("ok");
    setEmail("");
  }

  return (
    <form className="signup" onSubmit={submit}>
      <div className="signup-copy">
        <h3>Daily flow alerts</h3>
        <p>The headline equity &amp; debt numbers in your inbox each evening. Free.</p>
      </div>
      <div className="signup-row">
        <input
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setState("idle"); }}
          aria-label="Email address"
        />
        <button type="submit">{state === "ok" ? "Subscribed ✓" : "Subscribe"}</button>
      </div>
      {state === "err" && <span className="signup-err">Please enter a valid email.</span>}
    </form>
  );
}
