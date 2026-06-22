"use client";
// Behavioural event tracking -> Supabase user_events (public-insert RLS policy).
// This is the analytics dataset the project is built to showcase.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function sessionId() {
  try {
    let id = localStorage.getItem("mfp_sid");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      localStorage.setItem("mfp_sid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function track(eventType, payload = {}) {
  try {
    fetch(`${URL}/rest/v1/user_events`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ session_id: sessionId(), event_type: eventType, payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let tracking break the page */
  }
}
